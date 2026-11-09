# Nexo maps server

Google Maps scraper ([gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper))
behind nginx. Every request must carry a Nexo API key:

    Authorization: Bearer nexo_live_...

Flow: client → nginx → `GET {NEXO_API_URL}/auth/api-keys/validate` (nginx `auth_request`) →
only if Nexo answers 200, nginx forwards to the scraper on `127.0.0.1:8081`. The scraper has no
auth of its own and is never exposed. The key is not forwarded to the scraper.

- Invalid or missing key: `401`. Nexo unreachable: `503`.
- Valid results are cached for 60 s and rejections for 10 s, so a revoked key stops working
  within a minute.
- Auth is header-only, so the scraper's web UI is not usable from a browser; use the REST API.
- `GET /_health` is unauthenticated.

## Railway

Create a service with Root Directory `maps-server` (it uses the `Dockerfile`), add a volume at
`/gmapsdata`, and set:

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 8080 | Set by Railway |
| NEXO_API_URL | production Nexo API | Backend that validates keys, no trailing slash |
| DATA_DIR | /gmapsdata | Where the scraper stores job results |

## Local

    docker build -t nexo-maps maps-server/
    docker run --rm -p 8080:8080 nexo-maps
    curl -i localhost:8080/                                   # 401
    curl -i -H "Authorization: Bearer nexo_live_..." localhost:8080/api/v1/jobs
