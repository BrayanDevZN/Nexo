import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from uuid import uuid4

from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

logger = logging.getLogger(__name__)

MAX_LEADS = 200
KEEP_FINISHED_SECONDS = 3600
FINAL = {"created", "duplicate", "failed"}


@dataclass
class _Batch:
    id: str
    owner_id: str
    actor: object
    niche: str
    items: list[str]
    created_at: float = field(default_factory=time.monotonic)
    finished_at: float | None = None


class FunnelImportService:
    """Saves Google Maps leads as funnel clients in the background, one task per lead.

    A batch answers immediately; each lead is its own task and its status can be polled while the
    clients are created. State lives in this process: a restart drops unfinished batches.
    """

    def __init__(self, clients):
        self.clients = clients
        self._batches: dict[str, _Batch] = {}
        self._lock = threading.Lock()
        # A single worker keeps leads in order and makes the duplicate check deterministic.
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="nexo-funnel")

    def submit(self, actor, niche: str, leads: list[dict]) -> dict:
        if not leads or len(leads) > MAX_LEADS:
            raise ValueError(f"Envie de 1 a {MAX_LEADS} leads")
        with self._lock:
            self._forget_old()
            if any(batch.owner_id == actor.id and batch.finished_at is None for batch in self._batches.values()):
                raise ResourceConflict("Já existe uma adição ao funil em andamento. Aguarde terminar.")
            batch = _Batch(id=str(uuid4()), owner_id=actor.id, actor=actor, niche=niche, items=["queued"] * len(leads))
            self._batches[batch.id] = batch
        for index, lead in enumerate(leads):
            self._executor.submit(self._run, batch, index, lead)
        return self._snapshot(batch)

    def status(self, actor, identifier: str) -> dict:
        with self._lock:
            batch = self._batches.get(identifier)
            if batch is None or batch.owner_id != actor.id:
                raise ResourceNotFound("Batch not found")
            return self._snapshot(batch)

    def _run(self, batch: _Batch, index: int, lead: dict) -> None:
        with self._lock:
            batch.items[index] = "processing"
        try:
            result = self.clients.import_leads(batch.actor, batch.niche, [lead])
            status = "created" if result["created"] else "duplicate"
        except AccessDenied:
            status = "failed"
        except Exception:
            logger.warning("Funnel lead could not be saved", exc_info=True)
            status = "failed"
        with self._lock:
            batch.items[index] = status
            if all(item in FINAL for item in batch.items):
                batch.finished_at = time.monotonic()

    def _snapshot(self, batch: _Batch) -> dict:
        items = list(batch.items)
        return {
            "id": batch.id, "total": len(items), "done": sum(item in FINAL for item in items),
            "created": items.count("created"), "skipped": items.count("duplicate"), "failed": items.count("failed"),
            "finished": batch.finished_at is not None, "items": items,
        }

    def _forget_old(self) -> None:
        limit = time.monotonic() - KEEP_FINISHED_SECONDS
        for identifier in [key for key, batch in self._batches.items()
                           if batch.finished_at is not None and batch.finished_at < limit]:
            del self._batches[identifier]

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
