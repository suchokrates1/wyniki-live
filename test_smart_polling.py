"""
Test SmartPollingController logic with realistic match progression.
"""
import sys
import time
from unittest.mock import Mock, MagicMock, patch
from collections import defaultdict

# Add wyniki to path
sys.path.insert(0, r'c:\Users\sucho\Wyniki\wyniki-live')

from wyniki.poller import SmartCourtPollingController
from wyniki.query_system import QuerySystem

class TestScenario:
    def __init__(self):
        self.time = 0.0
        self.call_log = []
        
    def now(self):
        return self.time
    
    def advance(self, seconds):
        self.time += seconds
        
    def log_call(self, command, allowed):
        self.call_log.append({
            'time': self.time,
            'command': command,
            'allowed': allowed
        })

def create_mock_system():
    """Create a mock QuerySystem that tracks configuration."""
    system = Mock(spec=QuerySystem)
    system.specs = {}
    
    def configure_spec(command, precondition=None, on_result=None):
        system.specs[command] = {
            'precondition': precondition,
            'on_result': on_result
        }
    
    system.configure_spec = configure_spec
    return system

def test_point_throttling():
    """Test that points are throttled to 10s in MODE_IN_MATCH."""
    print("\n" + "="*70)
    print("TEST 1: Point Throttling (10s interval)")
    print("="*70)
    
    scenario = TestScenario()
    system = create_mock_system()
    poller = SmartCourtPollingController("1", system, now_fn=scenario.now)
    poller.attach()
    
    # Start in MODE_IN_MATCH
    poller._mode = poller.MODE_IN_MATCH
    
    # Get the precondition function for GetPointsPlayerA
    should_poll_a = system.specs['GetPointsPlayerA']['precondition']
    
    print(f"\nStarting in MODE_IN_MATCH")
    print(f"Expected: Allow first poll, then throttle for 10s\n")
    
    # Poll attempts
    results = []
    for i in range(15):
        allowed = should_poll_a()
        results.append((scenario.time, allowed))
        print(f"  t={scenario.time:5.1f}s: Poll attempt #{i+1:2d} -> {'✓ ALLOWED' if allowed else '✗ THROTTLED'}")
        scenario.advance(2.0)  # Poll every 2s
    
    # Analysis
    allowed_times = [t for t, allowed in results if allowed]
    print(f"\nAllowed polls at times: {allowed_times}")
    
    if len(allowed_times) >= 2:
        intervals = [allowed_times[i+1] - allowed_times[i] for i in range(len(allowed_times)-1)]
        print(f"Intervals between allowed polls: {intervals}")
        avg_interval = sum(intervals) / len(intervals)
        print(f"Average interval: {avg_interval:.1f}s")
        
        if 9.5 <= avg_interval <= 10.5:
            print(f"\n✓ PASS: Throttling works correctly (~10s interval)")
            return True
        else:
            print(f"\n✗ FAIL: Expected ~10s interval, got {avg_interval:.1f}s")
            return False
    else:
        print(f"\n✗ FAIL: Not enough allowed polls to test")
        return False

def test_current_games_smart_polling():
    """Test that current games are polled at 40/ADV."""
    print("\n" + "="*70)
    print("TEST 2: Smart Current Games Polling (40/ADV trigger)")
    print("="*70)
    
    scenario = TestScenario()
    system = create_mock_system()
    poller = SmartCourtPollingController("1", system, now_fn=scenario.now)
    poller.attach()
    
    # Start in MODE_IN_MATCH
    poller._mode = poller.MODE_IN_MATCH
    
    # Mock state
    with patch('wyniki.poller.ensure_court_state') as mock_state:
        should_poll_games_a = system.specs['GetCurrentSetPlayerA']['precondition']
        
        print(f"\nSimulating match progression:")
        
        test_cases = [
            ("0", False, "0-0: Should NOT poll"),
            ("15", False, "15-0: Should NOT poll"),
            ("30", False, "30-0: Should NOT poll"),
            ("40", True, "40-0: Should POLL (decisive!)"),
            ("40", False, "40-15: Already polled at 40"),
            ("ADV", True, "ADV-40: Should POLL (decisive!)"),
            ("40", True, "40-40: Should POLL (back to 40)"),
            ("0", False, "0-0: Game over, should NOT poll"),
        ]
        
        all_passed = True
        for points, expected, description in test_cases:
            # Mock state with current points
            mock_state.return_value = {
                "A": {"points": points, "current_games": 2},
                "B": {"points": "30", "current_games": 1},
                "match_status": {"active": True}
            }
            
            # Sync state to update triggers
            poller.sync_from_state()
            
            # Check if current games should be polled
            allowed = should_poll_games_a()
            
            status = "✓ PASS" if allowed == expected else "✗ FAIL"
            print(f"  {status}: {description} -> {allowed}")
            
            if allowed != expected:
                all_passed = False
            
            # Advance time
            scenario.advance(2.0)
        
        if all_passed:
            print(f"\n✓ PASS: Smart polling triggers correctly at 40/ADV")
            return True
        else:
            print(f"\n✗ FAIL: Some triggers didn't work correctly")
            return False

