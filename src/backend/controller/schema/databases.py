from pydantic import BaseModel, ConfigDict, Field


class SqlQueryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sql: str = Field(min_length=1, max_length=10000)
