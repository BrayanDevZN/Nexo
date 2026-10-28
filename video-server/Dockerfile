# HyperFrames render server (HTML -> MP4) behind a shared secret. Chrome + FFmpeg setup follows the image the
# HyperFrames CLI itself uses to render in Docker (packages/cli/src/docker/Dockerfile.render).
FROM node:22.23.4-bookworm-slim

ARG TARGETARCH=amd64
ARG PLAYWRIGHT_VERSION=1.61.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip xz-utils \
    libgbm1 libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
    libxdamage1 libxrandr2 libcups2 libasound2 libpangocairo-1.0-0 \
    libxshmfence1 libgtk-3-0 \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core \
    fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* && apt-get clean && fc-cache -fv

# One pinned static FFmpeg build, the same one HyperFrames ships its own images with.
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

# chrome-headless-shell enables the deterministic BeginFrame capture. Its path is recorded in
# /etc/chrome-headless-shell-path and exported by start.sh.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CONTAINER=true \
    PUPPETEER_CACHE_DIR=/opt/browsers \
    PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /opt/browsers; \
    else \
      npx --yes playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell; \
    fi \
    && find /opt/browsers \( -name chrome-headless-shell -o -name headless_shell \) -type f | head -1 \
       > /etc/chrome-headless-shell-path \
    && test -s /etc/chrome-headless-shell-path

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs start.sh ./
RUN chmod +x start.sh

ENV PORT=8080 \
    VIDEO_RENDERS_DIR=/data/renders \
    PRODUCER_DISABLE_HEALTH_WORKER=1
EXPOSE 8080
CMD ["./start.sh"]
