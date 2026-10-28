# Stage 1: the HyperFrames render server's dependencies and a headless Chrome. The backend runs video-server/ as a
# child process (no separate service), so everything it needs is copied into the backend image below.
FROM mirror.gcr.io/library/node:22.23.4-bookworm-slim AS video
ARG TARGETARCH=amd64
ARG PLAYWRIGHT_VERSION=1.61.1
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/opt/browsers \
    PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /video-server
COPY video-server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
# chrome-headless-shell gives the deterministic BeginFrame capture; its path is recorded for the backend.
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /opt/browsers; \
    else \
      npx --yes playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell; \
    fi \
    && find /opt/browsers \( -name chrome-headless-shell -o -name headless_shell \) -type f | head -1 \
       > /opt/browsers/chrome-headless-shell-path \
    && test -s /opt/browsers/chrome-headless-shell-path
COPY video-server/server.mjs ./

FROM python:3.12-slim-bookworm

WORKDIR /app

ARG TARGETARCH=amd64
# Libraries and fonts Chrome needs to render, and one pinned static FFmpeg (the build HyperFrames itself ships).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils libstdc++6 \
    libgbm1 libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
    libxdamage1 libxrandr2 libcups2 libasound2 libpangocairo-1.0-0 \
    libxshmfence1 libgtk-3-0 \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core \
    fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* && apt-get clean && fc-cache -fv
ARG FFMPEG_RELEASE=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-02-28-12-59
ARG FFMPEG_BUILD=ffmpeg-n8.0.1-66-g27b8d1a017
ARG FFMPEG_SHA256_AMD64=26d2ecd0cefba99f9d1ea92252a3a4f743a58df4c1c3cf9f8bbaaa40b1fca5b0
ARG FFMPEG_SHA256_ARM64=d72cc324cb65dd92a9ffe699cc95ccbacfef4def8d3ad9fe2b5164a6a71b9595
RUN case "$TARGETARCH" in \
      amd64) FF_ARCH=linux64; FF_SHA256="$FFMPEG_SHA256_AMD64" ;; \
      arm64) FF_ARCH=linuxarm64; FF_SHA256="$FFMPEG_SHA256_ARM64" ;; \
      *) echo "unsupported TARGETARCH '$TARGETARCH'" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/ffmpeg.tar.xz "$FFMPEG_RELEASE/$FFMPEG_BUILD-$FF_ARCH-gpl-8.0.tar.xz" \
    && echo "$FF_SHA256  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/ffmpeg.tar.xz -C /usr/local/bin --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' \
    && rm /tmp/ffmpeg.tar.xz

COPY --from=video /usr/local/bin/node /usr/local/bin/node
COPY --from=video /opt/browsers /opt/browsers
COPY --from=video /video-server /app/video-server

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    HOST=0.0.0.0 \
    PORT=8000 \
    ENVIRONMENT=production \
    COOKIE_SECURE=true \
    COOKIE_SAMESITE=none \
    GOOGLE_REDIRECT_URI=https://www.nexoaicompany.com/api/auth/google/callback \
    FRONTEND_URL=https://www.nexoaicompany.com \
    CORS_ORIGINS='["https://nexoaicompany.com","https://www.nexoaicompany.com"]' \
    DATABASE_URL=sqlite:////data/nexo.db \
    UPLOAD_DIR=/data/uploads

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/backend ./src/backend
RUN mkdir -p /data/uploads

EXPOSE 8000

CMD ["python", "-m", "backend.main"]
