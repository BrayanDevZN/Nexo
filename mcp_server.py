"""Nexo MCP server: HTTP callers pass their key; stdio can use NEXO_API_KEY."""

from __future__ import annotations

import base64
import binascii
import contextvars
import json
import os
import re
from typing import Any
from urllib.parse import quote

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP


DEFAULT_BASE_URL = "https://nexo-production-60a0.up.railway.app"
BASE_URL = os.getenv("NEXO_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("NEXO_TIMEOUT_SECONDS", "30"))
MAX_FILE_BYTES = int(os.getenv("MCP_MAX_FILE_BYTES", str(10 * 1024 * 1024)))
DEFAULT_API_KEY = os.getenv("NEXO_API_KEY", "").strip()

_request_api_key: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "nexo_mcp_request_api_key", default=None
)

mcp = FastMCP(
    "Nexo",
    host="0.0.0.0",
    port=int(os.getenv("PORT", "8000")),
    stateless_http=True,
    json_response=True,
)

CLIENT_FIELDS = {
    "name",
    "niche",
    "phone",
    "email",
    "address",
    "pipeline_stage",
    "contract_closed",
    "contract_value",
    "notes",
    "next_follow_up",
    "pain",
    "approach",
}


def _api_key() -> str:
    key = _request_api_key.get() or DEFAULT_API_KEY
    if not key:
        raise ValueError(
            "No Nexo API key was provided. Send Authorization: Bearer <Nexo API key> "
            "to the MCP server, or set NEXO_API_KEY for local stdio use."
        )
    return key


def _safe_segment(value: str) -> str:
    return quote(str(value), safe="")


def _safe_filename(value: str) -> str:
    filename = str(value or "file")
    filename = re.sub(r"[\r\n\"\\/]", "_", filename)
    return filename[:180] or "file"


def _decode_file(content_base64: str, label: str) -> bytes:
    try:
        content = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError(f"{label} must be valid standard Base64.") from error
    if len(content) > MAX_FILE_BYTES:
        raise ValueError(
            f"{label} exceeds MCP_MAX_FILE_BYTES ({MAX_FILE_BYTES} bytes)."
        )
    return content


def _file_result(response: httpx.Response, fallback_name: str) -> dict[str, Any]:
    content_disposition = response.headers.get("content-disposition", "")
    encoded = re.search(r"filename\*=UTF-8''([^;]+)", content_disposition, re.I)
    plain = re.search(r'filename="?([^";]+)"?', content_disposition, re.I)
    filename = fallback_name
    if encoded:
        from urllib.parse import unquote

        filename = unquote(encoded.group(1))
    elif plain:
        filename = plain.group(1)
    return {
        "filename": _safe_filename(filename),
        "content_type": response.headers.get(
            "content-type", "application/octet-stream"
        ),
        "size_bytes": len(response.content),
        "content_base64": base64.b64encode(response.content).decode("ascii"),
    }


