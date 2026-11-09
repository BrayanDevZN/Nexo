import re


def brazilian_phone(value):
    """Normalize a phone to +digits; numbers without a country code are Brazilian. None when it cannot be one."""
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if not value.strip().startswith("+") and len(digits) in (10, 11):
        digits = "55" + digits
    return "+" + digits if 10 <= len(digits) <= 15 else None
