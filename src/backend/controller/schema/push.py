from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class PushKeys(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p256dh: str = Field(min_length=16, max_length=512)
    auth: str = Field(min_length=8, max_length=256)


class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: HttpUrl
    keys: PushKeys


class PushUnsubscribe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: HttpUrl
