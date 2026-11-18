"""Atendimentos in real time: one socket per business, and Web Push for the bookings that happen while the app is closed."""
import asyncio
import json
from contextlib import suppress
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from redis.exceptions import RedisError

from backend.controller.dependencies import booking_session_user
from backend.controller.schema.push import PushSubscription, PushUnsubscribe
from backend.domain.tokens import InvalidTokenError
from backend.service.access import AccessDenied, ResourceNotFound

router = APIRouter(prefix="/atendimentos", tags=["scheduling real time"])
TICKET_TTL = 30


@router.post("/realtime/ticket")
def ticket(request: Request, business_id: str = Query(max_length=36), actor=Depends(booking_session_user)):
    services = request.app.state.services
    try:
        claims = services.booking_tokens.read(request.cookies.get(request.app.state.settings.booking_cookie_name, ""))
        value = services.scheduling.realtime_ticket(actor, business_id, request.headers.get("origin", ""), claims.expires_at)
    except RedisError:
        raise HTTPException(503, "Realtime temporarily unavailable") from None
    except InvalidTokenError:
        raise HTTPException(401, "Invalid session") from None
    except ResourceNotFound as exc:
        raise HTTPException(404, str(exc)) from None
    except AccessDenied as exc:
        raise HTTPException(403, str(exc)) from None
    return {"ticket": value, "expires_in": TICKET_TTL}


@router.websocket("/realtime")
async def realtime(socket: WebSocket):
    services = socket.app.state.services
    settings = socket.app.state.settings
    origin = socket.headers.get("origin", "")
    protocols = socket.scope.get("subprotocols", [])
    if origin not in settings.cors_origins or len(protocols) != 2 or protocols[0] != "nexo.v1":
        await socket.close(code=4403)
        return
    lease = str(uuid4())
    user_key = None
    acquired = False
    try:
        payload = await asyncio.to_thread(services.events.consume_ticket, protocols[1], origin)
        if not payload or "business_id" not in payload:
            await socket.close(code=4401)
            return
        await asyncio.to_thread(services.scheduling.realtime_access, payload)
        user_key = "booking:" + payload["id"]
        acquired = await asyncio.to_thread(services.events.acquire, user_key, lease, settings.ws_connections_per_user * 2)
        if not acquired:
            await socket.close(code=4429)
            return
        channel = services.events.channel(services.scheduling.channel_of(payload["business_id"]))
        async with services.realtime_connection.client.pubsub() as pubsub:
            await pubsub.subscribe(channel)
            await socket.accept(subprotocol="nexo.v1")
            await socket.send_json({"type": "ready", "business_id": payload["business_id"]})
            outgoing = asyncio.Queue(maxsize=128)

            async def receive():
                # The client sends nothing; reading is how a closed connection is noticed.
                while True:
                    frame = await socket.receive()
                    if frame["type"] == "websocket.disconnect":
                        raise WebSocketDisconnect(frame.get("code", 1000))
                    if "text" in frame and len(frame["text"].encode()) > 1024:
                        await socket.close(code=1009)
                        return

            async def events():
                while True:
                    value = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                    if value:
                        outgoing.put_nowait(json.loads(value["data"]))
                    await asyncio.sleep(0.01)

            async def heartbeat():
                while True:
                    await asyncio.sleep(15)
                    # A removed member or a revoked session loses the socket at the next beat.
                    await asyncio.to_thread(services.scheduling.realtime_access, payload)
                    await asyncio.to_thread(services.events.renew, user_key, lease)
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
    except (AccessDenied, ResourceNotFound):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=4401)
    except (RedisError, asyncio.QueueFull, TimeoutError):
        with suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=1013)
    except WebSocketDisconnect:
        pass
    finally:
        if acquired and user_key:
            with suppress(RedisError):
                await asyncio.to_thread(services.events.release, user_key, lease)


# Web Push: the same VAPID key and subscription store as the panel, with the Atendimentos account as the owner ------

@router.get("/push/public-key")
def public_key(request: Request, actor=Depends(booking_session_user)):
    key = request.app.state.settings.vapid_public_key
    if not key:
        raise HTTPException(status_code=503, detail="Push notifications are not configured")
    return {"public_key": key}


@router.post("/push/subscribe", status_code=204)
def subscribe(data: PushSubscription, request: Request, actor=Depends(booking_session_user)):
    request.app.state.services.push.subscribe(actor.id, data.model_dump(mode="json"))


@router.delete("/push/subscribe", status_code=204)
def unsubscribe(data: PushUnsubscribe, request: Request, actor=Depends(booking_session_user)):
    request.app.state.services.push.unsubscribe(actor.id, str(data.endpoint))
