"""
Quick 30-second test - Fast verification of polling system
"""
from realistic_load_test import TestOrchestrator, COURTS, TEST_PLAYERS, COURT_OVERLAYS
import time

# Override test duration
TEST_DURATION_SECONDS = 30

def quick_test():
    print("\n" + "="*80)
    print("QUICK TEST (30 seconds)")
    print("="*80 + "\n")
    
    orchestrator = TestOrchestrator()
    orchestrator.start_time = time.time()
    
    # Setup
    orchestrator.setup_courts()
    time.sleep(1)
    
    # Start 2 matches (not all 4, to save time)
    for i in [0, 1]:
        kort = COURTS[i]
        player_a, player_b = TEST_PLAYERS[i]
        orchestrator.start_match(kort, player_a, player_b)
        time.sleep(0.5)
    
    orchestrator.log(f"⏳ Running quick test for {TEST_DURATION_SECONDS} seconds...")
    
    # Monitor
    end_time = time.time() + TEST_DURATION_SECONDS
    check_count = 0
    
    while time.time() < end_time:
        time.sleep(10)  # Check every 10 seconds
        check_count += 1
        
        elapsed = time.time() - orchestrator.start_time
        remaining = end_time - time.time()
        
        orchestrator.log(f"⏱️  Check #{check_count} - Elapsed: {elapsed:.0f}s, Remaining: {remaining:.0f}s")
        
        # Verify first 2 courts
        for kort in [1, 2]:
            orchestrator.verify_data(kort, expected_visible=True)
        
        # Show stats
        stats = orchestrator.get_mock_stats()
        if stats:
            total_req = stats.get('total_requests', 0)
            rps = stats.get('requests_per_second', 0)
            orchestrator.log(f"📊 Total requests: {total_req}, RPS: {rps:.2f}")
    
    orchestrator.log("✅ Quick test completed!")
    
    # Print statistics
    orchestrator.print_statistics()
    orchestrator.analyze_efficiency()
    
    return 0 if len(orchestrator.errors) == 0 else 1

if __name__ == '__main__':
    import sys
    # Check servers
    import requests
    try:
        requests.get("http://localhost:8080/api/snapshot", timeout=2)
        requests.get("http://localhost:5001/stats", timeout=2)
    except:
        print("❌ Servers not running! Start them first:")
        print("   Terminal 1: python mock_uno_server.py")
        print("   Terminal 2: python app.py")
        sys.exit(1)
    
    sys.exit(quick_test())
