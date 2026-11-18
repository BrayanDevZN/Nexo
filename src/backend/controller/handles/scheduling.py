"""Businesses, teams, services and appointments of /atendimentos. Every route needs the scheduling session."""
import asyncio
from datetime import date as Date
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile

from backend.controller.dependencies import booking_user
from backend.controller.schema.scheduling import (
    AppointmentCreate,
    AppointmentOutput,
    AppointmentPatch,
    BusinessCreate,
    BusinessOutput,
    BusinessPatch,
    InvitationCreate,
    InvitationInfo,
    InvitationOutput,
    MemberOutput,
    MemberRoleInput,
    OverviewOutput,
    PerformanceOutput,
    ServiceCreate,
    ServiceOutput,
    ServicePatch,
)
from backend.domain.photos import PhotoTooLarge, PhotoValidationError
from backend.domain.scheduling import AppointmentStatus, Period
from backend.service.access import AccessDenied, ResourceConflict, ResourceNotFound

router = APIRouter(prefix="/atendimentos", tags=["scheduling"])
ERRORS = (AccessDenied, ResourceConflict, ResourceNotFound, ValueError)


def fail(exc):
    if isinstance(exc, AccessDenied):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ResourceConflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ResourceNotFound):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


def service(request: Request):
    return request.app.state.services.scheduling


# Businesses --------------------------------------------------------------------------------------------------

@router.get("/businesses", response_model=list[BusinessOutput])
def list_businesses(request: Request, actor=Depends(booking_user)):
    return service(request).list_businesses(actor)


@router.post("/businesses", response_model=BusinessOutput, status_code=201)
def create_business(data: BusinessCreate, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).create_business(actor, **data.model_dump(mode="json"))
    except ERRORS as exc:
        raise fail(exc) from None


