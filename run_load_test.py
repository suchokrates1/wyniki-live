#!/usr/bin/env python3
"""
Test Runner - orchestrates all components for load testing
"""
import subprocess
import time
import sys
import os
import signal

processes = []

def cleanup():
    """Kill all child processes"""
    print("\n🛑 Cleaning up processes...")
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=3)
        except:
            try:
                p.kill()
            except:
                pass

def signal_handler(sig, frame):
    cleanup()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def main():
    print("="*80)
    print("🚀 WYNIKI-LIVE LOAD TEST RUNNER")
    print("="*80 + "\n")
    
    # Start mock UNO server
    print("1️⃣  Starting Mock UNO API Server...")
    mock_process = subprocess.Popen(
        [sys.executable, "mock_uno_server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        universal_newlines=True
    )
    processes.append(mock_process)
    time.sleep(2)
    
    # Check if wyniki-live is already running
    import requests
    try:
        resp = requests.get("http://localhost:8080/api/snapshot", timeout=2)
        print("✅ wyniki-live API is already running\n")
        wyniki_process = None
    except:
        print("2️⃣  Starting wyniki-live API...")
        wyniki_process = subprocess.Popen(
            [sys.executable, "app.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True
        )
        processes.append(wyniki_process)
        time.sleep(5)
    
    print("3️⃣  Waiting for services to be ready...")
    time.sleep(3)
    
    print("4️⃣  Running load test...\n")
    print("="*80 + "\n")
    
    # Run the load test
    test_process = subprocess.Popen(
        [sys.executable, "realistic_load_test.py"],
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    try:
        test_process.wait()
        exit_code = test_process.returncode
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        test_process.terminate()
        exit_code = 1
    
    print("\n" + "="*80)
    print("🏁 Test finished!")
    print("="*80 + "\n")
    
    # Keep servers running for inspection
    print("Mock UNO stats: http://localhost:5001/stats")
    print("wyniki-live snapshot: http://localhost:8080/api/snapshot")
    print("\nInspect snapshot with: python inspect_snapshot.py")
    print("\nPress Ctrl+C to stop servers...\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    
    cleanup()
    return exit_code

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        cleanup()
        sys.exit(1)
