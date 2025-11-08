"""
5-minute throttle validation test.
Continuously polls mock UNO API and tracks request patterns.
"""
import requests
import time
import threading
from datetime import datetime

MOCK_UNO_URL = "http://localhost:5001"
TEST_DURATION = 300  # 5 minutes
POLL_INTERVAL = 2.0  # Poll every 2 seconds (like real SmartPollingController)

# Test courts
COURTS = [
    "test-overlay-001",
    "test-overlay-002",
]

# Global state
running = True
poll_count = 0
start_time = None

def log(msg):
    elapsed = time.time() - start_time if start_time else 0
    print(f"[{elapsed:6.1f}s] {msg}")

def poll_court(court_id):
    """Poll all commands for a court (simulating SmartPollingController)."""
    url = f"{MOCK_UNO_URL}/apiv2/controlapps/{court_id}/api"
    
    commands = [
        "GetPointsPlayerA",
        "GetPointsPlayerB",
        "GetNamePlayerA",
        "GetNamePlayerB",
        "GetTieBreakVisibility"
    ]
    
    for cmd in commands:
        try:
            requests.put(url, json={"command": cmd}, timeout=1)
        except:
            pass

def polling_thread():
    """Background thread that polls continuously."""
    global poll_count, running
    
    while running:
        poll_start = time.time()
        
        for court_id in COURTS:
            if not running:
                break
            poll_court(court_id)
        
        poll_count += 1
        
        # Sleep to maintain interval
        elapsed = time.time() - poll_start
        sleep_time = max(0, POLL_INTERVAL - elapsed)
        time.sleep(sleep_time)

def get_stats():
    """Get statistics from mock UNO."""
    try:
        r = requests.get(f"{MOCK_UNO_URL}/stats", timeout=2)
        return r.json()
    except:
        return None

def print_stats(stats, interval_start_stats=None):
    """Print statistics summary."""
    if not stats:
        log("Failed to get statistics")
        return
    
    duration = stats['duration_seconds']
    total_reqs = stats['total_requests']
    rps = stats['requests_per_second']
    
    log("─" * 70)
    log(f"Duration: {duration:.1f}s | Total Requests: {total_reqs} | RPS: {rps:.2f}")
    
    # Count GetPoints requests
    total_get_points = 0
    for court_id, counts in stats['by_court'].items():
        court_points = 0
        for cmd, count in counts.items():
            if 'GetPoints' in cmd:
                court_points += count
        total_get_points += court_points
        
        court_num = court_id[-3:]
        state = stats['courts_state'].get(court_id, {})
        points = state.get('points', '?')
        log(f"  Court {court_num}: {court_points} GetPoints | Score: {points}")
    
    # If we have interval stats, show delta
    if interval_start_stats:
        interval_reqs = total_reqs - interval_start_stats['total_requests']
        interval_time = duration - interval_start_stats['duration_seconds']
        interval_rps = interval_reqs / interval_time if interval_time > 0 else 0
        log(f"  Last interval: +{interval_reqs} requests in {interval_time:.1f}s ({interval_rps:.2f} RPS)")
    
    # Analysis
    expected_polls = int(duration / POLL_INTERVAL)
    expected_get_points_old = expected_polls * 2 * len(COURTS)  # 2 players per court
    expected_get_points_new = int(duration / 10.0) * 2 * len(COURTS)  # 10s throttle
    
    log(f"  GetPoints Total: {total_get_points}")
    log(f"  Expected (no throttle, 2s): ~{expected_get_points_old}")
    log(f"  Expected (10s throttle): ~{expected_get_points_new}")
    
    if total_get_points < expected_get_points_old * 0.4:
        efficiency = (expected_get_points_new / total_get_points * 100) if total_get_points > 0 else 0
        log(f"  ✓ Throttling ACTIVE (~{efficiency:.0f}% efficiency)")
    else:
        log(f"  ✗ Throttling NOT working (too many requests)")
    
    log("─" * 70)

