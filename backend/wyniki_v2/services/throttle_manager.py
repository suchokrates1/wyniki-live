"""UNO API throttling and activity detection."""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, Optional, Tuple

from ..config import log, settings

# Throttling state
UNO_REQUESTS_LOCK = threading.Lock()
UNO_REQUESTS_ENABLED = False
UNO_AUTO_DISABLED_REASON: Optional[str] = None

UNO_POLLING_CONFIG_LOCK = threading.Lock()
UNO_POLLING_CONFIG: Dict[str, float] = {
    "limit": float(settings.uno_hourly_limit_per_court),
    "threshold": 0.8,  # 80%
    "slowdown_factor": 2.0,
    "slowdown_sleep": 1.0,
}

UNO_REQUEST_USAGE_LOCK = threading.Lock()
UNO_REQUEST_USAGE: Dict[str, Deque[datetime]] = {}  # kort_id -> timestamps

UNO_ACTIVITY_LOCK = threading.Lock()
UNO_ACTIVITY_LAST_CHANGE = datetime.now(timezone.utc)
UNO_ACTIVITY_LAST_STAGE = 0
UNO_ACTIVITY_THRESHOLDS = (
    timedelta(minutes=30),
    timedelta(minutes=60),
    timedelta(minutes=90),
)
UNO_ACTIVITY_MULTIPLIERS = (1.0, 2.0, 4.0, 360.0)
UNO_ACTIVITY_LABELS = {
    0: "normalny",
    1: "spowolniony",
    2: "wolny",
    3: "tryb czuwania",
}

UNO_RATE_LIMIT_LOCK = threading.Lock()
UNO_RATE_LIMIT_INFO: Dict[str, Optional[object]] = {
    "header": None,
    "raw": None,
    "limit": None,
    "remaining": None,
    "reset": None,
    "updated": None,
}


def is_uno_requests_enabled() -> bool:
    """Check if UNO requests are enabled."""
    with UNO_REQUESTS_LOCK:
        return UNO_REQUESTS_ENABLED


def set_uno_requests_enabled(enabled: bool, reason: Optional[str] = None) -> None:
    """Enable/disable UNO requests."""
    global UNO_REQUESTS_ENABLED, UNO_AUTO_DISABLED_REASON
    with UNO_REQUESTS_LOCK:
        UNO_REQUESTS_ENABLED = enabled
        UNO_AUTO_DISABLED_REASON = reason
    log.info(f"UNO requests {'enabled' if enabled else 'disabled'}: {reason or 'no reason'}")


def get_uno_auto_disabled_reason() -> Optional[str]:
    """Get reason why UNO was auto-disabled."""
    with UNO_REQUESTS_LOCK:
        return UNO_AUTO_DISABLED_REASON


def get_uno_config() -> Dict[str, float]:
    """Get current UNO throttling configuration."""
    with UNO_POLLING_CONFIG_LOCK:
        return dict(UNO_POLLING_CONFIG)


def update_uno_config(
    *,
    limit: Optional[int] = None,
    threshold: Optional[float] = None,
    slowdown_factor: Optional[float] = None,
    slowdown_sleep: Optional[float] = None,
) -> Dict[str, float]:
    """Update UNO throttling configuration."""
    with UNO_POLLING_CONFIG_LOCK:
        if limit is not None:
            UNO_POLLING_CONFIG["limit"] = float(max(0, limit))
        if threshold is not None:
            UNO_POLLING_CONFIG["threshold"] = max(0.0, min(1.0, threshold))
        if slowdown_factor is not None:
            UNO_POLLING_CONFIG["slowdown_factor"] = float(max(1.0, slowdown_factor))
        if slowdown_sleep is not None:
            UNO_POLLING_CONFIG["slowdown_sleep"] = float(max(0.0, slowdown_sleep))
        
        config = dict(UNO_POLLING_CONFIG)
    
    log.info(f"UNO config updated: {config}")
    return config


def _prune_usage(queue: Deque[datetime], cutoff: datetime) -> None:
    """Remove timestamps older than cutoff."""
    while queue and queue[0] < cutoff:
        queue.popleft()


def record_uno_request(kort_id: str) -> int:
    """Record UNO request and return current hourly count."""
    timestamp = datetime.now(timezone.utc)
    cutoff = timestamp - timedelta(hours=1)
    
    with UNO_REQUEST_USAGE_LOCK:
        queue = UNO_REQUEST_USAGE.setdefault(kort_id, deque())
        queue.append(timestamp)
        _prune_usage(queue, cutoff)
        return len(queue)


