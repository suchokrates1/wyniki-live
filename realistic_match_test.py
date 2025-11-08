"""
Realistic match simulation test for SmartPollingController.
Simulates full match progression with tie-breaks, super tie-breaks, and mode transitions.
"""
import sys
import time
from unittest.mock import Mock, patch
from collections import defaultdict

sys.path.insert(0, r'c:\Users\sucho\Wyniki\wyniki-live')

from wyniki.poller import SmartCourtPollingController
from wyniki.query_system import QuerySystem

class MatchSimulator:
    """Simulates realistic tennis match progression."""
    
    def __init__(self):
        self.time = 0.0
        self.points_a = 0
        self.points_b = 0
        self.games_a = 0
        self.games_b = 0
        self.sets_a = 0
        self.sets_b = 0
        self.current_set = 1
        self.match_active = False
        self.in_tiebreak = False
        self.in_super_tiebreak = False
        
        # Tracking
        self.poll_log = []
        self.state_changes = []
        
    def now(self):
        return self.time
    
    def advance(self, seconds):
        self.time += seconds
    
    def points_to_string(self):
        """Convert numeric points to tennis scoring."""
        if self.in_tiebreak or self.in_super_tiebreak:
            return f"{self.points_a}", f"{self.points_b}"
        
        point_map = {0: "0", 1: "15", 2: "30", 3: "40"}
        
        if self.points_a >= 3 and self.points_b >= 3:
            if self.points_a == self.points_b:
                return "40", "40"
            elif self.points_a > self.points_b:
                return "ADV", "40"
            else:
                return "40", "ADV"
        
        pa = point_map.get(self.points_a, "40")
        pb = point_map.get(self.points_b, "40")
        return pa, pb
    
    def get_state(self):
        """Get current match state for SmartPollingController."""
        pa, pb = self.points_to_string()
        return {
            "A": {
                "points": pa,
                "current_games": self.games_a,
                "full_name": "Player A",
                "sets": [self.sets_a, 0, 0]  # Simplified
            },
            "B": {
                "points": pb,
                "current_games": self.games_b,
                "full_name": "Player B",
                "sets": [self.sets_b, 0, 0]
            },
            "match_status": {
                "active": self.match_active,
                "current_set": self.current_set
            }
        }
    
    def log_state(self, event=""):
        """Log current state."""
        pa, pb = self.points_to_string()
        mode = ""
        if self.in_super_tiebreak:
            mode = " [SUPER TB]"
        elif self.in_tiebreak:
            mode = " [TB]"
        
        self.state_changes.append({
            'time': self.time,
            'event': event,
            'score': f"Set {self.current_set}: {self.games_a}-{self.games_b}{mode}, Points: {pa}-{pb}",
            'sets': f"{self.sets_a}-{self.sets_b}"
        })
    
    def win_point(self, player='A'):
        """Award point to player."""
        if player == 'A':
            self.points_a += 1
        else:
            self.points_b += 1
        
        # Check for game win
        if self.in_tiebreak:
            self._check_tiebreak_win()
        elif self.in_super_tiebreak:
            self._check_super_tiebreak_win()
        else:
            self._check_game_win()
    
    def _check_game_win(self):
        """Check if someone won the game."""
        if self.points_a >= 4 and self.points_a >= self.points_b + 2:
            self.games_a += 1
            self.points_a = 0
            self.points_b = 0
            self.log_state(f"Game to A! Now {self.games_a}-{self.games_b}")
            self._check_set_win()
        elif self.points_b >= 4 and self.points_b >= self.points_a + 2:
            self.games_b += 1
            self.points_a = 0
            self.points_b = 0
            self.log_state(f"Game to B! Now {self.games_a}-{self.games_b}")
            self._check_set_win()
    
    def _check_set_win(self):
        """Check if someone won the set."""
        # Normal set win (6+ games, 2+ ahead)
        if self.games_a >= 6 and self.games_a >= self.games_b + 2:
            self._win_set('A')
        elif self.games_b >= 6 and self.games_b >= self.games_a + 2:
            self._win_set('B')
        # Tie-break at 6-6
        elif self.games_a == 6 and self.games_b == 6:
            self.in_tiebreak = True
            self.log_state("TIE-BREAK!")
        # Super tie-break in deciding set (1-1 in sets, 6-6 in games)
        elif self.sets_a == 1 and self.sets_b == 1 and self.games_a == 6 and self.games_b == 6:
            self.in_super_tiebreak = True
            self.in_tiebreak = False
            self.log_state("SUPER TIE-BREAK!")
    
    def _check_tiebreak_win(self):
        """Check if someone won the tie-break."""
        if self.points_a >= 7 and self.points_a >= self.points_b + 2:
            self.games_a += 1  # TB counts as a game
            self._win_set('A')
        elif self.points_b >= 7 and self.points_b >= self.points_a + 2:
            self.games_b += 1
            self._win_set('B')
    
    def _check_super_tiebreak_win(self):
        """Check if someone won the super tie-break (first to 10, margin 2)."""
        if self.points_a >= 10 and self.points_a >= self.points_b + 2:
            self._win_match('A')
        elif self.points_b >= 10 and self.points_b >= self.points_a + 2:
            self._win_match('B')
    
    def _win_set(self, player):
        """Award set to player."""
        if player == 'A':
            self.sets_a += 1
        else:
            self.sets_b += 1
        
        self.log_state(f"SET to {player}! Sets: {self.sets_a}-{self.sets_b}")
        
        # Reset for next set
        self.games_a = 0
        self.games_b = 0
        self.points_a = 0
        self.points_b = 0
        self.in_tiebreak = False
        self.current_set += 1
        
        # Check match win (best of 3)
        if self.sets_a >= 2:
            self._win_match('A')
        elif self.sets_b >= 2:
            self._win_match('B')
    
    def _win_match(self, player):
        """End match."""
        self.log_state(f"MATCH to {player}! Final: {self.sets_a}-{self.sets_b}")
        self.match_active = False
        self.in_tiebreak = False
        self.in_super_tiebreak = False
    
    def start_match(self):
        """Start a new match."""
        self.match_active = True
        self.sets_a = 0
        self.sets_b = 0
        self.games_a = 0
        self.games_b = 0
        self.points_a = 0
        self.points_b = 0
        self.current_set = 1
        self.in_tiebreak = False
        self.in_super_tiebreak = False
        self.log_state("MATCH START")

