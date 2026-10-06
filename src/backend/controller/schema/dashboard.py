from pydantic import BaseModel

from backend.controller.schema.approvals import NotificationOutput


class MonthlyContracts(BaseModel):
    month: str
    label: str
    count: int


class DashboardOutput(BaseModel):
    members_count: int
    clients_count: int
    documents_count: int
    documents: list[dict]
    contracts_by_month: list[MonthlyContracts]
    announcements: list[NotificationOutput]
