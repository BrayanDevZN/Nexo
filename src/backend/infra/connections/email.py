import logging
from concurrent.futures import Future, ThreadPoolExecutor
from threading import BoundedSemaphore, Lock

import yagmail
from pydantic import EmailStr, TypeAdapter

from backend.infra.config.settings import Settings

logger = logging.getLogger(__name__)
address = TypeAdapter(EmailStr)


class EmailUnavailableError(RuntimeError):
    pass


class EmailQueueFullError(RuntimeError):
    pass


class GmailConnection:
    """Bounded in-process delivery; one SMTP connection per task, never shared."""
    def __init__(self, settings: Settings):
        self.settings = settings
        self._executor = ThreadPoolExecutor(
            max_workers=settings.email_max_workers, thread_name_prefix="nexo-email",
        )
        self._slots = BoundedSemaphore(settings.email_queue_limit)
        self._lock = Lock()
        self._closed = False

    @property
    def configured(self) -> bool:
        return bool(self.settings.email and self.settings.password)

    def send(self, recipient: str, subject: str, body: str) -> Future:
        if not self.configured:
            raise EmailUnavailableError("Gmail credentials are not configured")
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
        smtp = None
        try:
            smtp = yagmail.SMTP(
                user=str(self.settings.email),
                password=self.settings.password.get_secret_value(),
                host="smtp.gmail.com", port=465, smtp_ssl=True,
                timeout=self.settings.email_timeout_seconds,
            )
            # raw prevents user content from being interpreted as local attachments.
            smtp.send(to=recipient, subject=subject, contents=yagmail.raw(body))
        except Exception as error:
            # Never log recipient, body, credentials or raw SMTP exception text.
            raise EmailUnavailableError("Gmail delivery failed") from error
        finally:
            if smtp is not None:
                try:
                    smtp.close()
                except Exception:
                    logger.warning("SMTP connection cleanup failed")

    def _finished(self, future: Future) -> None:
        self._slots.release()
        if not future.cancelled() and future.exception() is not None:
            logger.error("Email delivery failed")

    def close(self) -> None:
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=True, cancel_futures=False)
