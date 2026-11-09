"""Pipeline stages. The outbound funnel and the paid-traffic funnel share one column and use different subsets."""
from typing import Literal, get_args

PipelineStage = Literal["lead", "contacted", "qualified", "meeting", "diagnosis", "proposal", "negotiation", "won", "lost"]
PIPELINE_STAGES: tuple[str, ...] = get_args(PipelineStage)