async def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
    expect_file: bool = False,
    fallback_filename: str = "nexo-file",
) -> Any:
    key = _api_key()
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json, application/octet-stream, image/jpeg",
    }
    try:
        async with httpx.AsyncClient(
            base_url=f"{BASE_URL}/",
            timeout=TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.request(
                method,
                path.lstrip("/"),
                params=params,
                json=body if files is None else None,
                data=body if files is not None else None,
                files=files,
                headers=headers,
            )
    except httpx.TimeoutException as error:
        raise RuntimeError("The Nexo API request timed out.") from error
    except httpx.RequestError as error:
        raise RuntimeError(
            f"Could not reach the Nexo API at {BASE_URL}."
        ) from error

    if response.is_error:
        detail = response.text[:1200].replace(key, "[redacted]")
        raise RuntimeError(
            f"Nexo API returned HTTP {response.status_code}: {detail or response.reason_phrase}"
        )
    if expect_file:
        return _file_result(response, fallback_filename)
    if response.status_code == 204 or not response.content:
        return {"status_code": response.status_code}
    try:
        return response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {
            "content_type": response.headers.get(
                "content-type", "application/octet-stream"
            ),
            "content_base64": base64.b64encode(response.content).decode("ascii"),
        }


def _client_fields(fields: dict[str, Any], *, require_name_niche: bool = False) -> dict[str, Any]:
    if not isinstance(fields, dict):
        raise ValueError("fields must be a JSON object.")
    unknown = set(fields) - CLIENT_FIELDS
    if unknown:
        raise ValueError(f"Unsupported client fields: {', '.join(sorted(unknown))}.")
    if require_name_niche:
        missing = [name for name in ("name", "niche") if not fields.get(name)]
        if missing:
            raise ValueError("Creating a client requires name and niche.")
    if not fields:
        raise ValueError("Provide at least one client field.")
    return fields


def _pagination(limit: int, offset: int) -> None:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100.")
    if offset < 0:
        raise ValueError("offset must be greater than or equal to 0.")


@mcp.tool()
async def nexo_dashboard_summary() -> Any:
    """Return the Nexo business dashboard summary."""
    return await _request("GET", "/dashboard")


@mcp.tool()
async def nexo_clients_list(
    limit: int = 50,
    offset: int = 0,
    name: str | None = None,
    niche: str | None = None,
    created_by_id: str | None = None,
    pipeline_stage: str | None = None,
    contract_closed: bool | None = None,
) -> Any:
    """List clients with optional name, niche, owner, stage and contract filters."""
    _pagination(limit, offset)
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    for key, value in {
        "name": name,
        "niche": niche,
        "created_by_id": created_by_id,
        "pipeline_stage": pipeline_stage,
        "contract_closed": contract_closed,
    }.items():
        if value is not None and value != "":
            params[key] = value
    return await _request("GET", "/clients", params=params)


@mcp.tool()
async def nexo_clients_get(identifier: str) -> Any:
    """Get a client by its Nexo client ID."""
    return await _request("GET", f"/clients/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_clients_search(search_term: str, search_by: str = "auto") -> Any:
    """Find a client by UUID or name; name searches return matching records."""
    term = search_term.strip()
    if not term:
        raise ValueError("search_term cannot be empty.")
    looks_like_uuid = bool(
        re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
            term,
            re.I,
        )
    )
    if search_by not in {"auto", "id", "name"}:
        raise ValueError("search_by must be auto, id or name.")
    if search_by == "id" or (search_by == "auto" and looks_like_uuid):
        return await _request("GET", f"/clients/{_safe_segment(term)}")
    return await _request(
        "GET", "/clients", params={"name": term, "limit": 100, "offset": 0}
    )


@mcp.tool()
async def nexo_clients_create(fields: dict[str, Any]) -> Any:
    """Create a client. Supported fields: name, niche, phone, email, address, pipeline_stage, contract_closed, contract_value, notes, next_follow_up, pain and approach."""
    payload = _client_fields(fields, require_name_niche=True)
    return await _request("POST", "/clients", body=payload)


@mcp.tool()
async def nexo_clients_update(identifier: str, fields: dict[str, Any]) -> Any:
    """Update only the supplied client fields. Use null for fields the API allows clearing."""
    payload = _client_fields(fields)
    return await _request(
        "PATCH", f"/clients/{_safe_segment(identifier)}", body=payload
    )


@mcp.tool()
async def nexo_clients_delete(identifier: str) -> Any:
    """Delete a client by its ID."""
    return await _request("DELETE", f"/clients/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_automations_list(limit: int = 50, offset: int = 0) -> Any:
    """List automations in the shared Nexo library."""
    _pagination(limit, offset)
    return await _request(
        "GET", "/automations", params={"limit": limit, "offset": offset}
    )


@mcp.tool()
async def nexo_automations_get(identifier: str) -> Any:
    """Get automation metadata without its file contents."""
    return await _request("GET", f"/automations/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_automations_save(
    name: str,
    description: str,
    file_name: str,
    file_content_base64: str,
    image_name: str | None = None,
    image_content_base64: str | None = None,
    image_content_type: str = "image/jpeg",
) -> Any:
    """Save an automation file; optionally include its cover image. File contents must be Base64."""
    if not name.strip() or not description.strip():
        raise ValueError("name and description are required.")
    if bool(image_name) != bool(image_content_base64):
        raise ValueError("Provide both image_name and image_content_base64, or neither.")
    files = {
        "file": (
            _safe_filename(file_name),
            _decode_file(file_content_base64, "file_content_base64"),
            "application/octet-stream",
        )
    }
    if image_content_base64 is not None:
        files["image"] = (
            _safe_filename(image_name or "cover.jpg"),
            _decode_file(image_content_base64, "image_content_base64"),
            image_content_type,
        )
    return await _request(
        "POST",
        "/automations",
        body={"name": name, "description": description},
        files=files,
    )


@mcp.tool()
async def nexo_automations_update(
    identifier: str,
    name: str | None = None,
    description: str | None = None,
    file_name: str | None = None,
    file_content_base64: str | None = None,
    image_name: str | None = None,
    image_content_base64: str | None = None,
    image_content_type: str = "image/jpeg",
) -> Any:
    """Update automation metadata, file and/or image. Omitted fields stay unchanged."""
    if bool(file_name) != bool(file_content_base64):
        raise ValueError("Provide both file_name and file_content_base64, or neither.")
    if bool(image_name) != bool(image_content_base64):
        raise ValueError("Provide both image_name and image_content_base64, or neither.")
    fields: dict[str, str] = {}
    if name is not None:
        fields["name"] = name
    if description is not None:
        fields["description"] = description
    files: dict[str, tuple[str, bytes, str]] | None = None
    uploads: dict[str, tuple[str | None, Any, str]] = {}
    if file_content_base64 is not None:
        uploads["file"] = (
            _safe_filename(file_name or "automation"),
            _decode_file(file_content_base64, "file_content_base64"),
            "application/octet-stream",
        )
    if image_content_base64 is not None:
        uploads["image"] = (
            _safe_filename(image_name or "cover.jpg"),
            _decode_file(image_content_base64, "image_content_base64"),
            image_content_type,
        )
    if not fields and not uploads:
        raise ValueError("Provide at least one automation field, file or image.")
    if uploads:
        files = uploads
    else:
        # PATCH /automations always expects multipart/form-data, even when
        # only text metadata changes.
        files = {
            key: (None, value, "text/plain")
            for key, value in fields.items()
        }
        fields = {}
    return await _request(
        "PATCH",
        f"/automations/{_safe_segment(identifier)}",
        body=fields,
        files=files,
    )


@mcp.tool()
async def nexo_automations_delete(identifier: str) -> Any:
    """Delete an automation from the shared library."""
    return await _request("DELETE", f"/automations/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_automations_download(identifier: str) -> Any:
    """Download an automation file as Base64 with filename and content type."""
    return await _request(
        "GET",
        f"/automations/{_safe_segment(identifier)}/download",
        expect_file=True,
        fallback_filename="automation",
    )


@mcp.tool()
async def nexo_automations_image(identifier: str) -> Any:
    """Download an automation cover image as Base64."""
    return await _request(
        "GET",
        f"/automations/{_safe_segment(identifier)}/image",
        expect_file=True,
        fallback_filename="automation-image.jpg",
    )


@mcp.tool()
async def nexo_documents_list(
    limit: int = 50, offset: int = 0, client_id: str | None = None
) -> Any:
    """List documents, optionally filtered by client ID."""
    _pagination(limit, offset)
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if client_id:
        params["client_id"] = client_id
    return await _request("GET", "/documents", params=params)


@mcp.tool()
async def nexo_documents_get(identifier: str) -> Any:
    """Get document metadata without downloading its contents."""
    return await _request("GET", f"/documents/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_documents_upload(
    file_name: str,
    file_content_base64: str,
    client_id: str | None = None,
    content_type: str = "application/octet-stream",
) -> Any:
    """Upload a document, optionally linking it to a client. File contents must be Base64."""
    params = {"client_id": client_id} if client_id else None
    files = {
        "file": (
            _safe_filename(file_name),
            _decode_file(file_content_base64, "file_content_base64"),
            content_type,
        )
    }
    return await _request("POST", "/documents", params=params, files=files)


@mcp.tool()
async def nexo_documents_download(identifier: str) -> Any:
    """Download a document as Base64 with filename and content type."""
    return await _request(
        "GET",
        f"/documents/{_safe_segment(identifier)}/download",
        expect_file=True,
        fallback_filename="document",
    )


@mcp.tool()
async def nexo_documents_delete(identifier: str) -> Any:
    """Delete a document by its ID."""
    return await _request("DELETE", f"/documents/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_notifications_list(
    limit: int = 50, offset: int = 0, kind: str | None = None
) -> Any:
    """List notifications, optionally filtered by kind."""
    _pagination(limit, offset)
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if kind and kind != "all":
        params["kind"] = kind
    return await _request("GET", "/notifications", params=params)


@mcp.tool()
async def nexo_notifications_get(identifier: str) -> Any:
    """Get a notification by its ID."""
    return await _request("GET", f"/notifications/{_safe_segment(identifier)}")


@mcp.tool()
async def nexo_notifications_unread_count() -> Any:
    """Return unread notification counts, including notices and chat messages."""
    return await _request("GET", "/notifications/unread-count")


@mcp.tool()
async def nexo_notifications_mark_read(identifier: str) -> Any:
    """Mark one notification as read."""
    return await _request(
        "PATCH", f"/notifications/{_safe_segment(identifier)}/read"
    )


@mcp.tool()
async def nexo_notifications_mark_chat_read(member_id: str) -> Any:
    """Mark chat notifications from a member as read."""
    return await _request(
        "PATCH", f"/notifications/chat/{_safe_segment(member_id)}/read"
    )


@mcp.tool()
async def nexo_announcement_create(title: str, body: str) -> Any:
    """Create an administrative announcement. The Nexo API requires an admin key."""
    return await _request(
        "POST", "/admin/announcements", body={"title": title, "body": body}
    )


class BearerApiKeyMiddleware:
    """Bind each HTTP MCP request to its caller's Nexo Bearer key."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope.get("path") == "/health":
            body = b'{"status":"ok"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw_headers = dict(scope.get("headers", []))
        authorization = raw_headers.get(b"authorization", b"").decode(
            "latin-1"
        ).strip()
        scheme, separator, token = authorization.partition(" ")
        if not separator or scheme.lower() != "bearer" or not token.strip():
            body = (
                b'{"detail":"Send your Nexo API key in '
                b'Authorization: Bearer <key>."}'
            )
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii")),
                        (b"www-authenticate", b"Bearer"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        context_token = _request_api_key.set(token.strip())
        try:
            await self.app(scope, receive, send)
        finally:
            _request_api_key.reset(context_token)


app = BearerApiKeyMiddleware(mcp.streamable_http_app())


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "streamable-http").strip().lower()
    if transport == "stdio":
        mcp.run(transport="stdio")
        return
    if transport != "streamable-http":
        raise ValueError("MCP_TRANSPORT must be streamable-http or stdio.")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        access_log=False,
    )


if __name__ == "__main__":
    main()
