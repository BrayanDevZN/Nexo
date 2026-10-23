from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.domain.client_niches import validate_client_niche


class MapsJobInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="Busca Nexo", min_length=1, max_length=80)
    keywords: list[str] = Field(min_length=1, max_length=10)
    lang: str = Field(default="pt", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius: int = Field(default=10000, ge=100, le=50000)
    zoom: int = Field(default=15, ge=1, le=21)
    depth: int = Field(default=3, ge=1, le=20)
    niche: str | None = Field(default=None, max_length=120)
    email: bool = False
    fast_mode: bool = False
    max_time: int = Field(default=300, ge=60, le=1800)

    @field_validator("keywords")
    @classmethod
    def clean_keywords(cls, values: list[str]):
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 120 for value in cleaned):
            raise ValueError("Each keyword must have 1 to 120 characters")
        return cleaned


class MapsKeyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(pattern=r"^nexo_live_[A-Za-z0-9_-]{8,140}$")


class MapsLead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=500)
    emails: str | None = Field(default=None, max_length=1000)
    review_rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int | None = Field(default=None, ge=0)
    link: str | None = Field(default=None, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be blank")
        return value


class MapsFunnelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    niche: str
    leads: list[MapsLead] = Field(min_length=1, max_length=200)

    @field_validator("niche")
    @classmethod
    def valid_niche(cls, value: str):
        return validate_client_niche(value.strip())
