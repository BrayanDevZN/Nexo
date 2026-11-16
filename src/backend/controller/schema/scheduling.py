from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    StrictBool,
    field_validator,
    model_validator,
)

from backend.controller.schema.auth import ProfileInput, validate_new_password
from backend.domain.scheduling import (
    AppointmentStatus,
    BusinessRole,
    InvitableRole,
    clean_cnpj,
    validate_opening_hours,
)

STATE = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")


def _phone(value):
    return ProfileInput.clean_phone(value) if value is not None else None


class BookingRegistrationInput(ProfileInput):
    email: EmailStr
    password: SecretStr

    @field_validator("password")
    @classmethod
    def password_policy(cls, value):
        return validate_new_password(value)


class BookingProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return _phone(value)


class BookingUserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    phone: str | None
    has_photo: bool = False

    @model_validator(mode="before")
    @classmethod
    def photo_flag(cls, value):
        if not isinstance(value, dict) and hasattr(value, "profile_photo"):
            return {"id": value.id, "name": value.name, "email": value.email, "phone": value.phone,
                    "has_photo": bool(value.profile_photo)}
        return value


class BusinessFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    cnpj: str | None = Field(default=None, max_length=18)
    description: str | None = Field(default=None, max_length=2000)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = STATE
    timezone: str = Field(default="America/Sao_Paulo", max_length=64)
    opening_hours: dict | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return _phone(value)

    @field_validator("cnpj")
    @classmethod
    def valid_cnpj(cls, value):
        return clean_cnpj(value)

    @field_validator("state")
    @classmethod
    def upper_state(cls, value):
        return value.upper() if value else None

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone") from None
        return value

    @field_validator("opening_hours")
    @classmethod
    def hours(cls, value):
        return validate_opening_hours(value)


class BusinessCreate(BusinessFields):
    @model_validator(mode="after")
    def default_hours(self):
        if self.opening_hours is None:
            self.opening_hours = validate_opening_hours(None)
        return self


class BusinessPatch(BusinessFields):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is None or not value.strip():
            raise ValueError("Name cannot be null or blank")
        return value.strip()

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value):
        if value is None:
            raise ValueError("timezone cannot be null")
        return BusinessFields.known_timezone(value)

    @field_validator("opening_hours")
    @classmethod
    def hours(cls, value):
        if value is None:
            raise ValueError("opening_hours cannot be null")
        return validate_opening_hours(value)

    @model_validator(mode="after")
    def not_empty(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self


class BusinessOutput(BaseModel):
    id: str
    owner_id: str
    name: str
    slug: str
    cnpj: str | None = None
    description: str | None
    phone: str | None
    email: str | None
    address: str | None
    city: str | None
    state: str | None
    timezone: str
    opening_hours: dict
    has_photo: bool = False
    my_role: BusinessRole
    created_at: datetime
    updated_at: datetime


class MemberOutput(BaseModel):
    id: str
    business_id: str
    user_id: str
    role: BusinessRole
    name: str | None = None
    email: str | None = None
    has_photo: bool = False
    created_at: datetime


class MemberRoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: InvitableRole


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: InvitableRole
    email: EmailStr | None = None


class InvitationOutput(BaseModel):
    id: str
    business_id: str
    email: str | None
    role: InvitableRole
    created_by_id: str
    expires_at: datetime
    created_at: datetime
    url: str | None = None


class InvitationInfo(BaseModel):
    business_name: str
    role: InvitableRole
    email: str | None
    expires_at: datetime


class ServiceFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    duration_minutes: int = Field(ge=5, le=24 * 60)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    active: StrictBool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


class ServiceCreate(ServiceFields):
    pass


class ServicePatch(ServiceFields):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    duration_minutes: int | None = Field(default=None, ge=5, le=24 * 60)
    active: StrictBool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is None or not value.strip():
            raise ValueError("Name cannot be null or blank")
        return value.strip()

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        for field in ("duration_minutes", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(field + " cannot be null")
        return self


class ServiceOutput(BaseModel):
    id: str
    business_id: str
    name: str
    description: str | None
    duration_minutes: int
    price: float | None
    active: bool
    created_at: datetime
    updated_at: datetime


class AppointmentFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_id: str | None = Field(default=None, max_length=36)
    service_name: str | None = Field(default=None, min_length=1, max_length=160)
    staff_user_id: str | None = Field(default=None, max_length=36)
    customer_name: str = Field(min_length=1, max_length=160)
    customer_phone: str | None = Field(default=None, max_length=30)
    customer_email: EmailStr | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    status: AppointmentStatus = "scheduled"
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("customer_name", "service_name")
    @classmethod
    def clean_text(cls, value):
        if value is not None and not value.strip():
            raise ValueError("Field cannot be blank")
        return value.strip() if value else value

    @field_validator("customer_phone")
    @classmethod
    def clean_phone(cls, value):
        return _phone(value)


class AppointmentCreate(AppointmentFields):
    @model_validator(mode="after")
    def service_or_manual(self):
        if not self.service_id and (not self.service_name or self.ends_at is None):
            raise ValueError("Choose a service, or give service_name and ends_at")
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class AppointmentPatch(AppointmentFields):
    customer_name: str | None = Field(default=None, min_length=1, max_length=160)
    starts_at: datetime | None = None
    status: AppointmentStatus | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        for field in ("customer_name", "starts_at", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(field + " cannot be null")
        return self


class AppointmentOutput(BaseModel):
    id: str
    business_id: str
    service_id: str | None
    service_name: str
    staff_user_id: str | None
    staff_name: str | None = None
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    price: float | None
    notes: str | None
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class OverviewOutput(BaseModel):
    today: int
    next_7_days: int
    upcoming: int
    finished: int
    by_status: dict[str, int]
    next: list[AppointmentOutput]
