"""Pydantic models for type safety and validation."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, validator


class PlayerData(BaseModel):
    """Player data in a match."""
    full_name: str = "-"
    surname: str = "-"
    points: str = "0"
    current_games: int = 0
    set1: int = 0
    set2: int = 0
    set3: int = 0
    flag_code: Optional[str] = None
    flag_url: Optional[str] = None
    flag_lookup_surname: Optional[str] = None


class TiebreakData(BaseModel):
    """Tiebreak score data."""
    A: int = 0
    B: int = 0
    locked: bool = False
    visible: bool = False


class MatchTime(BaseModel):
    """Match timing information."""
    running: bool = False
    seconds: int = 0
    started_ts: Optional[str] = None
    finished_ts: Optional[str] = None
    resume_ts: Optional[str] = None
    offset_seconds: int = 0
    auto_resume: bool = True


class MatchStatus(BaseModel):
    """Match status information."""
    active: bool = False
    last_completed: Optional[str] = None


class HistoryMeta(BaseModel):
    """Match history metadata."""
    category: Optional[str] = None
    phase: str = "Grupowa"


class CourtState(BaseModel):
    """Complete state of a tennis court."""
    A: PlayerData = Field(default_factory=PlayerData)
    B: PlayerData = Field(default_factory=PlayerData)
    current_set: Optional[int] = None
    serve: str = "A"
    tie: TiebreakData = Field(default_factory=TiebreakData)
    match_time: MatchTime = Field(default_factory=MatchTime)
    match_status: MatchStatus = Field(default_factory=MatchStatus)
    history_meta: HistoryMeta = Field(default_factory=HistoryMeta)
    overlay_visible: Optional[bool] = None
    mode: Optional[str] = None
    updated: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "+00:00")


class HistoryEntry(BaseModel):
    """Match history entry."""
    id: Optional[int] = None
    kort_id: str
    ended_ts: str
    player_a: str
    player_b: str
    duration_seconds: int = 0
    set1_a: int = 0
    set1_b: int = 0
    set2_a: int = 0
    set2_b: int = 0
    set3_a: int = 0
    set3_b: int = 0
    tie_a: int = 0
    tie_b: int = 0
    set1_tb_a: int = 0
    set1_tb_b: int = 0
    set2_tb_a: int = 0
    set2_tb_b: int = 0
    category: Optional[str] = None
    phase: str = "Grupowa"


class CourtConfig(BaseModel):
    """Court configuration."""
    kort_id: str
    overlay_id: Optional[str] = None
    enabled: bool = True


class PlayerRecord(BaseModel):
    """Player database record."""
    surname: str
    flag_code: Optional[str] = None


class AppSettings(BaseModel):
    """Application settings."""
    youtube_api_key: Optional[str] = None
    youtube_stream_id: Optional[str] = None


class UnoRateLimitInfo(BaseModel):
    """UNO API rate limit information."""
    mode: str  # "normal", "slowdown", "limit"
    count: int
    limit: int
    window_minutes: int = 60


class UnoCommand(BaseModel):
    """UNO API command."""
    command: str
    player: Optional[str] = None  # "A" or "B"
    value: Optional[str] = None

    @validator('player')
    def validate_player(cls, v):
        if v is not None and v not in ["A", "B"]:
            raise ValueError("Player must be 'A' or 'B'")
        return v


class SnapshotResponse(BaseModel):
    """API snapshot response."""
    courts: Dict[str, CourtState]
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "+00:00")


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str  # "healthy", "degraded", "unhealthy"
    version: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "+00:00")
    components: Dict[str, str]  # component_name -> status


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    message: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "+00:00")

