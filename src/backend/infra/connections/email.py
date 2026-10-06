import logging
from concurrent.futures import Future, ThreadPoolExecutor
from threading import BoundedSemaphore, Lock

import httpx
from pydantic import EmailStr, TypeAdapter

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)
address = TypeAdapter(EmailStr)


class EmailUnavailableError(RuntimeError):
    def __init__(self, message, *, category="unavailable", smtp_code=None):
        super().__init__(message)
        self.category, self.smtp_code = category, smtp_code


class EmailQueueFullError(RuntimeError):
    pass


class ResendConnection:
    """Bounded in-process delivery through Resend's HTTPS API."""
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = httpx.Client(
            base_url="https://api.resend.com", timeout=settings.email_timeout_seconds,
            trust_env=False,
            headers={
                "Authorization": "Bearer " + (settings.resend_key.get_secret_value()
                                                if settings.resend_key else ""),
                "Content-Type": "application/json",
            },
        )
        self._executor = ThreadPoolExecutor(
            max_workers=settings.email_max_workers, thread_name_prefix="nexo-email",
        )
        self._slots = BoundedSemaphore(settings.email_queue_limit)
        self._lock = Lock()
        self._closed = False

    @property
    def configured(self) -> bool:
        return bool(self.settings.email and self.sender and self.settings.resend_key)

    @property
    def sender(self) -> str | None:
        return str(self.settings.resend_from or self.settings.email) if self.settings.email else None

    def send(self, recipient: str, subject: str, body: str) -> Future:
        if not self.configured:
            raise EmailUnavailableError("Resend credentials are not configured")
        recipient = str(address.validate_python(recipient))
        if not subject or "\r" in subject or "\n" in subject:
            raise ValueError("Subject must be nonempty and contain no line breaks")
        with self._lock:
            if self._closed:
                raise EmailUnavailableError("Email sender is closed")
            if not self._slots.acquire(blocking=False):
                raise EmailQueueFullError("Email queue capacity reached")
            try:
                future = self._executor.submit(self._deliver, recipient, subject, body)
            except BaseException:
                self._slots.release()
                raise
        future.add_done_callback(self._finished)
        return future

    def _deliver(self, recipient: str, subject: str, body: str):
        try:
            response = self._client.post("/emails", json={
                "from": self.sender, "to": [recipient],
                "subject": subject, "text": body,
            })
            if 200 <= response.status_code < 300:
                return response.json()
            status = response.status_code
            category = ("authentication" if status in {401, 403} else
                        "rate_limit" if status == 429 else
                        "recipient_rejected" if 400 <= status < 500 else "provider")
            raise EmailUnavailableError("Resend delivery failed", category=category,
                                        smtp_code=status if 100 <= status <= 599 else None)
        except EmailUnavailableError:
            raise
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ProtocolError, OSError) as error:
            raise EmailUnavailableError("Resend delivery failed", category="network") from error
        except Exception as error:
            raise EmailUnavailableError("Resend delivery failed", category="unexpected") from error

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


# Source-compatible alias; the implementation no longer uses SMTP or yagmail.
GmailConnection = ResendConnection
