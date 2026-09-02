"""Fleet labels for our umpire tablets vs foreign phones.

Teclast P50Ai units share one model string, so 1–5 are the Vilnius home courts.
OnePlus Pad is the spare: always Tablet 6.
"""
from __future__ import annotations

from typing import Any

# Door number on the court (Court.name), not t31-* suffix.
TECLAST_HOME_COURT = {
    "16": 1,
    "17": 2,
    "3": 3,
    "6": 4,
    "9": 5,
}


def _blob(*parts: Any) -> str:
    return " ".join(str(part or "").lower() for part in parts)


def is_oneplus(device: Any = None, device_model: Any = None, device_manufacturer: Any = None) -> bool:
    text = _blob(device_manufacturer, device, device_model)
    return "opd2480" in text or ("oneplus" in text and "opd" in text)


def is_teclast(device: Any = None, device_model: Any = None, device_manufacturer: Any = None) -> bool:
    text = _blob(device_manufacturer, device, device_model)
    return "p50ai" in text or "teclast" in text


def fleet_label(
    *,
    device: Any = None,
    device_model: Any = None,
    device_manufacturer: Any = None,
    court_name: Any = None,
    platform: Any = None,
) -> str:
    if is_oneplus(device, device_model, device_manufacturer):
        return "Tablet 6"
    if is_teclast(device, device_model, device_manufacturer):
        door = str(court_name or "").strip()
        number = TECLAST_HOME_COURT.get(door)
        if number:
            return f"Tablet {number}"
        return "Tablet (Teclast)"
    for candidate in (
        device,
        " ".join(part for part in (device_manufacturer, device_model) if part).strip(),
        device_model,
    ):
        text = str(candidate or "").strip()
        if text:
            return text
    if str(platform or "").strip().lower() == "pwa":
        return "PWA"
    return "Tablet"


def annotate_tablet(row: dict[str, Any], court_name: str | None = None) -> dict[str, Any]:
    row["label"] = fleet_label(
        device=row.get("device"),
        device_model=row.get("device_model"),
        device_manufacturer=row.get("device_manufacturer"),
        court_name=court_name,
        platform=row.get("platform"),
    )
    return row
