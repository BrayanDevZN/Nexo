# Nexo MCP server

Python MCP server exposing the operations documented for Nexo API keys.

## Authentication

For remote Streamable HTTP clients, each caller sends their own Nexo API key in
the MCP request header:

    Authorization: Bearer nexo_live_...

The server forwards that same key to the Nexo API. It does not store or log
remote users' keys. The Nexo API remains responsible for deciding which
operations each key may perform. Do not pass API keys as tool arguments.

For local stdio use only, set NEXO_API_KEY in the MCP client's process
environment. Do not set one shared NEXO_API_KEY on a public multi-user
deployment.

ChatGPT's custom MCP connector currently authenticates remote MCP connections
with OAuth and does not send caller-supplied API keys. This server's direct
Bearer-key mode works with MCP clients that can attach an Authorization
header. Connecting it to ChatGPT for multiple Nexo users needs an OAuth
account-linking layer that securely associates each OAuth account with that
user's Nexo key; do not put the key in a tool argument or hardcode it in the
plugin.

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
http://localhost:8000/mcp and configure its Authorization header with the
caller's own Nexo API key. /health is an unauthenticated liveness endpoint.
The service does not need a shared Nexo API key in HTTP mode.

## Build the container

From the repository root:

    docker build -f Dockerfile.mcp -t nexo-mcp .
    docker run --rm -p 8000:8000 nexo-mcp

On Railway, select Dockerfile.mcp with the repository root as the build
context. Railway supplies PORT. Configure NEXO_BASE_URL only when using a
different Nexo API deployment. Never add API keys to the image, Dockerfile,
repository variables, or Git.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 8000 | HTTP listener port |
| MCP_TRANSPORT | streamable-http | streamable-http or local stdio |
| NEXO_BASE_URL | Production Nexo API URL | API base URL, without trailing slash |
| NEXO_API_KEY | unset | Local stdio key only |
| NEXO_TIMEOUT_SECONDS | 30 | Outbound API timeout |
| MCP_MAX_FILE_BYTES | 10485760 | Maximum decoded upload size |
