from datetime import datetime
from decimal import Decimal
from typing import Literal

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

from backend.controller.schema.auth import ProfileInput, RegistrationConfirmInput, validate_new_password
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
    # pending (waiting for the team), approved, rejected (removed) or expired (the permission ended)
    access_status: Literal["pending", "approved", "rejected", "expired"] = "approved"
    access_expires_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def photo_flag(cls, value):
        if not isinstance(value, dict) and hasattr(value, "profile_photo"):
            from backend.service.scheduling_auth import access_state
            return {"id": value.id, "name": value.name, "email": value.email, "phone": value.phone,
                    "has_photo": bool(value.profile_photo), "access_status": access_state(value),
                    "access_expires_at": value.access_expires_at}
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
    email_sent: bool = False


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
    service_ids: list[str] | None = Field(default=None, max_length=20, description="One or more services: the name, the duration and the price are the sum of them, unless given")
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
    """Only the customer's name is required. No start means now; no services means a plain "Atendimento" of 30 minutes."""
    starts_at: datetime | None = None

    @model_validator(mode="after")
    def valid_period(self):
        if self.ends_at is not None and self.starts_at is not None and self.ends_at <= self.starts_at:
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
    service_ids: list[str] = []
    staff_user_id: str | None
    staff_name: str | None = None
    staff_has_photo: bool = False
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    price: float | None
    notes: str | None
    created_by_id: str | None
    created_by_name: str | None = None
    created_by_has_photo: bool = False
    created_at: datetime
    updated_at: datetime


class OverviewOutput(BaseModel):
    today: int
    next_7_days: int
    upcoming: int
    finished: int
    by_status: dict[str, int]
    next: list[AppointmentOutput]


class PerformanceRow(BaseModel):
    """One person's numbers in a period. `user_id` is None for appointments nobody was assigned to."""
    user_id: str | None
    name: str
    role: BusinessRole | None = None
    has_photo: bool = False
    total: int
    active: int
    done: int
    cancelled: int
    no_show: int
    revenue: float
    created: int


class PerformanceOutput(BaseModel):
    starts_from: datetime | None
    starts_until: datetime | None
    total: int
    done: int
    revenue: float
    rows: list[PerformanceRow]


class BookingConfirmInput(RegistrationConfirmInput):
    """Confirming the e-mail code; an access link the person came through may come along."""
    access_token: str | None = Field(default=None, max_length=64)


class BookingGoogleCompleteInput(BookingProfileInput):
    access_token: str | None = Field(default=None, max_length=64)


class AccessRedeemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=64)


class AccessLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str | None = Field(default=None, max_length=160)
    access_days: int | None = Field(default=None, ge=1, le=3650, description="How long the permission lasts after the person joins; empty: no end")
    max_uses: int = Field(default=1, ge=1, le=100)
    valid_days: int = Field(default=14, ge=1, le=90, description="How long the link itself can be used")


class AccessLinkOutput(BaseModel):
    id: str
    note: str | None
    access_days: int | None
    max_uses: int
    uses: int
    expires_at: datetime
    created_at: datetime
    active: bool
    url: str | None = None


class AccessLinkInfo(BaseModel):
    access_days: int | None


class AccessBusiness(BaseModel):
    name: str
    role: BusinessRole


class AccessUserOutput(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    has_photo: bool
    status: Literal["pending", "approved", "rejected", "expired"]
    access_expires_at: datetime | None
    access_source: str | None
    role: BusinessRole | None
    role_label: str | None
    businesses: list[AccessBusiness]
    created_at: datetime


class AccessUsersOutput(BaseModel):
    counts: dict[str, int]
    users: list[AccessUserOutput]


class AccessDecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approved", "rejected", "pending"]
    days: int | None = Field(default=None, ge=1, le=3650, description="With approved: how long it lasts; empty: no end")
