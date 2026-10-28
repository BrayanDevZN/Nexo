from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _VideoOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fps: Literal[24, 30, 60] = 30
    quality: Literal["draft", "standard", "high"] = "standard"


class VideoCreateInput(_VideoOptions):
    """A composition already written in HTML (HyperFrames format)."""
    html: str = Field(min_length=20, max_length=300_000)


class VideoGenerateInput(_VideoOptions):
    """What the video should be; the AI writes the HTML."""
    prompt: str = Field(min_length=10, max_length=2000)
    aspect: Literal["landscape", "vertical", "square"] = "landscape"
    seconds: int = Field(default=15, ge=3, le=60)

    @field_validator("prompt")
    @classmethod
    def clean_prompt(cls, value: str):
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Describe the video in at least 10 characters")
        return value
