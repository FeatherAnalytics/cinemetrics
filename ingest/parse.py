"""Value-coercion helpers shared across the ingest scripts.

These consolidate helpers that were duplicated (with subtle variations) across
scripts/update.py, scripts/fetch_candidates.py, scripts/rebuild_enrichment.py,
and ingest/omdb.py. Behavior is preserved byte-for-byte per call site:

- ``na_none``   (update.py, omdb.py): no strip, ``None`` sentinel.
- ``na_empty``  (fetch_candidates.py): no strip, ``""`` sentinel.
- ``na_clean``  (rebuild_enrichment.py): str-coerce + strip, ``""`` sentinel.
- ``int_or_empty`` / ``float_or_empty``: string outputs for CSV rows.
- ``int_or_none`` / ``float_or_none``: numeric outputs for the DuckDB loaders.
"""

import re


def na_none(v: str | None) -> str | None:
    """None for falsy/"N/A"; otherwise the value unchanged (no strip)."""
    return None if not v or v == "N/A" else v


def na_empty(v: str | None) -> str:
    """"" for falsy/"N/A"; otherwise the value unchanged (no strip)."""
    return "" if not v or v == "N/A" else v


def na_clean(v: object) -> str:
    """str-coerce and strip; "" for empty or "N/A" after stripping."""
    s = "" if v is None else str(v)
    return "" if s.strip() in ("", "N/A") else s.strip()


def int_or_empty(v: object) -> str:
    """Digits-only string, or "" when there are no digits. Handles "1,234"."""
    s = na_clean(v)
    if not s:
        return ""
    digits = re.sub(r"[^0-9]", "", s)
    return digits if digits else ""


def float_or_empty(v: object) -> str:
    """str(float(v)) for parseable numbers, else "". "1,234" is not a float."""
    s = na_clean(v)
    if not s:
        return ""
    try:
        return str(float(s))
    except ValueError:
        return ""


def int_or_none(v: str | None) -> int | None:
    """Digits-only int, or None. Mirrors ingest/omdb.py:_int."""
    s = na_none(v)
    return int(re.sub(r"[^0-9]", "", s)) if s and re.search(r"\d", s) else None


def float_or_none(v: str | None) -> float | None:
    """float(v), or None. Mirrors ingest/omdb.py:_float."""
    s = na_none(v)
    try:
        return float(s) if s else None
    except ValueError:
        return None
