"""Sales channels a client can be approached through. The field is optional: no channel is stored as NULL."""
from typing import Literal, get_args

SalesChannel = Literal["email", "whatsapp", "instagram", "google_ads", "phone", "in_person", "other"]
SALES_CHANNELS: tuple[str, ...] = get_args(SalesChannel)


def validate_sales_channel(value: str | None) -> str | None:
    """Return a supported channel (or None for no channel) or raise a useful validation error."""
    if value is not None and value not in SALES_CHANNELS:
        raise ValueError(f"Canal de vendas inválido. Escolha uma das opções: {', '.join(SALES_CHANNELS)}")
    return value
