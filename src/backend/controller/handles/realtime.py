import asyncio
import json
from contextlib import suppress
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from redis.exceptions import RedisError

from backend.controller.dependencies import current_user
from backend.controller.schema.chat import ChatSend
from backend.domain.tokens import InvalidTokenError
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound
from backend.service.security import AuthenticationError

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.post("/ticket")
def ticket(request: Request, actor=Depends(current_user)):
    services = request.app.state.services
    try:
        claims = services.tokens.read(request.cookies.get(request.app.state.settings.auth_cookie_name, ""))
        value = services.events.issue_ticket(claims, request.headers.get("origin", ""))
    except RedisError:
        raise HTTPException(503, "Realtime temporarily unavailable") from None
    except InvalidTokenError:
        raise HTTPException(401, "Invalid session") from None
    return {"ticket": value, "expires_in": 30}


@router.websocket("")
async def realtime(socket: WebSocket):
    services = socket.app.state.services
    settings = socket.app.state.settings
    origin = socket.headers.get("origin", "")
    protocols = socket.scope.get("subprotocols", [])
    if origin not in settings.cors_origins or len(protocols) != 2 or protocols[0] != "nexo.v1":
        await socket.close(code=4403)
        return
    lease = str(uuid4())
    user = None
    acquired = False
    try:
        payload = await asyncio.to_thread(services.events.consume_ticket, protocols[1], origin)
        user = await asyncio.to_thread(services.realtime.authenticate, payload)
        acquired = await asyncio.to_thread(services.events.acquire, user.id, lease, settings.ws_connections_per_user)
        if not acquired:
            await socket.close(code=4429)
            return
        async with services.realtime_connection.client.pubsub() as pubsub:
            await pubsub.subscribe(services.events.channel(), services.events.channel(user.id))
            await socket.accept(subprotocol="nexo.v1")
            await socket.send_json({"type": "ready"})
            outgoing = asyncio.Queue(maxsize=128)

            async def receive():
                while True:
                    frame = await socket.receive()
                    if frame["type"] == "websocket.disconnect":
                        raise WebSocketDisconnect(frame.get("code", 1000))
                    if "text" not in frame:
                        await socket.close(code=1003)
                        return
                    raw = frame["text"]
                    if len(raw.encode()) > 16384:
                        await socket.close(code=1009)
                        return
                    actor = await asyncio.to_thread(services.realtime.authenticate, payload)
                    result = await asyncio.to_thread(services.realtime.check_rate, actor.id)
                    if not result.allowed:
                        await outgoing.put({"type": "error", "code": "rate_limit", "retry_after": result.retry_after})
                        continue
                    try:
                        value = json.loads(raw)
                        command = ChatSend.model_validate(value)
                        row = await asyncio.to_thread(services.chat.send, actor, str(command.member_id),
                                                      str(command.client_id), command.text)
                        await outgoing.put({"type": "chat.ack", "message": row})
                    except (ValueError, ValidationError, AccessDenied, ResourceNotFound, ResourceConflict):
                        await outgoing.put({"type": "error", "code": "invalid_message"})

            async def events():
                while True:
                    value = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                    if value:
                        actor = await asyncio.to_thread(services.realtime.authenticate, payload)
                        event = json.loads(value["data"])
                        if event["type"] == "notifications.changed" and (actor.status != "approved" or actor.role != "admin"):
                            continue
                        if event["type"] == "chat.message" and actor.status != "approved":
                            continue
                        outgoing.put_nowait(event)
                    await asyncio.sleep(0.01)

            async def heartbeat():
                while True:
                    await asyncio.sleep(15)
                    await asyncio.to_thread(services.realtime.authenticate, payload)
                    await asyncio.to_thread(services.events.renew, user.id, lease)
                    await outgoing.put({"type": "heartbeat"})

            async def send():
                while True:
                    await asyncio.wait_for(socket.send_json(await outgoing.get()), timeout=10)

            tasks = [asyncio.create_task(task()) for task in (receive, events, heartbeat, send)]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except (AuthenticationError, AccessDenied):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=4401)
    except (RedisError, asyncio.QueueFull, TimeoutError):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=1013)
    except WebSocketDisconnect:
        pass
    finally:
        if acquired and user:
            with suppress(RedisError):
                await asyncio.to_thread(services.events.release, user.id, lease)
