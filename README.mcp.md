# Nexo MCP server

Python MCP server exposing the operations documented for Nexo API keys.

## Authentication

For HTTP, each MCP client sends its own Nexo API key in the request header:

    Authorization: Bearer nexo_live_...

The server forwards that key to Nexo. It does not store or log caller keys, and
the key is never a tool argument. The Nexo API enforces the permissions for
each caller's key. For local stdio only, set `NEXO_API_KEY` in the server
process environment. Do not commit API keys to Git or bake them into the image.

ChatGPT's custom MCP connector authenticates remote MCP connections with
OAuth. This server does not implement OAuth or map OAuth accounts to Nexo
keys. Connecting it to ChatGPT for multiple users requires an OAuth layer that
securely associates each signed-in user with their own Nexo key and sends that
key in the MCP Authorization header.

## Exposed operations

The API key documentation in src/frontend/admin/ApiDocumentation.tsx and the
n8n API node in n8n/nodes/Nexo/Nexo.node.js define these tools:

- Dashboard: summary.
- Clients: list with filters/pagination, get, search by ID/name, create,
  update and delete.
- Automations: list, get metadata, save, update, delete, download and image.
- Documents: list, get metadata, upload, download and delete.
- Notifications: list, get, unread count, mark one read and mark chat read.
- Administrative announcements: create.

Binary inputs and outputs use Base64 (file_content_base64,
image_content_base64, or content_base64). Upload size defaults to 10 MiB
and can be changed with MCP_MAX_FILE_BYTES. List endpoints enforce the Nexo
API's maximum page size of 100. Roles and ownership checks are performed by
the Nexo API.

Account login, member management, API-key administration and realtime chat
are intentionally not exposed here: they use the panel's cookie/session or
WebSocket authentication rather than the documented API-key contract.

## Run locally

Install dependencies and start the local stdio transport:

    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.mcp.txt
    export NEXO_API_KEY='nexo_live_...'
    MCP_TRANSPORT=stdio python mcp_server.py

For remote HTTP transport, connect a compatible MCP client to
http://localhost:8000/mcp and configure the client's Authorization header
with that caller's key. `/health` is an unauthenticated liveness endpoint.

## Build the container

From the repository root:

    docker build -f Dockerfile.mcp -t nexo-mcp .
    docker run --rm -p 8000:8000 nexo-mcp

On Railway, select Dockerfile.mcp with the repository root as the build
context. Railway supplies PORT. In HTTP mode, callers provide their own key in
the Authorization header; do not configure one shared NEXO_API_KEY on a public
multi-user server. Configure NEXO_BASE_URL only when using a different Nexo
API deployment. Never add API keys to the image, Dockerfile, or Git.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 8000 | HTTP listener port |
| MCP_TRANSPORT | streamable-http | streamable-http or local stdio |
| NEXO_BASE_URL | Production Nexo API URL | API base URL, without trailing slash |
| NEXO_API_KEY | unset | Nexo API key for local stdio transport only |
| NEXO_TIMEOUT_SECONDS | 30 | Outbound API timeout |
| MCP_MAX_FILE_BYTES | 10485760 | Maximum decoded upload size |
