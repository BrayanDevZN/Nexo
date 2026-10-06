from pydantic import BaseModel

from backend.controller.schema.approvals import NotificationOutput


class MonthlyContracts(BaseModel):
    month: str
    label: str
    count: int


class DashboardOutput(BaseModel):
    members_count: int
    clients_count: int
    funnel: dict[str, int]
    potential_value: float
    closed_value: float
    conversion_rate: float
    documents_count: int
    documents: list[dict]
    contracts_by_month: list[MonthlyContracts]
    announcements: list[NotificationOutput]