def main():
    global running, start_time
    
    print("\n" + "=" * 70)
    print("5-MINUTE THROTTLE VALIDATION TEST")
    print("=" * 70)
    print(f"Test duration: {TEST_DURATION}s ({TEST_DURATION/60:.1f} minutes)")
    print(f"Poll interval: {POLL_INTERVAL}s")
    print(f"Courts: {len(COURTS)}")
    print(f"Expected behavior:")
    print(f"  - GetPoints throttled to 10s")
    print(f"  - Names throttled to 20s")
    print(f"  - Visibility throttled to 180s")
    print("=" * 70)
    
    # Check mock UNO
    try:
        r = requests.get(f"{MOCK_UNO_URL}/stats", timeout=2)
        print("✓ Mock UNO server is running\n")
    except:
        print("✗ ERROR: Mock UNO server not running!")
        print("  Start it with: python mock_uno_server.py\n")
        return 1
    
    # Reset stats
    try:
        requests.get(f"{MOCK_UNO_URL}/reset", timeout=2)
        log("Stats reset")
    except:
        log("Warning: Could not reset stats")
    
    time.sleep(1)
    
    # Start polling thread
    start_time = time.time()
    thread = threading.Thread(target=polling_thread, daemon=True)
    thread.start()
    log("Polling started")
    
    # Progress reporting every 30 seconds
    report_interval = 30
    next_report = report_interval
    last_stats = None
    
    try:
        while time.time() - start_time < TEST_DURATION:
            time.sleep(5)
            
            elapsed = time.time() - start_time
            if elapsed >= next_report:
                stats = get_stats()
                if stats:
                    print_stats(stats, last_stats)
                    last_stats = stats
                next_report += report_interval
            
            # Progress indicator
            progress = (elapsed / TEST_DURATION) * 100
            remaining = TEST_DURATION - elapsed
            print(f"[{elapsed:6.1f}s] Progress: {progress:5.1f}% | Remaining: {remaining:5.1f}s | Polls: {poll_count}", end='\r')
        
        print()  # New line after progress
        
    except KeyboardInterrupt:
        log("\n\nTest interrupted by user!")
        running = False
        thread.join(timeout=2)
        return 2
    
    # Stop polling
    running = False
    thread.join(timeout=5)
    
    # Final statistics
    time.sleep(2)
    log("\n" + "=" * 70)
    log("FINAL RESULTS")
    log("=" * 70)
    
    final_stats = get_stats()
    if final_stats:
        print_stats(final_stats)
        
        # Detailed analysis
        duration = final_stats['duration_seconds']
        total_get_points = sum(
            count for court_counts in final_stats['by_court'].values()
            for cmd, count in court_counts.items()
            if 'GetPoints' in cmd
        )
        
        theoretical_old = (duration / 2.0) * 2 * len(COURTS)
        theoretical_new = (duration / 10.0) * 2 * len(COURTS)
        reduction = ((theoretical_old - total_get_points) / theoretical_old * 100) if theoretical_old > 0 else 0
        
        log("\nTHROTTLE ANALYSIS:")
        log(f"  Actual GetPoints requests: {total_get_points}")
        log(f"  Old behavior (2s interval): ~{theoretical_old:.0f} requests")
        log(f"  New behavior (10s interval): ~{theoretical_new:.0f} requests")
        log(f"  Request reduction: {reduction:.1f}%")
        log(f"  Throttle efficiency: {(theoretical_new/total_get_points*100) if total_get_points > 0 else 0:.1f}%")
        
        if 75 <= reduction <= 85:
            log("\n✓ SUCCESS: Throttling works as expected (~80% reduction)!")
            return 0
        elif reduction > 50:
            log(f"\n⚠ PARTIAL: Throttling active but not optimal ({reduction:.0f}% reduction)")
            return 0
        else:
            log(f"\n✗ FAIL: Throttling not working properly ({reduction:.0f}% reduction)")
            return 1
    else:
        log("✗ Could not retrieve final statistics")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        print("\n" + "=" * 70)
        print(f"Test completed with exit code: {exit_code}")
        print("=" * 70 + "\n")
        exit(exit_code)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(3)
