import pytest

from backend.service.access import AccessDenied, ResourceNotFound

# Ruff treats pytest fixture re-exports as duplicate arguments.
# ruff: noqa: F811
from tests.integration.service.test_members import owner, registered, runtime  # noqa: F401


def test_shared_automation_is_visible_to_approved_members_and_notified(runtime):
    admin = owner(runtime)
    member, _ = registered(runtime)
    created = runtime.automations.create(
        member, name="Captura de leads", description="Organiza contatos.",
        filename="captura.json", file_content=b'{"nodes": []}', image_data=None,
    )
    assert created["created_by_name"] == "Ana"
    assert runtime.automations.list(admin)[0]["id"] == created["id"]
    assert runtime.automations.download(admin, created["id"]) == ("captura.json", b'{"nodes": []}')
    notice = next(row for row in runtime.announcements.list_for_user(admin)
                  if row["title"] == "Nova automação disponível: Captura de leads")
    assert "Organiza contatos." in notice["body"]


def test_creator_can_update_and_delete_and_automation_notice_keeps_cover(runtime):
    admin = owner(runtime)
    creator, _ = registered(runtime)
    created = runtime.automations.create(
        creator, name="Leads", description="Versão inicial.", filename="leads.json",
        file_content=b"{}", image_data=b"cover-image",
    )
    assert created["can_manage"] is True
    assert runtime.automations.list(creator)[0]["can_manage"] is True

    updated = runtime.automations.update(
        creator, created["id"], name="Leads v2", description="Versão atualizada.",
        filename=None, file_content=None, image_data=None,
    )
    assert updated["name"] == "Leads v2" and updated["has_image"] is True
    update_notice = next(row for row in runtime.announcements.list_for_user(admin)
                         if row["title"] == "Automação atualizada: Leads v2")
    assert update_notice["has_image"] is True
    assert runtime.announcements.image(admin, update_notice["id"]) == b"cover-image"

    runtime.automations.delete(creator, created["id"])
    delete_notice = next(row for row in runtime.announcements.list_for_user(admin)
                         if row["title"] == "Automação excluída: Leads v2")
    assert delete_notice["has_image"] is True
    assert runtime.announcements.image(admin, delete_notice["id"]) == b"cover-image"
    with pytest.raises(ResourceNotFound):
        runtime.automations.download(admin, created["id"])


def test_owner_can_manage_another_members_automation(runtime):
    admin = owner(runtime)
    creator, _ = registered(runtime)
    outsider = runtime.auth.register(name="Bia", email="bia@example.com", phone="11988888888",
                                     password="strong-password-456")
    notice = next(row for row in runtime.approvals.notifications(admin)
                  if row["requested_user_id"] == outsider.id)
    runtime.approvals.decide(admin, notice["id"], "approved")
    outsider, _ = runtime.auth.login(outsider.email, "strong-password-456")
    created = runtime.automations.create(
        creator, name="Compartilhada", description="Teste.", filename="shared.json",
        file_content=b"{}",
    )
    assert runtime.automations.list(admin)[0]["can_manage"] is True
    with pytest.raises(AccessDenied):
        runtime.automations.update(outsider, created["id"], name="Não permitido", description="Não.")
    result = runtime.automations.update(
        admin, created["id"], name="Revisada", description="Atualizada pelo Owner.",
    )
    assert result["name"] == "Revisada"
