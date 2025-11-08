"""UNO command queue management."""
from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any, Dict, Optional

from ..config import log

UNO_COMMAND_QUEUE_LOCK = threading.Lock()
UNO_PENDING_COMMANDS: Dict[str, OrderedDict[str, Dict[str, Any]]] = {}  # kort_id -> {cmd_id: command}
UNO_COMMAND_MAX_ATTEMPTS = 3


def normalize_kort_id(kort_id: Any) -> Optional[str]:
    """Normalize court ID."""
    if kort_id is None:
        return None
    return str(kort_id).strip() or None


def enqueue_uno_command(
    kort_id: str,
    command: str,
    payload: Optional[Dict[str, Any]] = None,
    command_id: Optional[str] = None,
) -> bool:
    """Add command to UNO queue."""
    normalized_kort = normalize_kort_id(kort_id)
    if not normalized_kort:
        log.warning(f"Invalid kort_id for enqueue: {kort_id}")
        return False
    
    if not command_id:
        import uuid
        command_id = str(uuid.uuid4())
    
    cmd_entry = {
        "command": command,
        "payload": payload or {},
        "command_id": command_id,
        "attempts": 0,
        "max_attempts": UNO_COMMAND_MAX_ATTEMPTS,
    }
    
    with UNO_COMMAND_QUEUE_LOCK:
        if normalized_kort not in UNO_PENDING_COMMANDS:
            UNO_PENDING_COMMANDS[normalized_kort] = OrderedDict()
        
        UNO_PENDING_COMMANDS[normalized_kort][command_id] = cmd_entry
    
    log.info(f"Enqueued UNO command: kort={normalized_kort} cmd={command} id={command_id}")
    return True


def dequeue_uno_command(kort_id: str) -> Optional[Dict[str, Any]]:
    """Get next command from queue (FIFO)."""
    normalized_kort = normalize_kort_id(kort_id)
    if not normalized_kort:
        return None
    
    with UNO_COMMAND_QUEUE_LOCK:
        queue = UNO_PENDING_COMMANDS.get(normalized_kort)
        if not queue:
            return None
        
        # Get first command
        command_id, cmd_entry = next(iter(queue.items()))
        del queue[command_id]
        
        log.debug(f"Dequeued UNO command: kort={normalized_kort} cmd={cmd_entry['command']}")
        return cmd_entry


def requeue_uno_command(kort_id: str, command_entry: Dict[str, Any]) -> bool:
    """Re-add command to queue if attempts remain."""
    normalized_kort = normalize_kort_id(kort_id)
    if not normalized_kort:
        return False
    
    command_entry["attempts"] += 1
    if command_entry["attempts"] >= command_entry.get("max_attempts", UNO_COMMAND_MAX_ATTEMPTS):
        log.warning(f"Command exceeded max attempts: {command_entry}")
        return False
    
    command_id = command_entry.get("command_id", "unknown")
    
    with UNO_COMMAND_QUEUE_LOCK:
        if normalized_kort not in UNO_PENDING_COMMANDS:
            UNO_PENDING_COMMANDS[normalized_kort] = OrderedDict()
        
        # Add to end of queue
        UNO_PENDING_COMMANDS[normalized_kort][command_id] = command_entry
    
    log.info(f"Requeued UNO command: kort={normalized_kort} attempt={command_entry['attempts']}")
    return True


def get_queue_status(kort_id: str) -> Dict[str, Any]:
    """Get queue status for court."""
    normalized_kort = normalize_kort_id(kort_id)
    if not normalized_kort:
        return {"pending": 0, "commands": []}
    
    with UNO_COMMAND_QUEUE_LOCK:
        queue = UNO_PENDING_COMMANDS.get(normalized_kort, OrderedDict())
        commands = list(queue.values())
    
    return {
        "kort_id": normalized_kort,
        "pending": len(commands),
        "commands": [
            {
                "command": cmd["command"],
                "command_id": cmd["command_id"],
                "attempts": cmd["attempts"],
            }
            for cmd in commands
        ],
    }


def get_all_queue_status() -> Dict[str, Dict[str, Any]]:
    """Get queue status for all courts."""
    with UNO_COMMAND_QUEUE_LOCK:
        kort_ids = list(UNO_PENDING_COMMANDS.keys())
    
    return {kort_id: get_queue_status(kort_id) for kort_id in kort_ids}


def clear_queue(kort_id: str) -> int:
    """Clear all pending commands for court."""
    normalized_kort = normalize_kort_id(kort_id)
    if not normalized_kort:
        return 0
    
    with UNO_COMMAND_QUEUE_LOCK:
        queue = UNO_PENDING_COMMANDS.get(normalized_kort, OrderedDict())
        count = len(queue)
        if normalized_kort in UNO_PENDING_COMMANDS:
            del UNO_PENDING_COMMANDS[normalized_kort]
    
    log.info(f"Cleared {count} commands from queue for kort={normalized_kort}")
    return count
