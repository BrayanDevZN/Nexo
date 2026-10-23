#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
export NEXO_API_URL="${NEXO_API_URL:-https://nexo-production-60a0.up.railway.app}"
NEXO_API_URL="${NEXO_API_URL%/}"
export NEXO_API_URL
export NEXO_HOST="$(printf '%s' "$NEXO_API_URL" | sed -E 's#^[a-z]+://##; s#/.*$##')"
DATA_DIR="${DATA_DIR:-/gmapsdata}"
mkdir -p "$DATA_DIR" /tmp/nginx-auth /tmp/nginx-proxy /tmp/nginx-body

# nginx needs an explicit resolver; reuse the container's own.
NS="$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf 2>/dev/null || true)"
case "$NS" in
  "") NS="1.1.1.1" ;;
  *:*) NS="[$NS]" ;;
esac
export RESOLVER="$NS"

envsubst '${PORT} ${RESOLVER} ${NEXO_API_URL} ${NEXO_HOST}' \
  < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t

BIN="$(command -v google-maps-scraper || echo /usr/bin/google-maps-scraper)"
"$BIN" -web -addr 127.0.0.1:8081 -data-folder "$DATA_DIR" &
SCRAPER=$!

nginx -g 'daemon off;' &
NGINX=$!

trap 'kill $SCRAPER $NGINX 2>/dev/null' TERM INT
# Exit as soon as either process dies so Railway restarts the container.
while kill -0 $SCRAPER 2>/dev/null && kill -0 $NGINX 2>/dev/null; do sleep 2; done
kill $SCRAPER $NGINX 2>/dev/null || true
exit 1