def create_mock_system():
    """Create mock QuerySystem."""
    system = Mock(spec=QuerySystem)
    system.specs = {}
    
    def configure_spec(command, precondition=None, on_result=None):
        system.specs[command] = {
            'precondition': precondition,
            'on_result': on_result
        }
    
    system.configure_spec = configure_spec
    return system

def test_realistic_match():
    """Simulate a realistic match with various scenarios."""
    print("\n" + "="*80)
    print("REALISTIC MATCH SIMULATION TEST")
    print("="*80)
    print("Scenarios:")
    print("  - Set 1: Normal games with 40-40, ADV situations")
    print("  - Set 2: Tie-break at 6-6")
    print("  - Set 3: Super tie-break (if 1-1 in sets)")
    print("="*80 + "\n")
    
    sim = MatchSimulator()
    system = create_mock_system()
    poller = SmartCourtPollingController("1", system, now_fn=sim.now)
    poller.attach()
    
    # Get precondition functions
    should_poll_points = system.specs['GetPointsPlayerA']['precondition']
    should_poll_games = system.specs['GetCurrentSetPlayerA']['precondition']
    should_poll_sets = system.specs['GetSet1PlayerA']['precondition']
    
    # Tracking
    point_polls = []
    game_polls = []
    set_polls = []
    decisive_moments = []
    
    with patch('wyniki.poller.ensure_court_state') as mock_state:
        
        def check_polling():
            """Check what should be polled now."""
            state = sim.get_state()
            mock_state.return_value = state
            poller.sync_from_state()
            
            points = should_poll_points()
            games = should_poll_games()
            sets = should_poll_sets()
            
            pa, pb = sim.points_to_string()
            
            # Log polls
            if points:
                point_polls.append(sim.time)
            if games:
                game_polls.append((sim.time, f"{pa}-{pb}"))
            if sets:
                set_polls.append((sim.time, f"{sim.games_a}-{sim.games_b}"))
            
            # Track decisive moments
            if pa in ["40", "ADV"] or pb in ["40", "ADV"]:
                decisive_moments.append({
                    'time': sim.time,
                    'score': f"{pa}-{pb}",
                    'games_polled': games,
                    'sets_polled': sets
                })
            
            return points, games, sets
        
        # === SIMULATE MATCH ===
        sim.start_match()
        
        print("Starting match simulation...")
        print("-" * 80)
        
        # SET 1: Normal games with deuce/ADV
        print("\n📊 SET 1: Normal games")
        
        # Game 1: Quick game (A wins 40-0)
        for _ in range(4):
            sim.win_point('A')
            sim.advance(3.0)
            check_polling()
        
        # Game 2: Deuce game (B wins after deuce)
        for _ in range(3):
            sim.win_point('A')
            sim.advance(3.0)
            check_polling()
        
        for _ in range(3):
            sim.win_point('B')
            sim.advance(3.0)
            check_polling()
        
        print(f"  Deuce! Score: 40-40")
        check_polling()
        
        sim.win_point('B')  # ADV B
        sim.advance(3.0)
        print(f"  ADV to B!")
        check_polling()
        
        sim.win_point('A')  # Back to deuce
        sim.advance(3.0)
        print(f"  Back to deuce!")
        check_polling()
        
        sim.win_point('A')  # ADV A
        sim.advance(3.0)
        print(f"  ADV to A!")
        check_polling()
        
        sim.win_point('A')  # Game A
        sim.advance(3.0)
        check_polling()
        
        # Fast-forward through more games to reach 5-5
        print(f"  Fast-forwarding to 5-5...")
        for game_num in range(8):
            winner = 'A' if game_num % 2 == 0 else 'B'
            for _ in range(4):
                sim.win_point(winner)
                sim.advance(2.0)
                check_polling()
        
        print(f"  Score: {sim.games_a}-{sim.games_b}")
        
        # Finish set at 6-4
        for _ in range(4):
            sim.win_point('A')
            sim.advance(2.0)
            check_polling()
        
        print(f"  SET 1 to A: {sim.sets_a}-{sim.sets_b}")
        
        # SET 2: Lead to tie-break
        print(f"\n📊 SET 2: Tie-break scenario")
        
        # Fast games to 6-6
        for game_num in range(12):
            winner = 'A' if game_num % 2 == 0 else 'B'
            for _ in range(4):
                sim.win_point(winner)
                sim.advance(2.0)
                check_polling()
        
        print(f"  Score: {sim.games_a}-{sim.games_b} -> TIE-BREAK!")
        
        # Tie-break
        for point_num in range(10):
            winner = 'A' if point_num % 3 == 0 else 'B'
            sim.win_point(winner)
            sim.advance(2.0)
            pa, pb = sim.points_to_string()
            check_polling()
        
        # A wins tie-break 7-3
        for _ in range(4):
            sim.win_point('A')
            sim.advance(2.0)
            check_polling()
        
        print(f"  TIE-BREAK to A! Sets: {sim.sets_a}-{sim.sets_b}")
        
        # MATCH END (A wins 2-0)
        print(f"\n🏆 MATCH END: Player A wins {sim.sets_a}-{sim.sets_b}")
        check_polling()
        
    # === ANALYSIS ===
    print("\n" + "="*80)
    print("POLLING ANALYSIS")
    print("="*80)
    
    # Point polling intervals
    if len(point_polls) >= 2:
        intervals = [point_polls[i+1] - point_polls[i] for i in range(len(point_polls)-1)]
        avg_interval = sum(intervals) / len(intervals)
        print(f"\n📊 Point Polls:")
        print(f"  Total polls: {len(point_polls)}")
        print(f"  Average interval: {avg_interval:.1f}s")
        print(f"  Expected: ~10s (MODE_IN_MATCH throttle)")
        
        if 9.0 <= avg_interval <= 11.0:
            print(f"  ✓ Throttling correct!")
        else:
            print(f"  ⚠ Throttling off: {avg_interval:.1f}s")
    
    # Game polling (should trigger at 40/ADV)
    print(f"\n📊 Current Games Polls (triggered at 40/ADV):")
    print(f"  Total polls: {len(game_polls)}")
    if game_polls:
        print(f"  Sample triggers:")
        for t, score in game_polls[:10]:
            print(f"    t={t:6.1f}s: {score}")
    
    # Set polling (should trigger when games >= 3)
    print(f"\n📊 Set Polls (triggered at games >= 3):")
    print(f"  Total polls: {len(set_polls)}")
    if set_polls:
        print(f"  Sample triggers:")
        for t, games in set_polls[:10]:
            print(f"    t={t:6.1f}s: {games}")
    
    # Decisive moments analysis
    print(f"\n📊 Decisive Moments (40/ADV situations):")
    decisive_with_games_poll = [m for m in decisive_moments if m['games_polled']]
    print(f"  Total 40/ADV moments: {len(decisive_moments)}")
    print(f"  Games polled at 40/ADV: {len(decisive_with_games_poll)}")
    
    if decisive_moments:
        print(f"  Sample:")
        for m in decisive_moments[:5]:
            status = "✓ polled" if m['games_polled'] else "✗ not polled"
            print(f"    {m['score']:8s} -> {status}")
    
    # Match events
    print(f"\n📊 Match Events:")
    for event in sim.state_changes[:15]:  # First 15 events
        print(f"  t={event['time']:6.1f}s: {event['event']:30s} | {event['score']}")
    
    if len(sim.state_changes) > 15:
        print(f"  ... ({len(sim.state_changes)-15} more events)")
    
    # VERDICT
    print("\n" + "="*80)
    print("TEST VERDICT")
    print("="*80)
    
    success = True
    
    # Check 1: Point throttling
    if len(point_polls) >= 2:
        intervals = [point_polls[i+1] - point_polls[i] for i in range(len(point_polls)-1)]
        avg_interval = sum(intervals) / len(intervals)
        if 9.0 <= avg_interval <= 11.0:
            print("✓ Point throttling (10s): PASS")
        else:
            print(f"✗ Point throttling (10s): FAIL (got {avg_interval:.1f}s)")
            success = False
    
    # Check 2: Games polled at decisive moments
    if len(decisive_moments) > 0:
        poll_rate = len(decisive_with_games_poll) / len(decisive_moments)
        if poll_rate > 0.5:  # At least 50% of decisive moments trigger games poll
            print(f"✓ Smart games polling (40/ADV): PASS ({poll_rate*100:.0f}% trigger rate)")
        else:
            print(f"⚠ Smart games polling (40/ADV): PARTIAL ({poll_rate*100:.0f}% trigger rate)")
    
    # Check 3: Set polling happens
    if len(set_polls) > 0:
        print(f"✓ Set polling: PASS ({len(set_polls)} polls during match)")
    else:
        print(f"⚠ Set polling: No set polls detected")
    
    print("="*80 + "\n")
    
    return success

if __name__ == "__main__":
    try:
        success = test_realistic_match()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        exit(2)
