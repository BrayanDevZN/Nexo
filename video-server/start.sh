#!/bin/sh
set -eu
PRODUCER_HEADLESS_SHELL_PATH="$(cat /etc/chrome-headless-shell-path)"
export PRODUCER_HEADLESS_SHELL_PATH
mkdir -p "${VIDEO_RENDERS_DIR:-/data/renders}"
exec node server.mjs
