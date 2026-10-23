from pydantic import BaseModel, ConfigDict, Field, field_validator


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
