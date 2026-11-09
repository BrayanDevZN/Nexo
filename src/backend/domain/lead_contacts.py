import re
from urllib.parse import urlparse

# What the team wants from the leads found on the map. Mirrors src/frontend/admin/leadContact.ts.
CONTACT_CHOICES = ("any", "whatsapp", "email", "instagram", "site", "both")
CONTACT_LABELS = {"whatsapp": "WhatsApp", "email": "e-mail", "instagram": "Instagram", "site": "site",
                  "both": "WhatsApp e e-mail"}

# Links that are not a company's own site: networks and link-in-bio pages. Instagram has its own contact.
_SOCIAL_HOSTS = ("facebook.com", "fb.com", "fb.me", "wa.me", "whatsapp.com", "linktr.ee", "tiktok.com", "youtube.com",
                 "youtu.be", "x.com", "twitter.com", "linkedin.com", "beacons.ai")
_EMAIL = re.compile(r"[^\s,;@]+@[^\s,;@]+\.[^\s,;@]+")


def _host(url: str | None) -> str | None:
    text = (url or "").strip()
    if not text:
        return None
    try:
        host = urlparse(text if re.match(r"^[a-z][a-z\d+.-]*://", text, re.I) else f"https://{text}").hostname
    except ValueError:
        return None
    return re.sub(r"^(www|m)\.", "", host.lower()) if host else None


def _on(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def _is_instagram(website: str | None) -> bool:
    host = _host(website)
    return bool(host and (_on(host, "instagram.com") or host == "instagr.am"))


def _is_site(website: str | None) -> bool:
    host = _host(website)
    return bool(host and not _is_instagram(website) and not any(_on(host, domain) for domain in _SOCIAL_HOSTS))


def _is_mobile(phone: str | None) -> bool:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) in (12, 13) and digits.startswith("55"):
        digits = digits[2:]
    return len(digits) == 11 and digits[2] == "9"


def matches_contact(lead: dict, choice: str) -> bool:
    whatsapp, email = _is_mobile(lead.get("phone")), bool(_EMAIL.search(lead.get("emails") or ""))
    if choice == "whatsapp":
        return whatsapp
    if choice == "email":
        return email
    if choice == "instagram":
        return _is_instagram(lead.get("website"))
    if choice == "site":
        return _is_site(lead.get("website"))
    if choice == "both":
        return whatsapp and email
    return True


def clean_instagram(value: str | None) -> str | None:
    """An Instagram profile as a link; "@user" and "user" are accepted too. Anything else is rejected."""
    text = (value or "").strip()
    if not text:
        return None
    if not re.match(r"^[a-z][a-z\d+.-]*://", text, re.I) and not _host(text.split("/")[0] + "/") == "instagram.com" \
            and "instagram.com" not in text.lower() and "instagr.am" not in text.lower():
        handle = text.lstrip("@").strip("/")
        if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", handle):
            raise ValueError("Invalid Instagram profile")
        return f"https://www.instagram.com/{handle}"
    link = text if re.match(r"^[a-z][a-z\d+.-]*://", text, re.I) else f"https://{text}"
    if not _is_instagram(link):
        raise ValueError("Invalid Instagram profile")
    return link


def clean_website(value: str | None) -> str | None:
    """A company website as a link ("https://" is added when missing)."""
    text = (value or "").strip()
    if not text:
        return None
    link = text if re.match(r"^https?://", text, re.I) else f"https://{text}"
    host = _host(link)
    if not host or "." not in host or " " in text:
        raise ValueError("Invalid website")
    return link