def get_uno_hourly_status(kort_id: str) -> Dict[str, Any]:
    """Get hourly usage status for court."""
    timestamp = datetime.now(timezone.utc)
    cutoff = timestamp - timedelta(hours=1)
    
    config = get_uno_config()
    limit = int(config["limit"])
    threshold = config["threshold"]
    
    with UNO_REQUEST_USAGE_LOCK:
        queue = UNO_REQUEST_USAGE.setdefault(kort_id, deque())
        _prune_usage(queue, cutoff)
        count = len(queue)
        oldest = queue[0] if queue else None
    
    next_reset = oldest + timedelta(hours=1) if oldest else None
    
    if not is_uno_requests_enabled():
        mode = "disabled"
    elif limit <= 0:
        mode = "unlimited"
    else:
        ratio = count / float(limit)
        if ratio >= 1.0:
            mode = "limit"
        elif ratio >= threshold:
            mode = "slowdown"
        else:
            mode = "normal"
    
    return {
        "kort_id": kort_id,
        "count": count,
        "limit": limit,
        "remaining": max(0, limit - count) if limit > 0 else None,
        "ratio": count / float(limit) if limit > 0 else 0.0,
        "threshold": threshold,
        "mode": mode,
        "slowdown_factor": config["slowdown_factor"],
        "slowdown_sleep": config["slowdown_sleep"],
        "next_reset": next_reset.isoformat() if next_reset else None,
    }


def get_uno_usage_summary() -> Dict[str, Dict[str, Any]]:
    """Get usage summary for all courts."""
    from .court_manager import available_courts
    
    summary = {}
    for kort_id, _ in available_courts():
        summary[kort_id] = get_uno_hourly_status(kort_id)
    return summary


def record_uno_activity_event(timestamp: Optional[str] = None) -> None:
    """Record activity event (resets inactivity timer)."""
    global UNO_ACTIVITY_LAST_CHANGE, UNO_ACTIVITY_LAST_STAGE
    
    with UNO_ACTIVITY_LOCK:
        UNO_ACTIVITY_LAST_CHANGE = datetime.now(timezone.utc)
        UNO_ACTIVITY_LAST_STAGE = 0
    
    log.debug("UNO activity event recorded")


def get_uno_activity_status() -> Dict[str, Any]:
    """Get current activity detection status."""
    with UNO_ACTIVITY_LOCK:
        last_change = UNO_ACTIVITY_LAST_CHANGE
        last_stage = UNO_ACTIVITY_LAST_STAGE
    
    now = datetime.now(timezone.utc)
    elapsed = (now - last_change).total_seconds()
    
    # Determine stage
    stage = 0
    for i, threshold in enumerate(UNO_ACTIVITY_THRESHOLDS):
        if elapsed >= threshold.total_seconds():
            stage = i + 1
    
    # Update stored stage if changed
    if stage != last_stage:
        with UNO_ACTIVITY_LOCK:
            UNO_ACTIVITY_LAST_STAGE = stage
    
    return {
        "stage": stage,
        "label": UNO_ACTIVITY_LABELS.get(stage, "unknown"),
        "multiplier": UNO_ACTIVITY_MULTIPLIERS[stage],
        "elapsed_seconds": int(elapsed),
        "last_change": last_change.isoformat(),
    }


def get_uno_activity_multiplier() -> float:
    """Get current activity-based slowdown multiplier."""
    status = get_uno_activity_status()
    return status["multiplier"]


def reset_uno_activity_timer(reason: str = "manual") -> Dict[str, Any]:
    """Reset activity timer manually."""
    global UNO_ACTIVITY_LAST_CHANGE, UNO_ACTIVITY_LAST_STAGE
    
    with UNO_ACTIVITY_LOCK:
        UNO_ACTIVITY_LAST_CHANGE = datetime.now(timezone.utc)
        UNO_ACTIVITY_LAST_STAGE = 0
    
    log.info(f"UNO activity timer reset: {reason}")
    return get_uno_activity_status()


def update_uno_rate_limit(headers: Optional[Dict[str, str]]) -> None:
    """Update rate limit info from response headers."""
    if not headers:
        return
    
    with UNO_RATE_LIMIT_LOCK:
        # Look for rate limit headers
        for key in headers:
            if "limit" in key.lower() or "rate" in key.lower():
                UNO_RATE_LIMIT_INFO["header"] = key
                UNO_RATE_LIMIT_INFO["raw"] = headers[key]
                UNO_RATE_LIMIT_INFO["updated"] = datetime.now(timezone.utc).isoformat()
                log.debug(f"Rate limit header found: {key}={headers[key]}")
                break


def get_uno_rate_limit_info() -> Dict[str, Optional[object]]:
    """Get stored rate limit information."""
    with UNO_RATE_LIMIT_LOCK:
        return dict(UNO_RATE_LIMIT_INFO)
