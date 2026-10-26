"""Leads that arrive through paid ads. The site records the first two stages; the team moves them from there."""
from typing import Literal, get_args

PaidLeadStage = Literal["visited", "whatsapp_click", "in_conversation", "qualified", "meeting", "proposal", "won", "lost"]
PAID_LEAD_STAGES: tuple[str, ...] = get_args(PaidLeadStage)
PAID_SOURCE = "google-ads"
