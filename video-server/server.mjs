// Nexo video server: the HyperFrames producer (HTML -> MP4) behind a shared secret. Only the Nexo backend knows
// the secret; the producer has no auth of its own. Routes:
//   POST   /render        {html, fps?, quality?, assets?} -> blocks until done, answers {success, file, ...}
//                         assets: {"narration-1.wav": "<base64>"} are written next to index.html as assets/<name>
//   GET    /files/:name   the rendered MP4
//   DELETE /files/:name   the backend removes the file once it has stored it
//   POST   /lint          {html}                  -> composition problems, without rendering
//   GET    /health        unauthenticated liveness probe
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createProducerApp } from "@hyperframes/producer/server";

const secret = process.env.VIDEO_SERVER_SECRET ?? "";
if (secret.length < 16) {
  console.error("VIDEO_SERVER_SECRET must contain at least 16 characters");
  process.exit(1);
}
const expected = Buffer.from(secret);
const rendersDir = process.env.VIDEO_RENDERS_DIR || "/tmp/nexo-renders";
mkdirSync(rendersDir, { recursive: true });
const FILE_NAME = /^[A-Za-z0-9_-]+\.mp4$/;
const KEEP_FILES_MS = 30 * 60 * 1000;
// The only render options the backend may set; everything else (projectDir, previewUrl, outputPath...) is dropped.
const RENDER_FIELDS = ["html", "fps", "quality", "maxRenderMs"];
const ASSET_NAME = /^[A-Za-z0-9_-]+\.(wav|mp3|m4a|ogg)$/;
const MAX_ASSETS = 40;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function authorized(header) {
  const [scheme, value = ""] = (header ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer") return false;
  const given = Buffer.from(value);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const producer = createProducerApp({
  rendersDir,
  maxConcurrentRenders: Number(process.env.VIDEO_MAX_CONCURRENT_RENDERS || 1),
});

const app = new Hono();
app.get("/health", (c) => c.json({ status: "ok" }));
app.use("*", async (c, next) => {
  if (!authorized(c.req.header("authorization"))) return c.json({ success: false, error: "Unauthorized" }, 401);
  await next();
});

app.post("/render", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (typeof body?.html !== "string" || !body.html.trim()) {
    return c.json({ success: false, error: "html is required" }, 400);
  }
  const forwarded = Object.fromEntries(RENDER_FIELDS.filter((key) => key in body).map((key) => [key, body[key]]));
  // Media must be local files (renders never fetch), so with assets the composition becomes a small project folder.
  let projectDir;
  if (body.assets !== undefined) {
    const assets = body.assets;
    const names = assets && typeof assets === "object" && !Array.isArray(assets) ? Object.keys(assets) : null;
    if (!names || names.length > MAX_ASSETS || !names.every((name) => ASSET_NAME.test(name) && typeof assets[name] === "string")) {
      return c.json({ success: false, error: "Invalid assets" }, 400);
    }
    const files = names.map((name) => [name, Buffer.from(assets[name], "base64")]);
    if (files.reduce((total, [, data]) => total + data.length, 0) > MAX_ASSET_BYTES) {
      return c.json({ success: false, error: "Assets are too large" }, 413);
    }
    projectDir = mkdtempSync(join(rendersDir, "nexo-project-"));
    mkdirSync(join(projectDir, "assets"));
    writeFileSync(join(projectDir, "index.html"), body.html, "utf-8");
    for (const [name, data] of files) writeFileSync(join(projectDir, "assets", name), data);
  }
  let response;
  try {
    response = await producer.fetch(
      new Request("http://producer/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...forwarded, ...(projectDir ? { projectDir } : {}), format: "mp4" }),
      }),
    );
  } finally {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  }
  const result = await response.json();
  if (!result.success) {
    return c.json({ success: false, error: result.error, errorCode: result.errorCode }, response.status);
  }
  return c.json({
    success: true,
    file: basename(result.outputPath),
    fileSize: result.fileSize,
    videoDurationSeconds: result.videoDurationSeconds,
    durationMs: result.durationMs,
    warnings: result.warnings,
  });
});

app.get("/files/:name", (c) => {
  const name = c.req.param("name");
  if (!FILE_NAME.test(name)) return c.json({ success: false, error: "File not found" }, 404);
  const path = join(rendersDir, name);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return c.json({ success: false, error: "File not found" }, 404);
  }
  return new Response(Readable.toWeb(createReadStream(path)), {
    headers: { "content-type": "video/mp4", "content-length": String(size), "cache-control": "no-store" },
  });
});

app.delete("/files/:name", (c) => {
  const name = c.req.param("name");
  if (!FILE_NAME.test(name)) return c.json({ success: false, error: "File not found" }, 404);
  try {
    unlinkSync(join(rendersDir, name));
  } catch {
    // Already gone: the goal is the same.
  }
  return c.body(null, 204);
});

// The producer's own download route is not exposed: /files replaces it.
app.all("/outputs/*", (c) => c.json({ success: false, error: "Not found" }, 404));
// Lint, queue status: served by the producer as they are.
app.route("/", producer);

setInterval(() => {
  const limit = Date.now() - KEEP_FILES_MS;
  for (const name of readdirSync(rendersDir)) {
    const path = join(rendersDir, name);
    try {
      if (FILE_NAME.test(name) && statSync(path).mtimeMs < limit) unlinkSync(path);
    } catch {
      // Removed meanwhile.
    }
  }
}, 5 * 60 * 1000).unref();

const port = Number(process.env.PORT || 8080);
const hostname = process.env.HOST || "0.0.0.0";
const server = serve({ fetch: app.fetch, port, hostname }, () => console.log(`video server on ${hostname}:${port}`));
// Renders are long; never cut the request.
server.setTimeout(0);
server.requestTimeout = 0;
server.keepAliveTimeout = 0;
process.on("SIGTERM", () => server.close(() => process.exit(0)));
