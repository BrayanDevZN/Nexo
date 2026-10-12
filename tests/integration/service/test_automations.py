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
