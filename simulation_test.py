"""
Simple polling simulation test
Tests ONLY the mock UNO server to verify throttling behavior
No wyniki-live configuration needed!
"""
import requests
import time
from datetime import datetime
import threading
import sys

MOCK_UNO_BASE = "http://localhost:5001"
TEST_DURATION_SECONDS = 60  # 1 minute test

# Overlays for each court
OVERLAYS = {
    1: "test-overlay-001",
    2: "test-overlay-002",
}

class PollerSimulator:
    """Simulates the SmartPollingController behavior"""
    
    def __init__(self, overlay_id: str, kort_id: int):
        self.overlay_id = overlay_id
        self.kort_id = kort_id
        self.uno_url = f"{MOCK_UNO_BASE}/apiv2/controlapps/{overlay_id}/api"
        self.running = False
        self.thread = None
        
        # Polling intervals (matching our code)
        self.POINT_INTERVAL = 10.0  # NEW: 10 seconds
        self.NAME_INTERVAL = 20.0
        self.VISIBILITY_INTERVAL = 180.0
        
        self.last_point_poll = 0
        self.last_name_poll = 0
        self.last_visibility_poll = 0
        
        self.request_count = 0
        
    def now(self):
        return time.time()
    
    def poll_points(self):
        """Poll GetPointsPlayerA/B with 10s throttle"""
        now = self.now()
        if now - self.last_point_poll < self.POINT_INTERVAL:
            return  # Throttled!
        
        try:
            # Poll both players
            requests.put(self.uno_url, json={"command": "GetPointsPlayerA"}, timeout=2)
            self.request_count += 1
            
            requests.put(self.uno_url, json={"command": "GetPointsPlayerB"}, timeout=2)
            self.request_count += 1
            
            self.last_point_poll = now
        except:
            pass
    
    def poll_names(self):
        """Poll GetNamePlayerA/B with 20s throttle"""
        now = self.now()
        if now - self.last_name_poll < self.NAME_INTERVAL:
            return
        
        try:
            requests.put(self.uno_url, json={"command": "GetNamePlayerA"}, timeout=2)
            self.request_count += 1
            
            requests.put(self.uno_url, json={"command": "GetNamePlayerB"}, timeout=2)
            self.request_count += 1
            
            self.last_name_poll = now
        except:
            pass
    
    def poll_visibility(self):
        """Poll GetTieBreakVisibility with 180s throttle"""
        now = self.now()
        if now - self.last_visibility_poll < self.VISIBILITY_INTERVAL:
            return
        
        try:
            requests.put(self.uno_url, json={"command": "GetTieBreakVisibility"}, timeout=2)
            self.request_count += 1
            
            self.last_visibility_poll = now
        except:
            pass
    
    def poll_loop(self):
        """Main polling loop - runs every 2 seconds"""
        while self.running:
            self.poll_points()
            self.poll_names()
            self.poll_visibility()
            time.sleep(2)  # Poll cycle every 2 seconds
    
    def start(self):
        """Start polling in background thread"""
        self.running = True
        self.thread = threading.Thread(target=self.poll_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        """Stop polling"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)

def main():
    print("\n" + "="*80)
    print("POLLING SIMULATION TEST (60 seconds)")
    print("="*80 + "\n")
    
    # Check mock UNO
    try:
        resp = requests.get(f"{MOCK_UNO_BASE}/stats", timeout=2)
        print("OK Mock UNO server is running")
    except:
        print("ERROR Mock UNO server is NOT running!")
        print("  Start it with: python mock_uno_server.py")
        return 1
    
    # Reset stats
    try:
        requests.get(f"{MOCK_UNO_BASE}/reset", timeout=2)
        print("OK Mock UNO stats reset")
    except:
        pass
    
    # Setup matches in mock UNO
    print("\nSetting up matches...")
    for kort, overlay_id in OVERLAYS.items():
        uno_url = f"{MOCK_UNO_BASE}/apiv2/controlapps/{overlay_id}/api"
        try:
            requests.put(uno_url, json={"command": "SetNamePlayerA", "value": f"Player {kort}A"}, timeout=2)
            requests.put(uno_url, json={"command": "SetNamePlayerB", "value": f"Player {kort}B"}, timeout=2)
            requests.put(uno_url, json={"command": "SetTieBreakVisibility", "value": True}, timeout=2)
            print(f"  OK Court {kort} match started")
        except Exception as e:
            print(f"  ERROR Court {kort}: {e}")
            return 1
    
    # Create pollers
    pollers = []
    for kort, overlay_id in OVERLAYS.items():
        poller = PollerSimulator(overlay_id, kort)
        pollers.append(poller)
        poller.start()
        print(f"OK Poller started for Court {kort}")
    
    print(f"\nRunning simulation for {TEST_DURATION_SECONDS} seconds...")
    print("Polling cycles every 2s, but with throttling:")
    print(f"  - Points: every {pollers[0].POINT_INTERVAL}s")
    print(f"  - Names: every {pollers[0].NAME_INTERVAL}s")
    print(f"  - Visibility: every {pollers[0].VISIBILITY_INTERVAL}s")
    print()
    
    start_time = time.time()
    last_report = start_time
    
    try:
        while time.time() - start_time < TEST_DURATION_SECONDS:
            time.sleep(5)
            
            # Report every 10 seconds
            if time.time() - last_report >= 10:
                elapsed = time.time() - start_time
                total_reqs = sum(p.request_count for p in pollers)
                rps = total_reqs / elapsed if elapsed > 0 else 0
                print(f"[{elapsed:.0f}s] Total requests: {total_reqs}, RPS: {rps:.2f}")
                last_report = time.time()
    
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    
    # Stop pollers
    print("\nStopping pollers...")
    for poller in pollers:
        poller.stop()
    
    # Get final stats
    time.sleep(1)
    
    try:
        stats = requests.get(f"{MOCK_UNO_BASE}/stats", timeout=5).json()
    except:
        stats = {}
    
    # Print results
    print("\n" + "="*80)
    print("TEST RESULTS")
    print("="*80 + "\n")
    
    duration = time.time() - start_time
    total_sim_requests = sum(p.request_count for p in pollers)
    
    print(f"Test Duration: {duration:.2f}s")
    print(f"Simulated Requests: {total_sim_requests}")
    print(f"RPS (simulated): {total_sim_requests/duration:.2f}")
    print()
    
    if stats:
        mock_total = stats.get('total_requests', 0)
        mock_rps = stats.get('requests_per_second', 0)
        
        print(f"Mock UNO Received: {mock_total} requests")
        print(f"Mock UNO RPS: {mock_rps:.2f}")
        print()
        
        print("Requests by Court:")
        by_court = stats.get('by_court', {})
        for overlay_id, counts in by_court.items():
            kort = overlay_id[-1]
            total = sum(counts.values())
            print(f"\n  Court {kort} - Total: {total}")
            for cmd, count in sorted(counts.items(), key=lambda x: -x[1]):
                print(f"    {cmd}: {count}")
    
    # Calculate expected vs actual
    print("\n" + "="*80)
    print("EFFICIENCY ANALYSIS")
    print("="*80 + "\n")
    
    # Expected requests for 60 second test
    expected_points = (duration / 10) * 2 * len(OVERLAYS)  # 2 players, every 10s, N courts
    expected_names = (duration / 20) * 2 * len(OVERLAYS)   # 2 players, every 20s
    expected_visibility = (duration / 180) * len(OVERLAYS)  # every 180s
    expected_total = expected_points + expected_names + expected_visibility
    
    print(f"Expected Points requests: ~{expected_points:.0f} (2 players x {len(OVERLAYS)} courts x every 10s)")
    print(f"Expected Names requests: ~{expected_names:.0f} (2 players x {len(OVERLAYS)} courts x every 20s)")
    print(f"Expected Visibility requests: ~{expected_visibility:.0f} ({len(OVERLAYS)} courts x every 180s)")
    print(f"Expected TOTAL: ~{expected_total:.0f}")
    print()
    
    if stats and mock_total > 0:
        # Count actual by type
        actual_points = 0
        actual_names = 0
        actual_visibility = 0
        
        for counts in by_court.values():
            actual_points += counts.get('GetPointsPlayerA', 0) + counts.get('GetPointsPlayerB', 0)
            actual_names += counts.get('GetNamePlayerA', 0) + counts.get('GetNamePlayerB', 0)
            actual_visibility += counts.get('GetTieBreakVisibility', 0)
        
        print(f"Actual Points requests: {actual_points}")
        print(f"Actual Names requests: {actual_names}")
        print(f"Actual Visibility requests: {actual_visibility}")
        print(f"Actual TOTAL: {mock_total}")
        print()
        
        # Efficiency
        points_efficiency = (expected_points / actual_points * 100) if actual_points > 0 else 0
        print(f"Points Efficiency: {points_efficiency:.1f}% (100% = perfect throttling)")
        
        if points_efficiency >= 90 and points_efficiency <= 110:
            print("  STATUS: EXCELLENT - Throttling works perfectly!")
        elif points_efficiency >= 70:
            print("  STATUS: GOOD - Minor variations acceptable")
        else:
            print("  STATUS: NEEDS REVIEW - Too many or too few requests")
    
    print("\n" + "="*80)
    print("Test completed!")
    print("="*80 + "\n")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