@router.get("/businesses/{business_id}", response_model=BusinessOutput)
def get_business(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).get_business(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None


@router.patch("/businesses/{business_id}", response_model=BusinessOutput)
def update_business(business_id: str, data: BusinessPatch, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).update_business(actor, business_id, **data.model_dump(mode="json", exclude_unset=True))
    except ERRORS as exc:
        raise fail(exc) from None


@router.delete("/businesses/{business_id}", status_code=204)
def delete_business(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        service(request).delete_business(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(status_code=204)


@router.put("/businesses/{business_id}/photo", response_model=BusinessOutput)
async def upload_business_photo(business_id: str, request: Request, file: UploadFile = File(), actor=Depends(booking_user)):
    try:
        data = await file.read(request.app.state.settings.profile_photo_max_bytes + 1)
        return await asyncio.to_thread(service(request).upload_business_photo, actor, business_id, data)
    except PhotoTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from None
    except PhotoValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except ERRORS as exc:
        raise fail(exc) from None
    finally:
        await file.close()


@router.get("/businesses/{business_id}/photo", responses={200: {"content": {"image/jpeg": {}}}})
def read_business_photo(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        data = service(request).read_business_photo(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(content=data, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/businesses/{business_id}/photo", response_model=BusinessOutput)
def delete_business_photo(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).delete_business_photo(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None


@router.get("/businesses/{business_id}/overview", response_model=OverviewOutput)
def overview(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).overview(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None


# Members and invitations ------------------------------------------------------------------------------------

@router.get("/businesses/{business_id}/members", response_model=list[MemberOutput])
def list_members(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).list_members(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None


@router.patch("/businesses/{business_id}/members/{user_id}", response_model=MemberOutput)
def set_member_role(business_id: str, user_id: str, data: MemberRoleInput, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).set_member_role(actor, business_id, user_id, data.role)
    except ERRORS as exc:
        raise fail(exc) from None


@router.delete("/businesses/{business_id}/members/{user_id}", status_code=204)
def remove_member(business_id: str, user_id: str, request: Request, actor=Depends(booking_user)):
    try:
        service(request).remove_member(actor, business_id, user_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(status_code=204)


@router.get("/businesses/{business_id}/invitations", response_model=list[InvitationOutput])
def list_invitations(business_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).list_invitations(actor, business_id)
    except ERRORS as exc:
        raise fail(exc) from None


@router.post("/businesses/{business_id}/invitations", response_model=InvitationOutput, status_code=201)
def create_invitation(business_id: str, data: InvitationCreate, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).create_invitation(actor, business_id, role=data.role,
                                                  email=str(data.email) if data.email else None)
    except ERRORS as exc:
        raise fail(exc) from None


@router.delete("/businesses/{business_id}/invitations/{invitation_id}", status_code=204)
def delete_invitation(business_id: str, invitation_id: str, request: Request, actor=Depends(booking_user)):
    try:
        service(request).delete_invitation(actor, business_id, invitation_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(status_code=204)


@router.get("/invitations/{token}", response_model=InvitationInfo)
def inspect_invitation(token: str, request: Request):
    try:
        return service(request).inspect_invitation(token)
    except ERRORS as exc:
        raise fail(exc) from None


@router.post("/invitations/{token}/accept", response_model=BusinessOutput)
def accept_invitation(token: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).accept_invitation(actor, token)
    except ERRORS as exc:
        raise fail(exc) from None


# Services ----------------------------------------------------------------------------------------------------

@router.get("/businesses/{business_id}/services", response_model=list[ServiceOutput])
def list_services(business_id: str, request: Request, active: bool | None = None, actor=Depends(booking_user)):
    try:
        return service(request).list_services(actor, business_id, active=active)
    except ERRORS as exc:
        raise fail(exc) from None


@router.post("/businesses/{business_id}/services", response_model=ServiceOutput, status_code=201)
def create_service(business_id: str, data: ServiceCreate, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).create_service(actor, business_id, **data.model_dump(mode="json"))
    except ERRORS as exc:
        raise fail(exc) from None


@router.patch("/businesses/{business_id}/services/{service_id}", response_model=ServiceOutput)
def update_service(business_id: str, service_id: str, data: ServicePatch, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).update_service(actor, business_id, service_id,
                                               **data.model_dump(mode="json", exclude_unset=True))
    except ERRORS as exc:
        raise fail(exc) from None


@router.delete("/businesses/{business_id}/services/{service_id}", status_code=204)
def delete_service(business_id: str, service_id: str, request: Request, actor=Depends(booking_user)):
    try:
        service(request).delete_service(actor, business_id, service_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(status_code=204)


# Appointments ------------------------------------------------------------------------------------------------

@router.get("/businesses/{business_id}/appointments", response_model=list[AppointmentOutput])
def list_appointments(business_id: str, request: Request, starts_from: datetime | None = None,
                      starts_until: datetime | None = None, status: AppointmentStatus | None = None,
                      staff_user_id: str | None = Query(default=None, max_length=36),
                      customer: str | None = Query(default=None, max_length=160),
                      limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
                      period: Period | None = Query(default=None, description="today, tomorrow, day, week, month, next_7_days, next_30_days or upcoming, in the business's time zone"),
                      date: Date | None = Query(default=None, description="Anchor of day, week and month (default: today)"),
                      week_starts: Literal["sunday", "monday"] = "sunday",
                      ends_after: datetime | None = Query(default=None, description="Only appointments that end after this instant (with starts_until, the overlap window of Google Calendar)"),
                      actor=Depends(booking_user)):
    try:
        return service(request).list_appointments(actor, business_id, starts_from=starts_from, starts_until=starts_until,
                                                  status=status, staff_user_id=staff_user_id, customer=customer,
                                                  limit=limit, offset=offset, period=period, date=date,
                                                  week_starts=week_starts, ends_after=ends_after)
    except ERRORS as exc:
        raise fail(exc) from None


@router.get("/businesses/{business_id}/performance", response_model=PerformanceOutput)
def performance(business_id: str, request: Request, starts_from: datetime | None = None,
                starts_until: datetime | None = None,
                period: Period | None = Query(default=None, description="today, tomorrow, day, week, month, next_7_days, next_30_days or upcoming, in the business's time zone"),
                date: Date | None = Query(default=None, description="Anchor of day, week and month (default: today)"),
                week_starts: Literal["sunday", "monday"] = "sunday", actor=Depends(booking_user)):
    try:
        return service(request).performance(actor, business_id, period=period, date=date, starts_from=starts_from,
                                            starts_until=starts_until, week_starts=week_starts)
    except ERRORS as exc:
        raise fail(exc) from None


@router.post("/businesses/{business_id}/appointments", response_model=AppointmentOutput, status_code=201)
def create_appointment(business_id: str, data: AppointmentCreate, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).create_appointment(actor, business_id, **data.model_dump())
    except ERRORS as exc:
        raise fail(exc) from None


@router.get("/businesses/{business_id}/appointments/{appointment_id}", response_model=AppointmentOutput)
def get_appointment(business_id: str, appointment_id: str, request: Request, actor=Depends(booking_user)):
    try:
        return service(request).get_appointment(actor, business_id, appointment_id)
    except ERRORS as exc:
        raise fail(exc) from None


@router.patch("/businesses/{business_id}/appointments/{appointment_id}", response_model=AppointmentOutput)
def update_appointment(business_id: str, appointment_id: str, data: AppointmentPatch, request: Request,
                       actor=Depends(booking_user)):
    try:
        return service(request).update_appointment(actor, business_id, appointment_id,
                                                   **data.model_dump(exclude_unset=True))
    except ERRORS as exc:
        raise fail(exc) from None


@router.delete("/businesses/{business_id}/appointments/{appointment_id}", status_code=204)
def delete_appointment(business_id: str, appointment_id: str, request: Request, actor=Depends(booking_user)):
    try:
        service(request).delete_appointment(actor, business_id, appointment_id)
    except ERRORS as exc:
        raise fail(exc) from None
    return Response(status_code=204)
