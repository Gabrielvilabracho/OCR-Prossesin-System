"""PII masking utilities — GDPR compliance.

NEVER log raw NIF or monetary amounts. Always mask before any logger call.
"""

from decimal import Decimal


def mask_nif(nif: str | None) -> str:
    """Mask a Portuguese NIF for logging.

    Example: '123456789' -> '123***789'
    """
    if not nif:
        return "***"
    if len(nif) < 6:
        return "***"
    return f"{nif[:3]}***{nif[-3:]}"


def mask_amount(amount: Decimal | float | str | None) -> str:
    """Mask a monetary amount for logging.

    Example: Decimal('1234.56') -> '1***.**'
    """
    if amount is None:
        return "***"
    s = str(amount)
    if "." in s:
        integer_part, decimal_part = s.split(".", 1)
        masked_int = integer_part[0] + "***" if len(integer_part) > 1 else "***"
        return f"{masked_int}.{decimal_part[:2]}*"
    return s[0] + "***" if len(s) > 1 else "***"
