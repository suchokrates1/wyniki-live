"""
Realistic Load Test for wyniki-live system
Simulates 4 tennis courts with full match progression
Tests polling efficiency, request counts, and data accuracy
"""
import requests
import time
import json
from typing import Dict, Any
from datetime import datetime
import sys

API_BASE = "http://localhost:8080"
MOCK_UNO_BASE = "http://localhost:5001"

# Test configuration
TEST_DURATION_MINUTES = 5  # Run for 5 minutes
COURTS = [1, 2, 3, 4]

# Overlays for each court (mock IDs)
COURT_OVERLAYS = {
    1: "test-overlay-001",
    2: "test-overlay-002", 
    3: "test-overlay-003",
    4: "test-overlay-004"
}

# Test players
TEST_PLAYERS = [
    ("Rafael Nadal", "Novak Djokovic"),
    ("Roger Federer", "Andy Murray"),
    ("Carlos Alcaraz", "Daniil Medvedev"),
    ("Iga Swiatek", "Aryna Sabalenka"),
]

class TestOrchestrator:
    def __init__(self):
        self.start_time = time.time()
        self.events = []
        self.errors = []
        
    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{timestamp}] {level}: {message}")
        self.events.append({
            "time": time.time() - self.start_time,
            "level": level,
            "message": message
        })
    
    def setup_courts(self):
        """Configure courts with UNO overlays - send commands directly to mock UNO"""
        self.log(" Setting up courts...")
        
        for kort, overlay_id in COURT_OVERLAYS.items():
            # Just verify mock UNO is accessible
            uno_url = f"{MOCK_UNO_BASE}/apiv2/controlapps/{overlay_id}/api"
            
            try:
                # Send a simple GET to verify connection
                resp = requests.get(uno_url, timeout=5)
                if resp.status_code == 200:
                    self.log(f" Court {kort} can reach mock UNO API")
                else:
                    self.log(f"  Court {kort} mock UNO returned: {resp.status_code}", "WARN")
            except Exception as e:
                self.log(f" Court {kort} cannot reach mock UNO: {e}", "ERROR")
                self.errors.append(f"Court {kort} mock UNO unreachable: {e}")
    
    def start_match(self, kort: int, player_a: str, player_b: str):
        """Start a match by directly setting mock UNO state"""
        overlay_id = COURT_OVERLAYS[kort]
        self.log(f" Starting match on Court {kort}: {player_a} vs {player_b}")
        
        uno_url = f"{MOCK_UNO_BASE}/apiv2/controlapps/{overlay_id}/api"
        
        try:
            # Set player names in mock UNO
            requests.put(uno_url, json={"command": "SetNamePlayerA", "value": player_a}, timeout=5)
            requests.put(uno_url, json={"command": "SetNamePlayerB", "value": player_b}, timeout=5)
            
            # Activate overlay (this makes match active)
            resp = requests.put(uno_url, json={"command": "SetTieBreakVisibility", "value": True}, timeout=5)
            
            if resp.status_code == 200:
                self.log(f" Match started on Court {kort} (mock UNO state set)")
                self.log(f"   Note: wyniki-live will poll this data if overlay ID is configured")
            else:
                self.log(f" Mock UNO rejected command: {resp.status_code}", "ERROR")
                
        except Exception as e:
            self.log(f" Error starting match on Court {kort}: {e}", "ERROR")
            self.errors.append(f"Court {kort} match start error: {e}")
    
    def get_snapshot(self) -> Dict[str, Any]:
        """Get current state snapshot from wyniki-live"""
        try:
            resp = requests.get(f"{API_BASE}/api/snapshot", timeout=5)
            if resp.status_code == 200:
                return resp.json()
            return {}
        except:
            return {}
    
    def verify_data(self, kort: int, expected_visible: bool = True):
        """Verify that court data matches mock UNO state"""
        snapshot = self.get_snapshot()
        
        if str(kort) not in snapshot:
            self.log(f"  Court {kort} not in snapshot", "WARN")
            return False
        
        court_state = snapshot[str(kort)]
        
        # Check overlay visibility
        visible = court_state.get("overlay_visible", False)
        if visible != expected_visible:
            self.log(f" Court {kort} visibility mismatch: expected={expected_visible}, got={visible}", "ERROR")
            self.errors.append(f"Court {kort} visibility wrong")
            return False
        
        # Check if points are present
        a_state = court_state.get("A", {})
        b_state = court_state.get("B", {})
        
        a_points = a_state.get("points")
        b_points = b_state.get("points")
        
        if expected_visible:
            if a_points is None or b_points is None:
                self.log(f" Court {kort} missing points: A={a_points}, B={b_points}", "ERROR")
                self.errors.append(f"Court {kort} missing points")
                return False
            
            self.log(f" Court {kort} verified: {a_points}-{b_points} | {a_state.get('full_name', '?')} vs {b_state.get('full_name', '?')}")
        
        return True
    
    def get_mock_stats(self) -> Dict[str, Any]:
        """Get statistics from mock UNO server"""
        try:
            resp = requests.get(f"{MOCK_UNO_BASE}/stats", timeout=5)
            if resp.status_code == 200:
                return resp.json()
            return {}
        except:
            return {}
    
    def print_statistics(self):
        """Print comprehensive test statistics"""
        stats = self.get_mock_stats()
        
        print("\n" + "="*80)
        print(" TEST STATISTICS")
        print("="*80)
        
        duration = time.time() - self.start_time
        print(f"\n  Test Duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")
        
        if stats:
            print(f"\n Mock UNO API Requests:")
            print(f"   Total Requests: {stats.get('total_requests', 0)}")
            print(f"   Requests/Second: {stats.get('requests_per_second', 0):.2f}")
            
            print(f"\n Requests by Court:")
            by_court = stats.get('by_court', {})
            for overlay_id, counts in by_court.items():
                kort = overlay_id[-1]
                total = sum(counts.values())
                print(f"\n   Court {kort} - Total: {total} requests")
                for cmd, count in sorted(counts.items(), key=lambda x: -x[1])[:5]:
                    print(f"      {cmd}: {count}")
            
            print(f"\n Courts State:")
            courts_state = stats.get('courts_state', {})
            for overlay_id, state in courts_state.items():
                kort = overlay_id[-1]
                print(f"   Court {kort}: Visible={state.get('visible')}, "
                      f"Points={state.get('points')}, Games={state.get('games')}, "
                      f"Set1={state.get('set1')}")
        
        print(f"\n Errors: {len(self.errors)}")
        if self.errors:
            for error in self.errors[:10]:
                print(f"   - {error}")
        
        print(f"\n Events logged: {len(self.events)}")
        print("="*80 + "\n")
    
    def run_test(self):
        """Run the full load test"""
        print("\n" + "="*80)
        print(" WYNIKI-LIVE REALISTIC LOAD TEST")
        print("="*80 + "\n")
        
        # Reset mock server
        try:
            requests.get(f"{MOCK_UNO_BASE}/reset", timeout=5)
            self.log(" Mock server reset")
        except:
            self.log("  Could not reset mock server", "WARN")
        
        # Setup
        self.setup_courts()
        time.sleep(2)
        
        # Start matches on all courts
        for i, kort in enumerate(COURTS):
            player_a, player_b = TEST_PLAYERS[i]
            self.start_match(kort, player_a, player_b)
            time.sleep(0.5)
        
        self.log(f" Running test for {TEST_DURATION_MINUTES} minutes...")
        
        # Monitor for test duration
        end_time = time.time() + (TEST_DURATION_MINUTES * 60)
        check_interval = 15  # Check every 15 seconds
        
        check_count = 0
        while time.time() < end_time:
            time.sleep(check_interval)
            check_count += 1
            
            elapsed = time.time() - self.start_time
            remaining = end_time - time.time()
            
            self.log(f"  Check #{check_count} - Elapsed: {elapsed:.0f}s, Remaining: {remaining:.0f}s")
            
            # Verify data for all courts
            for kort in COURTS:
                self.verify_data(kort, expected_visible=True)
            
            # Show intermediate stats
            stats = self.get_mock_stats()
            if stats:
                total_req = stats.get('total_requests', 0)
                rps = stats.get('requests_per_second', 0)
                self.log(f" Total requests: {total_req}, RPS: {rps:.2f}")
        
        self.log(" Test completed!")
        
        # Final verification
        self.log(" Final data verification...")
        for kort in COURTS:
            self.verify_data(kort)
        
        # Print statistics
        self.print_statistics()
        
        # Calculate expected vs actual
        self.analyze_efficiency()
    
    def analyze_efficiency(self):
        """Analyze polling efficiency"""
        stats = self.get_mock_stats()
        if not stats:
            return
        
        print("\n" + "="*80)
        print(" EFFICIENCY ANALYSIS")
        print("="*80 + "\n")
        
        duration = stats.get('duration_seconds', 0)
        by_court = stats.get('by_court', {})
        
        print(f"Test Duration: {duration:.2f}s ({duration/60:.2f} min)\n")
        
        # Expected request counts based on polling intervals
        # Points: every 10s (in match mode)
        # Names: every 20s (pre-match) or 5s (after reset)
        # CurrentSet: only at 40/ADV points
        # Sets: only when games >= 3
        # Visibility: every 180s
        
        for overlay_id, counts in by_court.items():
            kort = overlay_id[-1]
            print(f"Court {kort}:")
            
            # Points polling
            points_reqs = counts.get('GetPointsPlayerA', 0) + counts.get('GetPointsPlayerB', 0)
            expected_points = (duration / 10) * 2  # 2 players, every 10s
            efficiency = (expected_points / points_reqs * 100) if points_reqs > 0 else 0
            
            print(f"  Points requests: {points_reqs}")
            print(f"  Expected (~10s interval): {expected_points:.0f}")
            print(f"  Efficiency: {efficiency:.1f}% (lower is better, means less spam)")
            
            # Names polling
            names_reqs = counts.get('GetNamePlayerA', 0) + counts.get('GetNamePlayerB', 0)
            print(f"  Names requests: {names_reqs}")
            
            # Visibility
            vis_reqs = counts.get('GetTieBreakVisibility', 0)
            expected_vis = duration / 180  # Every 3 minutes
            print(f"  Visibility requests: {vis_reqs} (expected: ~{expected_vis:.0f})")
            
            print()
        
        print("="*80 + "\n")

def main():
    # Check if servers are running
    print(" Checking if servers are running...")
    
    try:
        resp = requests.get(f"{API_BASE}/api/snapshot", timeout=2)
        print(f" wyniki-live API is running ({resp.status_code})")
    except:
        print(" wyniki-live API is NOT running!")
        print("   Start it with: python app.py")
        return 1
    
    try:
        resp = requests.get(f"{MOCK_UNO_BASE}/stats", timeout=2)
        print(f" Mock UNO API is running ({resp.status_code})")
    except:
        print(" Mock UNO API is NOT running!")
        print("   Start it with: python mock_uno_server.py")
        return 1
    
    print()
    
    # Run the test
    orchestrator = TestOrchestrator()
    orchestrator.run_test()
    
    return 0 if len(orchestrator.errors) == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
