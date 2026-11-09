# Nexo video server

[HyperFrames](https://github.com/heygen-com/hyperframes) render server: HTML composition in, MP4 out. It is the
`@hyperframes/producer` HTTP server behind a shared secret; only the Nexo backend (`/videos` routes) talks to it.

**The backend runs this server itself** (child process on `127.0.0.1`, random secret, started on the first video
request; the backend `Dockerfile` installs Node, Chrome and FFmpeg for it), so there is nothing to deploy. This
folder's own `Dockerfile` and the sections below are only for running it as a separate service, which the backend
then reaches with `VIDEO_URL` and `VIDEO_SECRET`.

    Authorization: Bearer <VIDEO_SERVER_SECRET>

| Route | What it does |
| --- | --- |
| `POST /render` | `{html, fps?, quality?}`: renders and answers `{success, file, fileSize, videoDurationSeconds}` (blocks until done) |
| `GET /files/:name` | the rendered MP4 |
| `DELETE /files/:name` | the backend removes the file after storing it (files also expire after 30 min) |
| `POST /lint` | `{html}`: composition problems, without rendering |
| `GET /render/queue` | active and queued renders |
| `GET /health` | unauthenticated liveness probe |

Only `html`, `fps`, `quality` and `maxRenderMs` are forwarded to the producer; `projectDir`, `previewUrl` and
`outputPath` are dropped. Rendering is CPU heavy: one render at a time by default.

## As a separate service (optional)

Create a service with Root Directory `video-server` (it uses the `Dockerfile`), give it at least 2 vCPU and 4 GB
RAM, add a volume at `/data` and set:

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 8080 | Set by Railway |
| VIDEO_SERVER_SECRET | none (required, 16+ chars) | Shared secret; the backend sends it as `VIDEO_SECRET` |
| VIDEO_MAX_CONCURRENT_RENDERS | 1 | Renders running at the same time |
| VIDEO_RENDERS_DIR | /data/renders | Where finished files wait to be downloaded |

Then set `VIDEO_URL` and `VIDEO_SECRET` on the Nexo backend (see `.env.example`); an external server wins over the
embedded one.

## Local

    cd video-server && npm install
    VIDEO_SERVER_SECRET=change-me-please-123 PRODUCER_HEADLESS_SHELL_PATH=/path/to/chrome-headless-shell node server.mjs