def test_mode_transitions():
    """Test mode transitions and throttle resets."""
    print("\n" + "="*70)
    print("TEST 3: Mode Transitions & Throttle Resets")
    print("="*70)
    
    scenario = TestScenario()
    system = create_mock_system()
    poller = SmartCourtPollingController("1", system, now_fn=scenario.now)
    poller.attach()
    
    with patch('wyniki.poller.ensure_court_state') as mock_state:
        should_poll_points_a = system.specs['GetPointsPlayerA']['precondition']
        
        print(f"\nScenario: Match end -> New names -> First point")
        
        # Step 1: MODE_IN_MATCH
        print(f"\n1. MODE_IN_MATCH:")
        poller._mode = poller.MODE_IN_MATCH
        mock_state.return_value = {
            "A": {"points": "40", "full_name": "Nadal"},
            "B": {"points": "30", "full_name": "Djokovic"},
            "match_status": {"active": True}
        }
        poller.sync_from_state()
        
        allowed = should_poll_points_a()
        print(f"   First poll: {allowed} (should be True)")
        scenario.advance(5.0)
        
        allowed = should_poll_points_a()
        print(f"   After 5s: {allowed} (should be False - throttled)")
        scenario.advance(6.0)  # Total 11s
        
        allowed = should_poll_points_a()
        print(f"   After 11s: {allowed} (should be True)")
        
        # Step 2: Match ends -> MODE_AWAIT_NAMES
        print(f"\n2. Match ends -> MODE_AWAIT_NAMES:")
        mock_state.return_value = {
            "A": {"points": "0", "full_name": "Nadal"},
            "B": {"points": "0", "full_name": "Djokovic"},
            "match_status": {"active": False}
        }
        poller.sync_from_state()
        
        print(f"   Mode: {poller._mode} (should be MODE_AWAIT_NAMES)")
        print(f"   _next_point_poll_allowed reset: {poller._next_point_poll_allowed}")
        
        # Step 3: New names appear -> MODE_AWAIT_FIRST_POINT
        print(f"\n3. New names -> MODE_AWAIT_FIRST_POINT:")
        mock_state.return_value = {
            "A": {"points": "0", "full_name": "Federer"},
            "B": {"points": "0", "full_name": "Murray"},
            "match_status": {"active": False}
        }
        poller.sync_from_state()
        
        print(f"   Mode: {poller._mode} (should be MODE_AWAIT_FIRST_POINT)")
        
        allowed = should_poll_points_a()
        print(f"   First poll: {allowed} (should be True)")
        scenario.advance(5.0)
        
        allowed = should_poll_points_a()
        print(f"   After 5s: {allowed} (should be False - 12s interval)")
        scenario.advance(8.0)  # Total 13s
        
        allowed = should_poll_points_a()
        print(f"   After 13s: {allowed} (should be True)")
        
        # Step 4: First point detected -> MODE_IN_MATCH
        print(f"\n4. First point -> MODE_IN_MATCH:")
        mock_state.return_value = {
            "A": {"points": "15", "full_name": "Federer"},
            "B": {"points": "0", "full_name": "Murray"},
            "match_status": {"active": False}  # Still false, but has point
        }
        poller.sync_from_state()
        
        print(f"   Mode: {poller._mode} (should be MODE_IN_MATCH)")
        print(f"   _next_point_poll_allowed reset: {poller._next_point_poll_allowed}")
        
        # Should allow immediate poll after transition
        allowed = should_poll_points_a()
        print(f"   Immediate poll after transition: {allowed} (should be True)")
        
        if (poller._mode == poller.MODE_IN_MATCH and 
            poller._next_point_poll_allowed == 0.0 and 
            allowed):
            print(f"\n✓ PASS: Mode transitions and throttle resets work correctly")
            return True
        else:
            print(f"\n✗ FAIL: Mode transitions or resets incorrect")
            return False

def main():
    print("\n" + "="*70)
    print("SMART POLLING CONTROLLER - COMPREHENSIVE TEST")
    print("="*70)
    print("Testing:")
    print("  1. Point throttling (10s in MODE_IN_MATCH)")
    print("  2. Smart current games polling (40/ADV triggers)")
    print("  3. Mode transitions and throttle resets")
    print("="*70)
    
    results = []
    
    try:
        results.append(("Point Throttling", test_point_throttling()))
    except Exception as e:
        print(f"\n✗ EXCEPTION in test_point_throttling: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Point Throttling", False))
    
    try:
        results.append(("Smart Games Polling", test_current_games_smart_polling()))
    except Exception as e:
        print(f"\n✗ EXCEPTION in test_current_games_smart_polling: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Smart Games Polling", False))
    
    try:
        results.append(("Mode Transitions", test_mode_transitions()))
    except Exception as e:
        print(f"\n✗ EXCEPTION in test_mode_transitions: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Mode Transitions", False))
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {name}")
    
    total = len(results)
    passed = sum(1 for _, p in results if p)
    print(f"\nTotal: {passed}/{total} tests passed")
    print("="*70 + "\n")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    exit(main())
