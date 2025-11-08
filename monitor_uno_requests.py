#!/usr/bin/env python3
"""
Monitor UNO requests on production server for 30 minutes.
Analyzes request patterns during different match phases.
"""

import subprocess
import time
import re
from datetime import datetime
from collections import defaultdict

def run_ssh_command(cmd):
    """Execute SSH command and return output."""
    try:
        result = subprocess.run(
            ['ssh', 'minipc', cmd],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return ""

def get_docker_logs(since_minutes=1):
    """Get recent Docker logs from production."""
    cmd = f"docker logs --since {since_minutes}m wyniki-tenis 2>&1"
    return run_ssh_command(cmd)

def parse_uno_stats(logs):
    """Parse UNO statistics from logs."""
    stats = {
        'total_requests': 0,
        'requests_per_minute': defaultdict(int),
        'courts_active': set(),
        'uno_disabled_warnings': 0,
        'uno_state_logs': 0,
        'matches_active': {}
    }
    
    # Pattern: "Zapytania do UNO 2025-11-08 18:55: 0/2"
    request_pattern = r'Zapytania do UNO (\d{4}-\d{2}-\d{2} \d{2}:\d{2}): (\d+)/(\d+)'
    
    # Pattern: "uno state kort=1 | "Player Name..." sets=0-0 pts=0 vs "Player Name" sets=0-0 pts=0 | currSet=1"
    state_pattern = r'uno state kort=(\d+) \| "(.*?)" sets=([\d-]+) pts=(\d+) vs "(.*?)" sets=([\d-]+) pts=(\d+) \| currSet=(\w+)'
    
    # Pattern: "WARNING: poller kort=1 command=GetPointsPlayerA: uno_disabled"
    disabled_pattern = r'WARNING: poller kort=(\d+) command=(\w+): uno_disabled'
    
    for line in logs.split('\n'):
        # Parse request statistics
        match = re.search(request_pattern, line)
        if match:
            timestamp = match.group(1)
            requests_sent = int(match.group(2))
            requests_queued = int(match.group(3))
            stats['total_requests'] += requests_sent
            stats['requests_per_minute'][timestamp] = requests_sent
        
        # Parse uno state logs
        match = re.search(state_pattern, line)
        if match:
            stats['uno_state_logs'] += 1
            court = match.group(1)
            player_a = match.group(2)
            player_b = match.group(5)
            curr_set = match.group(8)
            
            if player_a != '-' and player_b != '-':
                stats['courts_active'].add(court)
                stats['matches_active'][court] = {
                    'player_a': player_a[:20],
                    'player_b': player_b[:20],
                    'set': curr_set
                }
        
        # Parse uno_disabled warnings
        match = re.search(disabled_pattern, line)
        if match:
            stats['uno_disabled_warnings'] += 1
    
    return stats

def print_stats(stats, elapsed_minutes):
    """Pretty print statistics."""
    print(f"\n{'='*70}")
    print(f"📊 UNO MONITORING - {datetime.now().strftime('%H:%M:%S')} (uptime: {elapsed_minutes:.1f} min)")
    print(f"{'='*70}")
    
    print(f"\n🎾 ACTIVE MATCHES:")
    if stats['matches_active']:
        for court, match in stats['matches_active'].items():
            print(f"  Kort {court}: {match['player_a']} vs {match['player_b']} (set {match['set']})")
    else:
        print(f"  No active matches detected")
    
    print(f"\n📈 REQUEST STATISTICS:")
    print(f"  Total UNO requests sent: {stats['total_requests']}")
    print(f"  UNO state logs: {stats['uno_state_logs']}")
    print(f"  UNO disabled warnings: {stats['uno_disabled_warnings']}")
    print(f"  Active courts: {len(stats['courts_active'])} ({', '.join(sorted(stats['courts_active']))})")
    
    if stats['requests_per_minute']:
        print(f"\n⏱️  REQUESTS PER MINUTE (last 5 minutes):")
        sorted_times = sorted(stats['requests_per_minute'].keys(), reverse=True)[:5]
        for timestamp in sorted_times:
            count = stats['requests_per_minute'][timestamp]
            print(f"  {timestamp}: {count} requests")
    
    # Calculate averages
    if stats['total_requests'] > 0 and elapsed_minutes > 0:
        avg_per_min = stats['total_requests'] / elapsed_minutes
        print(f"\n📊 AVERAGES:")
        print(f"  Requests per minute: {avg_per_min:.2f}")
        print(f"  Requests per hour (projected): {avg_per_min * 60:.0f}")
    
    print(f"\n{'='*70}\n")

def main():
    """Main monitoring loop."""
    print("🚀 Starting UNO Request Monitor")
    print("📝 Monitoring production server (wyniki-tenis container)")
    print("⏱️  Duration: 30 minutes")
    print("🔄 Sample interval: 60 seconds")
    print(f"🕐 Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\nPress Ctrl+C to stop early\n")
    
    start_time = time.time()
    duration_minutes = 30
    sample_interval = 60  # seconds
    
    cumulative_stats = {
        'total_requests': 0,
        'total_state_logs': 0,
        'total_disabled_warnings': 0,
        'samples': []
    }
    
    try:
        iteration = 0
        while True:
            elapsed = time.time() - start_time
            elapsed_minutes = elapsed / 60
            
            if elapsed_minutes >= duration_minutes:
                print(f"\n✅ Monitoring complete ({duration_minutes} minutes)")
                break
            
            iteration += 1
            print(f"\n🔍 Sample #{iteration} (elapsed: {elapsed_minutes:.1f} min)")
            
            # Get logs from last minute
            logs = get_docker_logs(since_minutes=1)
            
            if not logs:
                print("⚠️  No logs retrieved")
            else:
                # Parse statistics
                stats = parse_uno_stats(logs)
                
                # Update cumulative stats
                cumulative_stats['total_requests'] += stats['total_requests']
                cumulative_stats['total_state_logs'] += stats['uno_state_logs']
                cumulative_stats['total_disabled_warnings'] += stats['uno_disabled_warnings']
                cumulative_stats['samples'].append({
                    'timestamp': datetime.now(),
                    'requests': stats['total_requests'],
                    'active_courts': len(stats['courts_active']),
                    'matches': stats['matches_active'].copy()
                })
                
                # Print current stats
                print_stats(stats, elapsed_minutes)
            
            # Wait for next sample
            if elapsed_minutes < duration_minutes:
                wait_time = sample_interval
                print(f"⏳ Next sample in {wait_time}s...")
                time.sleep(wait_time)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Monitoring stopped by user")
        elapsed_minutes = (time.time() - start_time) / 60
    
    # Print final summary
    print(f"\n{'#'*70}")
    print(f"📋 FINAL SUMMARY")
    print(f"{'#'*70}")
    print(f"\n⏱️  Monitoring duration: {elapsed_minutes:.1f} minutes")
    print(f"📊 Total samples: {len(cumulative_stats['samples'])}")
    print(f"\n📈 CUMULATIVE STATISTICS:")
    print(f"  Total UNO requests: {cumulative_stats['total_requests']}")
    print(f"  Total state logs: {cumulative_stats['total_state_logs']}")
    print(f"  Total disabled warnings: {cumulative_stats['total_disabled_warnings']}")
    
    if cumulative_stats['total_requests'] > 0 and elapsed_minutes > 0:
        avg_per_min = cumulative_stats['total_requests'] / elapsed_minutes
        print(f"\n📊 AVERAGES:")
        print(f"  Requests per minute: {avg_per_min:.2f}")
        print(f"  Requests per hour: {avg_per_min * 60:.0f}")
        print(f"  Requests per day (projected): {avg_per_min * 60 * 24:.0f}")
    
    # Analyze patterns
    if cumulative_stats['samples']:
        print(f"\n🔍 PATTERN ANALYSIS:")
        
        # Find peak activity
        max_requests = max(s['requests'] for s in cumulative_stats['samples'])
        peak_sample = [s for s in cumulative_stats['samples'] if s['requests'] == max_requests][0]
        print(f"  Peak activity: {max_requests} requests at {peak_sample['timestamp'].strftime('%H:%M:%S')}")
        
        # Courts activity
        court_activity = defaultdict(int)
        for sample in cumulative_stats['samples']:
            for court in sample['matches'].keys():
                court_activity[court] += 1
        
        if court_activity:
            print(f"  Most active courts:")
            for court, count in sorted(court_activity.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / len(cumulative_stats['samples'])) * 100
                print(f"    Kort {court}: {count}/{len(cumulative_stats['samples'])} samples ({percentage:.0f}%)")
    
    print(f"\n{'#'*70}\n")
    
    # Save to file
    output_file = f"uno_monitoring_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"UNO Monitoring Report\n")
        f.write(f"{'='*70}\n")
        f.write(f"Start: {datetime.fromtimestamp(start_time).strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Duration: {elapsed_minutes:.1f} minutes\n")
        f.write(f"Samples: {len(cumulative_stats['samples'])}\n\n")
        f.write(f"Total UNO requests: {cumulative_stats['total_requests']}\n")
        f.write(f"Total state logs: {cumulative_stats['total_state_logs']}\n")
        f.write(f"Total disabled warnings: {cumulative_stats['total_disabled_warnings']}\n\n")
        
        if cumulative_stats['total_requests'] > 0:
            avg_per_min = cumulative_stats['total_requests'] / elapsed_minutes
            f.write(f"Avg requests/min: {avg_per_min:.2f}\n")
            f.write(f"Avg requests/hour: {avg_per_min * 60:.0f}\n")
            f.write(f"Projected requests/day: {avg_per_min * 60 * 24:.0f}\n\n")
        
        f.write(f"\nDetailed samples:\n")
        f.write(f"{'-'*70}\n")
        for sample in cumulative_stats['samples']:
            f.write(f"{sample['timestamp'].strftime('%H:%M:%S')} | ")
            f.write(f"Requests: {sample['requests']:3d} | ")
            f.write(f"Courts: {sample['active_courts']} | ")
            if sample['matches']:
                matches_str = ', '.join([f"K{c}" for c in sample['matches'].keys()])
                f.write(f"Matches: {matches_str}\n")
            else:
                f.write(f"Matches: none\n")
    
    print(f"📄 Report saved to: {output_file}")

if __name__ == '__main__':
    main()
