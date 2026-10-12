import hashlib
import logging
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from threading import BoundedSemaphore, Lock

import httpx
import jwt
from pydantic import EmailStr, TypeAdapter

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)
address = TypeAdapter(EmailStr)
RESEND_MONTHLY_LIMIT = 70
RESEND_COUNTER_TTL_SECONDS = 70 * 24 * 60 * 60

INCREMENT_RESEND_COUNTER = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return count
"""

MARK_RESEND_QUOTA_EXHAUSTED = """
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count <= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], tonumber(ARGV[1]) + 1, 'EX', tonumber(ARGV[2]))
  return tonumber(ARGV[1]) + 1
end
return count
"""


class EmailUnavailableError(RuntimeError):
    def __init__(self, message, *, category="unavailable", smtp_code=None):
        super().__init__(message)
        self.category, self.smtp_code = category, smtp_code


class EmailQueueFullError(RuntimeError):
    pass


class ResendConnection:
    """Bounded delivery through Resend, switching to the n8n webhook after its monthly quota."""
    def __init__(self, settings: Settings, redis_client=None):
        self.settings = settings
        self.redis = redis_client
        self._quota_namespace = hashlib.sha256(settings.database_url.encode()).hexdigest()[:16]
        self._client = httpx.Client(
            base_url="https://api.resend.com", timeout=settings.email_timeout_seconds,
            trust_env=False,
            headers={
                "Authorization": "Bearer " + (settings.resend_key.get_secret_value()
                                                if settings.resend_key else ""),
                "Content-Type": "application/json",
            },
        )
        self._n8n_client = httpx.Client(timeout=settings.email_timeout_seconds, trust_env=False)
        self._executor = ThreadPoolExecutor(
            max_workers=settings.email_max_workers, thread_name_prefix="nexo-email",
        )
        self._slots = BoundedSemaphore(settings.email_queue_limit)
        self._lock = Lock()
        self._closed = False

    @property
    def configured(self) -> bool:
        return self.resend_configured or self.n8n_configured

    @property
    def resend_configured(self) -> bool:
        return bool(self.settings.email and self.sender and self.settings.resend_key)

    @property
    def n8n_configured(self) -> bool:
        return bool(self.settings.url_email_n8n and self.settings.secret_email_n8n)

    @property
    def sender(self) -> str | None:
        return str(self.settings.resend_from or self.settings.email) if self.settings.email else None

    def send(self, recipient: str, subject: str, body: str, *, html: str | None = None) -> Future:
        if not self.configured:
            raise EmailUnavailableError("Resend credentials are not configured")
        recipient = str(address.validate_python(recipient))
        if not subject or "\r" in subject or "\n" in subject:
            raise ValueError("Subject must be nonempty and contain no line breaks")
        if html is not None and not html.strip():
            raise ValueError("HTML email body must be nonempty")
        with self._lock:
            if self._closed:
                raise EmailUnavailableError("Email sender is closed")
            if not self._slots.acquire(blocking=False):
                raise EmailQueueFullError("Email queue capacity reached")
            try:
                future = self._executor.submit(self._deliver, recipient, subject, body, html)
            except BaseException:
                self._slots.release()
                raise
        future.add_done_callback(self._finished)
        return future

    def _deliver(self, recipient: str, subject: str, body: str, html: str | None = None):
        try:
            provider = self._delivery_provider()
            if provider == "n8n":
                return self._deliver_n8n(recipient, subject, body, html)
            try:
                return self._deliver_resend(recipient, subject, body, html)
            except EmailUnavailableError as error:
                # Resend may already be exhausted before this Redis counter existed.
                # A 429 is an explicit rejection, so safely retry this message via n8n.
                if error.category != "rate_limit" or not self.n8n_configured:
                    raise
                self._mark_resend_quota_exhausted()
                logger.warning("Resend monthly quota exhausted; switching email delivery to n8n")
                return self._deliver_n8n(recipient, subject, body, html)
        except EmailUnavailableError:
            raise
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ProtocolError, OSError) as error:
            raise EmailUnavailableError("Email delivery failed", category="network") from error
        except Exception as error:
            raise EmailUnavailableError("Email delivery failed", category="unexpected") from error

    def _delivery_provider(self) -> str:
        if not self.resend_configured:
            if self.n8n_configured:
                return "n8n"
            raise EmailUnavailableError("Email providers are not configured")
        # Keep standalone callers/tests compatible; RuntimeServices always supplies Redis.
        if self.redis is None:
            return "resend"
        now = datetime.now(timezone.utc)
        key = f"nexo:email:resend:{self._quota_namespace}:{now:%Y-%m}"
        try:
            count = int(self.redis.eval(INCREMENT_RESEND_COUNTER, 1, key,
                                        RESEND_COUNTER_TTL_SECONDS))
        except Exception as error:
            raise EmailUnavailableError("Email quota counter is unavailable",
                                        category="quota_counter") from error
        if count <= RESEND_MONTHLY_LIMIT:
            return "resend"
        if not self.n8n_configured:
            raise EmailUnavailableError("Resend monthly email limit reached and n8n is not configured",
                                        category="quota_exhausted")
        return "n8n"

    def _mark_resend_quota_exhausted(self) -> None:
        if self.redis is None:
            return
        now = datetime.now(timezone.utc)
        key = f"nexo:email:resend:{self._quota_namespace}:{now:%Y-%m}"
        try:
            self.redis.eval(MARK_RESEND_QUOTA_EXHAUSTED, 1, key,
                            RESEND_MONTHLY_LIMIT, RESEND_COUNTER_TTL_SECONDS)
        except Exception:
            # The current message can still use n8n; a later message will retry the
            # Redis increment and fall back again if Resend continues returning 429.
            logger.warning("Could not persist Resend quota exhaustion in Redis")

    def _deliver_resend(self, recipient: str, subject: str, body: str, html: str | None):
        try:
            payload = {
                "from": self.sender, "to": [recipient],
                "subject": subject, "text": body,
            }
            if html is not None:
                payload["html"] = html
            response = self._client.post("/emails", json=payload)
            if 200 <= response.status_code < 300:
                return response.json()
            self._raise_provider_error("Resend", response.status_code)
        except EmailUnavailableError:
            raise
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ProtocolError, OSError) as error:
            raise EmailUnavailableError("Resend delivery failed", category="network") from error
        except Exception as error:
            raise EmailUnavailableError("Resend delivery failed", category="unexpected") from error

    def _deliver_n8n(self, recipient: str, subject: str, body: str, html: str | None):
        now = int(datetime.now(timezone.utc).timestamp())
        token = jwt.encode(
            {"iat": now, "exp": now + 3600},
            self.settings.secret_email_n8n.get_secret_value(),
            algorithm="HS256",
        )
        response = self._n8n_client.post(
            self.settings.url_email_n8n,
            headers={"Authorization": "Bearer " + token},
            json={"to": recipient, "type": "html" if html is not None else "text",
                  "subject": subject, "content": html if html is not None else body},
        )
        if not 200 <= response.status_code < 300:
            self._raise_provider_error("n8n", response.status_code)
        if not response.content:
            return {"status_code": response.status_code}
        try:
            return response.json()
        except ValueError:
            return {"status_code": response.status_code}

    @staticmethod
    def _raise_provider_error(provider: str, status: int):
        category = ("authentication" if status in {401, 403} else
                    "rate_limit" if status == 429 else
                    "recipient_rejected" if 400 <= status < 500 else "provider")
        raise EmailUnavailableError(f"{provider} delivery failed", category=category,
                                    smtp_code=status if 100 <= status <= 599 else None)

    def _finished(self, future: Future) -> None:
        self._slots.release()
        if not future.cancelled() and future.exception() is not None:
            error = future.exception()
            logger.error("Email delivery failed: category=%s smtp_code=%s",
                         getattr(error, "category", "unexpected"), getattr(error, "smtp_code", None))

    def close(self) -> None:
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=True, cancel_futures=False)
        self._client.close()
        self._n8n_client.close()


# Source-compatible alias; the implementation no longer uses SMTP or yagmail.
GmailConnection = ResendConnection
