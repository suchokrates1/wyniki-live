"""
Simple throttle test - validates 10s point polling throttle.
Manually controls timing to verify throttling behavior.
"""
import requests
import time
from datetime import datetime

MOCK_UNO_URL = "http://localhost:5001"
COURT_1 = "test-overlay-001"
COURT_2 = "test-overlay-002"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def reset_stats():
    """Reset mock UNO statistics."""
    r = requests.get(f"{MOCK_UNO_URL}/reset")
    log(f"Stats reset: {r.status_code}")

def get_stats():
    """Get current statistics."""
    r = requests.get(f"{MOCK_UNO_URL}/stats")
    return r.json()

def poll_points(court_id):
    """Poll points for both players on a court."""
    url = f"{MOCK_UNO_URL}/apiv2/controlapps/{court_id}/api"
    
    # Player A points
    r = requests.put(url, json={"command": "GetPointsPlayerA"})
    log(f"  Court {court_id[-3:]}: GetPointsPlayerA -> {r.status_code}")
    
    # Player B points
    r = requests.put(url, json={"command": "GetPointsPlayerB"})
    log(f"  Court {court_id[-3:]}: GetPointsPlayerB -> {r.status_code}")

def print_stats(stats):
    """Print statistics summary."""
    print("\n" + "="*60)
    print(f"STATISTICS SUMMARY")
    print("="*60)
    print(f"Duration: {stats['duration_seconds']:.1f}s")
    print(f"Total requests: {stats['total_requests']}")
    print(f"RPS: {stats['requests_per_second']:.2f}")
    print()
    
    for court_id, counts in stats['by_court'].items():
        court_num = court_id[-3:]
        print(f"Court {court_num}:")
        for cmd, count in counts.items():
            if 'GetPoints' in cmd:
                print(f"  {cmd}: {count}")
    
    print()
    for court_id, state in stats['courts_state'].items():
        court_num = court_id[-3:]
        print(f"Court {court_num}: {state['points']} (games: {state['games']})")
    print("="*60 + "\n")

def main():
    log("=" * 60)
    log("SIMPLE THROTTLE TEST - 10s Point Polling")
    log("=" * 60)
    
    # Check mock UNO
    try:
        r = requests.get(f"{MOCK_UNO_URL}/stats", timeout=2)
        log("✓ Mock UNO server is running")
    except:
        log("✗ ERROR: Mock UNO server not running!")
        log("  Start it with: python mock_uno_server.py")
        return 1
    
    # Reset statistics
    reset_stats()
    time.sleep(1)
    
    log("\nTest scenario:")
    log("1. Poll immediately (t=0s) - should succeed")
    log("2. Poll after 5s (t=5s) - should be throttled if 10s interval")
    log("3. Poll after 11s (t=11s) - should succeed")
    log("4. Check total GetPoints requests = 4 (2 courts * 2 players * 1 successful poll)")
    log("")
    
    # === POLL 1: Immediate (t=0) ===
    log("\n[POLL 1] t=0s - First poll (should succeed)")
    start_time = time.time()
    poll_points(COURT_1)
    poll_points(COURT_2)
    
    # === POLL 2: After 5s (should be throttled) ===
    log("\n[POLL 2] t=5s - Within throttle window")
    time.sleep(5)
    elapsed = time.time() - start_time
    log(f"Elapsed: {elapsed:.1f}s")
    poll_points(COURT_1)
    poll_points(COURT_2)
    
    # === POLL 3: After 11s total (should succeed) ===
    log("\n[POLL 3] t=11s - After throttle window")
    time.sleep(6)  # 5 + 6 = 11 seconds total
    elapsed = time.time() - start_time
    log(f"Elapsed: {elapsed:.1f}s")
    poll_points(COURT_1)
    poll_points(COURT_2)
    
    # === Get final statistics ===
    time.sleep(2)
    stats = get_stats()
    print_stats(stats)
    
    # === Analyze results ===
    total_get_points = 0
    for court_id, counts in stats['by_court'].items():
        for cmd, count in counts.items():
            if 'GetPoints' in cmd:
                total_get_points += count
    
    log("=" * 60)
    log("TEST ANALYSIS")
    log("=" * 60)
    log(f"Total GetPoints requests: {total_get_points}")
    log(f"Expected without throttle: 12 (3 polls * 2 courts * 2 players)")
    log(f"Expected with 10s throttle: 8 (2 successful polls * 2 courts * 2 players)")
    log("")
    
    if total_get_points == 8:
        log("✓ PASS: Throttling is working correctly!")
        log("  Only 2 out of 3 polls succeeded (0s and 11s)")
        log("  Poll at 5s was correctly throttled")
        return 0
    elif total_get_points == 12:
        log("✗ FAIL: No throttling detected!")
        log("  All 3 polls succeeded - throttling not working")
        return 1
    else:
        log(f"? UNEXPECTED: Got {total_get_points} requests")
        log("  Expected 8 (with throttle) or 12 (without throttle)")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        exit(exit_code)
    except KeyboardInterrupt:
        log("\n\nTest interrupted by user")
        exit(2)
    except Exception as e:
        log(f"\n\nERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(3)
