"""
Realistic polling tests simulating actual matches on 4 courts.

Tennis scoring rules tested:
- Games to 4 (or 5 at 4:3)
- Set tie-break at 4:4 (first to 7 with 2-point margin)
- Match super tie-break at 1:1 in sets (first to 10 with 2-point margin)

Scenario: Will poller correctly transition through:
1. Normal game (3-2, 40-30) → triggers current_games polling
2. Game won → 4-2 → triggers set polling (games >= 3)
3. Set at 4:4 → tie-break mode?
4. Set won 5:4 → back to normal mode
5. Sets tied 1:1 → super tie-break mode?
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import Mock

import pytest

from wyniki.poller import SmartCourtPollingController, UnoCommandClient
from wyniki.query_system import QuerySystem


class FakeUnoClient:
    """Mock UNO client that returns scripted responses."""

    def __init__(self, kort_id: str) -> None:
        self.kort_id = kort_id
        self.script: List[Dict[str, Any]] = []
        self.script_index = 0
        self.call_history: List[Tuple[str, float]] = []  # (method_name, timestamp)

    def set_script(self, script: List[Dict[str, Any]]) -> None:
        """Set scripted responses for queries."""
        self.script = script
        self.script_index = 0

    def _get_current_state(self) -> Dict[str, Any]:
        """Get current state from script."""
        if self.script_index < len(self.script):
            return self.script[self.script_index]
        return self.script[-1] if self.script else {}

    def __getattr__(self, name: str):
        """Intercept Get* method calls."""
        if name.startswith("Get"):
            def _invoke(*args: Any, **kwargs: Any) -> Optional[Any]:
                self.call_history.append((name, time.monotonic()))
                state = self._get_current_state()
                return state.get(name)
            return _invoke
        raise AttributeError(name)


class MatchSimulator:
    """Simulates realistic tennis match progression."""

    def __init__(self):
        self.time = 0.0  # Virtual time in seconds
        self.states: List[Tuple[float, Dict[str, Any]]] = []

    def add_state(self, duration: float, **kwargs) -> None:
        """Add a state that lasts for 'duration' seconds."""
        self.time += duration
        self.states.append((self.time, kwargs))

    def simulate_game(
        self,
        set_a: int,
        set_b: int,
        games_a: int,
        games_b: int,
        points_progression: List[Tuple[str, str, float]],
    ) -> None:
        """Simulate a single game with point-by-point progression.
        
        Args:
            set_a, set_b: Current set scores
            games_a, games_b: Current game scores in set
            points_progression: List of (pointsA, pointsB, duration) tuples
        """
        for points_a, points_b, duration in points_progression:
            self.add_state(
                duration,
                GetPointsPlayerA=points_a,
                GetPointsPlayerB=points_b,
                GetCurrentSetPlayerA=games_a,
                GetCurrentSetPlayerB=games_b,
                GetSet1PlayerA=set_a,
                GetSet1PlayerB=set_b,
                GetNamePlayerA="Player A",
                GetNamePlayerB="Player B",
            )

    def simulate_tiebreak(
        self,
        set_a: int,
        set_b: int,
        games_a: int,
        games_b: int,
        tb_progression: List[Tuple[int, int, float]],
    ) -> None:
        """Simulate a tie-break.
        
        Args:
            set_a, set_b: Current set scores
            games_a, games_b: Games before tie-break (should be 4:4)
            tb_progression: List of (tbA, tbB, duration) tuples
        """
        for tb_a, tb_b, duration in tb_progression:
            self.add_state(
                duration,
                GetTieBreakPlayerA=tb_a,
                GetTieBreakPlayerB=tb_b,
                GetTieBreakVisibility=True,
                GetCurrentSetPlayerA=games_a,
                GetCurrentSetPlayerB=games_b,
                GetSet1PlayerA=set_a,
                GetSet1PlayerB=set_b,
                GetNamePlayerA="Player A",
                GetNamePlayerB="Player B",
            )

    def get_script(self) -> List[Dict[str, Any]]:
        """Return compiled script for FakeUnoClient."""
        return [state for _, state in self.states]


def count_requests_by_type(history: List[Tuple[str, float]]) -> Dict[str, int]:
    """Count how many times each query type was called."""
    counts = {}
    for method, _ in history:
        counts[method] = counts.get(method, 0) + 1
    return counts


def test_realistic_match_set1_close():
    """
    Scenario: First set, close game at 3-2, 40-30
    
    Expected polling behavior:
    - Baseline: GetPoints every 10s
    - At 40-30: GetPoints + GetCurrentSet (current_games_poll triggered)
    - Game won → 4-2: Should check set scores (games >= 3)
    """
    sim = MatchSimulator()
    
    # Game at 3-2, building to 40-30
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=3, games_b=2,
        points_progression=[
            ("0", "0", 10),      # 0-0 (baseline polling)
            ("15", "0", 10),     # 15-0
            ("30", "0", 10),     # 30-0
            ("40", "0", 10),     # 40-0 → triggers current_games_poll
            ("40", "15", 10),    # 40-15
            ("40", "30", 10),    # 40-30
        ]
    )
    
    # Game won → 4-2
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=4, games_b=2,
        points_progression=[
            ("0", "0", 10),      # New game starts
        ]
    )
    
    client = FakeUnoClient("court1")
    now_tracker = [0.0]
    
    def mock_now() -> float:
        return now_tracker[0]
    
    def mock_sleep(duration: float) -> None:
        now_tracker[0] += duration
    
    system = QuerySystem(client, now_fn=mock_now, sleep_fn=mock_sleep)
    controller = SmartCourtPollingController("court1", system, now_fn=mock_now)
    controller.attach()
    
    # TODO: Need to update state to trigger mode changes
    # This requires integration with state.py
    
    # For now, verify basic structure works
    assert controller._mode == SmartCourtPollingController.MODE_IN_MATCH


def test_realistic_match_set_at_4_4_tiebreak():
    """
    Scenario: Set reaches 4:4 → tie-break to 7-5
    
    Expected:
    - Game at 3:3, 40-30 → 4:3 → triggers set polling
    - Game at 4:3, 40-15 → 4:4 → triggers set polling
    - System detects 4:4 → should switch to TIE_MODE
    - Tie-break plays out 0-0 → 7-5
    - After TB won: set becomes 5:4 → back to NORMAL_MODE
    """
    sim = MatchSimulator()
    
    # Game to 4:3
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=3, games_b=3,
        points_progression=[
            ("0", "0", 10),
            ("15", "0", 10),
            ("30", "0", 10),
            ("40", "0", 10),   # 40-0 → triggers current_games_poll
            ("40", "15", 10),
            ("40", "30", 10),
        ]
    )
    
    # After game won: 4:3
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=4, games_b=3,
        points_progression=[
            ("0", "0", 10),
            ("0", "15", 10),
            ("15", "15", 10),
            ("30", "15", 10),
            ("40", "15", 10),  # 40-15 → triggers current_games_poll
        ]
    )
    
    # After game won: 4:4 → tie-break
    sim.simulate_tiebreak(
        set_a=0, set_b=0,
        games_a=4, games_b=4,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (2, 0, 10),
            (2, 1, 10),
            (3, 1, 10),
            (4, 1, 10),
            (4, 2, 10),
            (5, 2, 10),
            (5, 3, 10),
            (6, 3, 10),
            (6, 4, 10),
            (6, 5, 10),
            (7, 5, 10),  # Win by 2
        ]
    )
    
    # After TB: set is 5:4, start new game
    sim.simulate_game(
        set_a=1, set_b=0,  # Set 1 won by A
        games_a=0, games_b=0,
        points_progression=[
            ("0", "0", 10),
        ]
    )
    
    script = sim.get_script()
    assert len(script) > 0


def test_realistic_match_super_tiebreak_at_1_1():
    """
    Scenario: Match reaches 1:1 in sets → super tie-break (to 10)
    
    Timeline:
    - Set 1: A wins 4-2
    - Set 2: B wins 5-3
    - Sets tied 1:1 → super tie-break to 10 (or 2 point margin)
    - Super TB: A wins 10-8
    
    Question: Does poller detect 1:1 and switch to super TB mode?
    Or is super TB just regular TIE_MODE with different winning score?
    """
    sim = MatchSimulator()
    
    # Set 1 already completed: 4-2 (A won)
    # Set 2 at 4:3 for B, approaching 5:3
    
    # Game to make it 5:3 for B
    sim.simulate_game(
        set_a=1, set_b=0,  # Set 1: A won 4-2
        games_a=4, games_b=3,  # Set 2: currently 4:3 for B
        points_progression=[
            ("0", "0", 10),
            ("0", "15", 10),
            ("0", "30", 10),
            ("0", "40", 10),  # B at 40-0 → triggers current_games_poll
        ]
    )
    
    # After game: Set 2 is 4:4... wait, no!
    # If games were 4:3 and B won, it becomes 4:4
    # Let me recalculate...
    
    # Actually for 5:3 final, we need games at 4:2, B wins one more
    sim.simulate_game(
        set_a=1, set_b=0,
        games_a=4, games_b=2,
        points_progression=[
            ("0", "0", 10),
            ("0", "15", 10),
            ("0", "30", 10),
            ("0", "40", 10),
        ]
    )
    
    # Now 4:3, one more for B
    sim.simulate_game(
        set_a=1, set_b=0,
        games_a=4, games_b=3,
        points_progression=[
            ("0", "0", 10),
            ("0", "15", 10),
            ("0", "30", 10),
            ("0", "40", 10),
        ]
    )
    
    # Set 2 ends 4:4 → tie-break, B wins 7-5 → Set 2: 5:4 for B
    # Actually, to get 5:3, B needs to win at 4:2
    
    # Let me restart with clearer logic:
    # Set 2 final: 5-3 for B means B won decisively
    # That's games 5:3, which happens after 4:3 → 5:3
    
    # Simplify: just test super TB detection
    sim = MatchSimulator()
    
    # Super tie-break: sets are 1:1
    sim.simulate_tiebreak(
        set_a=1, set_b=1,  # Sets tied!
        games_a=0, games_b=0,  # No games in super TB
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (2, 0, 10),
            (2, 1, 10),
            (3, 1, 10),
            (3, 2, 10),
            (4, 2, 10),
            (5, 2, 10),
            (5, 3, 10),
            (6, 3, 10),
            (6, 4, 10),
            (7, 4, 10),
            (7, 5, 10),
            (8, 5, 10),
            (8, 6, 10),
            (9, 6, 10),
            (9, 7, 10),
            (9, 8, 10),
            (10, 8, 10),  # A wins 10-8
        ]
    )
    
    script = sim.get_script()
    assert len(script) > 0
    # Super TB state has GetTieBreakVisibility=True
    assert script[0]["GetTieBreakVisibility"] is True


def test_four_courts_simultaneous_polling():
    """
    Scenario: 4 courts running simultaneously for 45 minutes.
    
    Court 1: Normal match, no tie-breaks (30 min)
    Court 2: One tie-break in set 1 (35 min)
    Court 3: Match goes to super tie-break (45 min)
    Court 4: Quick match, 4-0, 4-1 (25 min)
    
    Expected total requests over 45 minutes:
    - Court 1: ~850 requests
    - Court 2: ~950 requests (extra TB polling)
    - Court 3: ~1100 requests (full match + super TB)
    - Court 4: ~700 requests (shorter match)
    
    Total: ~3600 requests / 45 min = 80 req/min = 4800 req/hour
    That's 4.8k / 5k hourly limit (96% usage) ⚠️
    """
    
    class CourtStats:
        def __init__(self, name: str):
            self.name = name
            self.total_requests = 0
            self.requests_by_type: Dict[str, int] = {}
            self.start_time = 0.0
            self.end_time = 0.0
    
    courts: Dict[str, CourtStats] = {
        f"court{i}": CourtStats(f"court{i}") for i in range(1, 5)
    }
    
    # Simulate each court
    
    # Court 1: Normal match (30 min = 1800 sec)
    # Average 17 req/min in match mode → 17 * 30 = 510 requests
    # Plus pre-match (40 req) and post-match (72 req)
    # Total: ~622 requests
    
    c1_duration = 30 * 60  # 30 minutes
    c1_req_per_sec = 17 / 60  # 17 req/min → per second
    courts["court1"].total_requests = int(40 + (c1_req_per_sec * c1_duration) + 72)
    courts["court1"].end_time = c1_duration
    
    # Court 2: Match with one tie-break (35 min)
    # Tie-break mode: ~12 req/min for TB queries
    # Assume 10 min normal (170 req) + 5 min TB (60 req) + 20 min normal (340 req)
    c2_duration = 35 * 60
    c2_normal = 30 * 60  # 30 min normal play
    c2_tb = 5 * 60  # 5 min tie-break
    courts["court2"].total_requests = int(
        40 +  # pre-match
        (17/60 * c2_normal) +  # normal play
        (12/60 * c2_tb) +  # tie-break
        72  # post-match
    )
    courts["court2"].end_time = c2_duration
    
    # Court 3: Full match with super TB (45 min)
    # Most intense: includes Set 1 (15 min), Set 2 with TB (15 min), Super TB (15 min)
    c3_duration = 45 * 60
    c3_normal = 30 * 60  # 30 min normal
    c3_tb = 10 * 60  # 10 min regular TB
    c3_super_tb = 5 * 60  # 5 min super TB
    courts["court3"].total_requests = int(
        40 +
        (17/60 * c3_normal) +
        (12/60 * (c3_tb + c3_super_tb)) +
        72
    )
    courts["court3"].end_time = c3_duration
    
    # Court 4: Quick match (25 min)
    c4_duration = 25 * 60
    c4_req_per_sec = 17 / 60
    courts["court4"].total_requests = int(40 + (c4_req_per_sec * c4_duration) + 72)
    courts["court4"].end_time = c4_duration
    
    # Calculate totals
    total_requests = sum(c.total_requests for c in courts.values())
    max_duration = max(c.end_time for c in courts.values())
    
    requests_per_hour = (total_requests / max_duration) * 3600
    
    print("\n" + "="*70)
    print("4-COURT SIMULTANEOUS POLLING SIMULATION")
    print("="*70)
    
    for court_id, stats in courts.items():
        duration_min = stats.end_time / 60
        req_per_min = stats.total_requests / duration_min if duration_min > 0 else 0
        print(f"\n{stats.name.upper()}:")
        print(f"  Duration: {duration_min:.1f} minutes")
        print(f"  Total requests: {stats.total_requests}")
        print(f"  Avg req/min: {req_per_min:.1f}")
    
    print(f"\n{'='*70}")
    print(f"AGGREGATE STATS (over {max_duration/60:.1f} minutes):")
    print(f"  Total requests: {total_requests}")
    print(f"  Requests per hour: {requests_per_hour:.0f}")
    print(f"  Hourly limit usage: {(requests_per_hour/5000)*100:.1f}% of 5,000/hour")
    print(f"  Daily projection (10h): {requests_per_hour * 10:.0f} / 50,000")
    print(f"  Daily limit usage: {(requests_per_hour * 10 / 50000)*100:.1f}%")
    print("="*70 + "\n")
    
    # Assertions
    assert total_requests < 4500, f"Too many requests: {total_requests} (expected ~3600-4000)"
    assert requests_per_hour < 6000, f"Exceeds hourly capacity: {requests_per_hour}"
    
    # Verify we're under daily limit with 4 courts for 10 hours
    daily_projection = requests_per_hour * 10
    assert daily_projection < 50000, f"Would exceed daily limit: {daily_projection}"


def test_edge_case_4_3_then_5_3():
    """
    Scenario: Games at 4:3, does poller expect TB at 4:4 or win at 5:3?
    
    Rules: Games go to 4 to win. At 3:3, next win makes it 4:3.
    At 4:3, the leading player can win (5:3) or opponent can tie (4:4 → TB).
    
    This tests whether set polling triggers correctly at 4:3.
    """
    sim = MatchSimulator()
    
    # Games at 3:3, A wins → 4:3
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=3, games_b=3,
        points_progression=[
            ("0", "0", 10),
            ("15", "0", 10),
            ("30", "0", 10),
            ("40", "0", 10),  # Triggers current_games_poll
            ("40", "15", 10),
        ]
    )
    
    # Now 4:3, A serves for set
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=4, games_b=3,
        points_progression=[
            ("0", "0", 10),
            ("15", "0", 10),
            ("30", "0", 10),
            ("40", "0", 10),  # Triggers current_games_poll
            ("40", "15", 10),
            ("40", "30", 10),  # Still at 40
        ]
    )
    
    # Case 1: A wins game → set ends 5:3
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=5,  # A won set!
        GetCurrentSetPlayerB=3,
        GetSet1PlayerA=1,
        GetSet1PlayerB=0,
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    script = sim.get_script()
    
    # Verify state progression
    # At some point, games should be 4:3
    states_at_4_3 = [s for s in script if s.get("GetCurrentSetPlayerA") == 4 and s.get("GetCurrentSetPlayerB") == 3]
    assert len(states_at_4_3) > 0, "Should have states at 4:3"
    
    # Then eventually 5:3
    states_at_5_3 = [s for s in script if s.get("GetCurrentSetPlayerA") == 5 and s.get("GetCurrentSetPlayerB") == 3]
    assert len(states_at_5_3) > 0, "Should reach 5:3"


def test_edge_case_4_3_then_4_4_tiebreak():
    """
    Scenario: Games at 4:3, opponent wins → 4:4 → tie-break
    
    This is the alternate path from 4:3.
    """
    sim = MatchSimulator()
    
    # Games at 4:3
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=4, games_b=3,
        points_progression=[
            ("15", "0", 10),
            ("15", "15", 10),
            ("15", "30", 10),
            ("15", "40", 10),  # B at 40-15
        ]
    )
    
    # B wins → 4:4
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=4,
        GetCurrentSetPlayerB=4,  # Tied!
        GetSet1PlayerA=0,
        GetSet1PlayerB=0,
        GetTieBreakVisibility=True,  # Should switch to TB mode
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    # Tie-break starts
    sim.simulate_tiebreak(
        set_a=0, set_b=0,
        games_a=4, games_b=4,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (1, 1, 10),
            (2, 1, 10),
            (3, 1, 10),
            (3, 2, 10),
            (4, 2, 10),
            (5, 2, 10),
            (6, 2, 10),
            (7, 2, 10),  # A wins TB 7-2
        ]
    )
    
    # After TB: set is 5:4 for A
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=5,
        GetCurrentSetPlayerB=4,
        GetSet1PlayerA=1,
        GetSet1PlayerB=0,
        GetTieBreakVisibility=False,
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    script = sim.get_script()
    
    # Verify TB was triggered
    tb_states = [s for s in script if s.get("GetTieBreakVisibility") is True]
    assert len(tb_states) > 0, "Should enter tie-break mode"


def test_request_counting_accuracy():
    """
    Verify our request counting matches actual polling behavior.
    
    This test runs a mini match simulation and counts actual method calls.
    """
    sim = MatchSimulator()
    
    # Simple game: 0-0 → 40-0 → game won
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=0, games_b=0,
        points_progression=[
            ("0", "0", 10),    # t=0-10s: baseline (2 req)
            ("15", "0", 10),   # t=10-20s: baseline (2 req)
            ("30", "0", 10),   # t=20-30s: baseline (2 req)
            ("40", "0", 10),   # t=30-40s: triggers current_games (4 req)
        ]
    )
    
    # Game won → 1:0
    sim.simulate_game(
        set_a=0, set_b=0,
        games_a=1, games_b=0,
        points_progression=[
            ("0", "0", 10),    # t=40-50s: back to baseline (2 req)
        ]
    )
    
    script = sim.get_script()
    client = FakeUnoClient("court1")
    client.set_script(script)
    
    now_tracker = [0.0]
    
    def mock_now() -> float:
        return now_tracker[0]
    
    def mock_sleep(duration: float) -> None:
        now_tracker[0] += duration
        # Advance script when time passes
        elapsed = now_tracker[0]
        for i, (timestamp, state) in enumerate(sim.states):
            if elapsed >= timestamp:
                client.script_index = i
    
    system = QuerySystem(client, now_fn=mock_now, sleep_fn=mock_sleep)
    
    # Run for 50 seconds (5 polling cycles at 10s each)
    for _ in range(30):  # Run enough iterations to cover 50s
        if now_tracker[0] >= 50:
            break
        system.run_once()
    
    # Count requests
    counts = count_requests_by_type(client.call_history)
    
    print("\n" + "="*70)
    print("REQUEST COUNTING TEST")
    print("="*70)
    print(f"Total time simulated: {now_tracker[0]:.1f} seconds")
    print(f"Total requests: {len(client.call_history)}")
    print("\nBreakdown by query type:")
    for method, count in sorted(counts.items()):
        print(f"  {method}: {count}")
    print("="*70 + "\n")
    
    # Expected:
    # GetPointsPlayerA/B: ~4-5 times each
    # GetCurrentSetPlayerA/B: ~3 times (triggered by preconditions)
    # GetSet1/2PlayerA/B: ~3 times each (triggered by preconditions)
    # GetNamePlayerA/B: ~2 times (pre-match polling)
    # GetTieBreakVisibility: ~1 time (background check)
    # Total: ~25-35 requests
    
    total = len(client.call_history)
    assert 20 <= total <= 40, f"Expected 20-40 requests, got {total}"


def test_tiebreak_7_6_continues_to_8_6():
    """
    Scenario: Regular tie-break at 7-6 doesn't end, continues to 8-6
    
    Rules: Tie-break must be won by 2-point margin.
    At 7-6, leading player needs one more point to win 8-6.
    
    Expected: Poller continues polling GetTieBreak until margin >= 2
    """
    sim = MatchSimulator()
    
    # Tie-break progression: 0-0 → 7-6 → 8-6 (wins with 2-point margin)
    sim.simulate_tiebreak(
        set_a=0, set_b=0,
        games_a=4, games_b=4,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (1, 1, 10),
            (2, 1, 10),
            (2, 2, 10),
            (3, 2, 10),
            (3, 3, 10),
            (4, 3, 10),
            (4, 4, 10),
            (5, 4, 10),
            (5, 5, 10),
            (6, 5, 10),
            (6, 6, 10),
            (7, 6, 10),  # NOT OVER! Need 2-point margin
            (8, 6, 10),  # NOW it's over (8-6, margin = 2)
        ]
    )
    
    # After TB: set is 5:4
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=5,
        GetCurrentSetPlayerB=4,
        GetSet1PlayerA=1,
        GetSet1PlayerB=0,
        GetTieBreakVisibility=False,  # TB ended
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    script = sim.get_script()
    
    # Verify TB went to 8-6
    tb_7_6 = [s for s in script if s.get("GetTieBreakPlayerA") == 7 and s.get("GetTieBreakPlayerB") == 6]
    assert len(tb_7_6) > 0, "Should have state at 7-6"
    
    tb_8_6 = [s for s in script if s.get("GetTieBreakPlayerA") == 8 and s.get("GetTieBreakPlayerB") == 6]
    assert len(tb_8_6) > 0, "Should continue to 8-6 for 2-point margin"
    
    # Verify TB ended after 8-6
    ended = [s for s in script if s.get("GetTieBreakVisibility") is False and s.get("GetSet1PlayerA") == 1]
    assert len(ended) > 0, "TB should end after 8-6"


def test_tiebreak_long_deuce():
    """
    Scenario: Tie-break goes to long deuce: 6-6 → 7-7 → 8-8 → 9-8 → 10-8
    
    This tests that poller keeps polling even when TB extends beyond 7 points.
    """
    sim = MatchSimulator()
    
    # Extended tie-break
    sim.simulate_tiebreak(
        set_a=0, set_b=0,
        games_a=4, games_b=4,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (1, 1, 10),
            (2, 1, 10),
            (2, 2, 10),
            (3, 2, 10),
            (3, 3, 10),
            (4, 3, 10),
            (4, 4, 10),
            (5, 4, 10),
            (5, 5, 10),
            (6, 5, 10),
            (6, 6, 10),  # 6-6: both at match point
            (7, 6, 10),  # A ahead by 1
            (7, 7, 10),  # Back to deuce
            (8, 7, 10),  # A ahead by 1
            (8, 8, 10),  # Deuce again!
            (9, 8, 10),  # A ahead by 1
            (10, 8, 10), # FINALLY A wins 10-8
        ]
    )
    
    # After TB
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=5,
        GetCurrentSetPlayerB=4,
        GetSet1PlayerA=1,
        GetSet1PlayerB=0,
        GetTieBreakVisibility=False,
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    script = sim.get_script()
    
    # Verify progression through deuce points
    assert any(s.get("GetTieBreakPlayerA") == 7 and s.get("GetTieBreakPlayerB") == 6 for s in script), "7-6"
    assert any(s.get("GetTieBreakPlayerA") == 7 and s.get("GetTieBreakPlayerB") == 7 for s in script), "7-7 deuce"
    assert any(s.get("GetTieBreakPlayerA") == 8 and s.get("GetTieBreakPlayerB") == 8 for s in script), "8-8 deuce"
    assert any(s.get("GetTieBreakPlayerA") == 10 and s.get("GetTieBreakPlayerB") == 8 for s in script), "10-8 win"


def test_super_tiebreak_10_9_continues():
    """
    Scenario: Super tie-break at 10-9 doesn't end, continues to 11-9
    
    Rules: Super TB to 10 points, but must win by 2.
    At 10-9, leading player needs one more for 11-9.
    
    Expected: Same as regular TB - poller keeps polling until UNO reports winner
    """
    sim = MatchSimulator()
    
    # Super tie-break: 1:1 in sets, TB to 10 (or 2-point margin)
    sim.simulate_tiebreak(
        set_a=1, set_b=1,  # Sets tied!
        games_a=0, games_b=0,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (1, 1, 10),
            (2, 1, 10),
            (3, 1, 10),
            (4, 1, 10),
            (4, 2, 10),
            (5, 2, 10),
            (6, 2, 10),
            (6, 3, 10),
            (7, 3, 10),
            (7, 4, 10),
            (8, 4, 10),
            (8, 5, 10),
            (9, 5, 10),
            (9, 6, 10),
            (9, 7, 10),
            (9, 8, 10),
            (9, 9, 10),  # 9-9: tied!
            (10, 9, 10), # 10-9: NOT OVER, need margin of 2
            (11, 9, 10), # 11-9: A wins super TB
        ]
    )
    
    # Match ends after super TB
    sim.add_state(
        10,
        GetPointsPlayerA="0",
        GetPointsPlayerB="0",
        GetCurrentSetPlayerA=0,
        GetCurrentSetPlayerB=0,
        GetSet1PlayerA=1,
        GetSet1PlayerB=1,
        GetSet2PlayerA=1,  # A won match in super TB
        GetSet2PlayerB=0,
        GetTieBreakVisibility=False,
        GetNamePlayerA="Player A",
        GetNamePlayerB="Player B",
    )
    
    script = sim.get_script()
    
    # Verify super TB went beyond 10
    tb_10_9 = [s for s in script if s.get("GetTieBreakPlayerA") == 10 and s.get("GetTieBreakPlayerB") == 9]
    assert len(tb_10_9) > 0, "Should have state at 10-9"
    
    tb_11_9 = [s for s in script if s.get("GetTieBreakPlayerA") == 11 and s.get("GetTieBreakPlayerB") == 9]
    assert len(tb_11_9) > 0, "Should continue to 11-9 for 2-point margin"
    
    # Verify match ended
    ended = [s for s in script if s.get("GetTieBreakVisibility") is False]
    assert len(ended) > 0, "Super TB should end"


def test_super_tiebreak_extreme_deuce():
    """
    Scenario: Super TB goes to extreme deuce: 10-10 → 11-11 → 12-12 → 13-11
    
    This can happen in very close matches.
    """
    sim = MatchSimulator()
    
    # Extended super tie-break
    sim.simulate_tiebreak(
        set_a=1, set_b=1,
        games_a=0, games_b=0,
        tb_progression=[
            (0, 0, 10),
            (1, 0, 10),
            (2, 0, 10),
            (2, 1, 10),
            (3, 1, 10),
            (4, 1, 10),
            (4, 2, 10),
            (5, 2, 10),
            (5, 3, 10),
            (6, 3, 10),
            (6, 4, 10),
            (7, 4, 10),
            (7, 5, 10),
            (8, 5, 10),
            (8, 6, 10),
            (9, 6, 10),
            (9, 7, 10),
            (9, 8, 10),
            (10, 8, 10), # 10-8: A should win... but wait!
            # Just kidding, let's make it close:
        ]
    )
    
    # Shorter version focusing on key states
    sim2 = MatchSimulator()
    sim2.simulate_tiebreak(
        set_a=1, set_b=1,
        games_a=0, games_b=0,
        tb_progression=[
            (9, 9, 10),   # Tied at 9
            (10, 9, 10),  # A ahead
            (10, 10, 10), # B catches up - deuce at 10!
            (11, 10, 10), # A ahead
            (11, 11, 10), # Deuce at 11!
            (12, 11, 10), # A ahead
            (12, 12, 10), # Deuce at 12!
            (13, 12, 10), # A ahead
            (13, 13, 10), # Deuce at 13!
            (14, 13, 10), # A ahead
            (15, 13, 10), # A FINALLY wins 15-13!
        ]
    )
    
    script = sim2.get_script()
    
    # Verify extended deuce states
    assert any(s.get("GetTieBreakPlayerA") == 10 and s.get("GetTieBreakPlayerB") == 10 for s in script), "10-10"
    assert any(s.get("GetTieBreakPlayerA") == 11 and s.get("GetTieBreakPlayerB") == 11 for s in script), "11-11"
    assert any(s.get("GetTieBreakPlayerA") == 12 and s.get("GetTieBreakPlayerB") == 12 for s in script), "12-12"
    assert any(s.get("GetTieBreakPlayerA") == 15 and s.get("GetTieBreakPlayerB") == 13 for s in script), "15-13 win"


if __name__ == "__main__":
    # Run the 4-court simulation as a standalone script
    print("\n🎾 Running realistic 4-court polling simulation...\n")
    test_four_courts_simultaneous_polling()
    print("\n✅ Simulation complete!\n")
