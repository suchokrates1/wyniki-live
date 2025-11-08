#!/usr/bin/env python3
"""
Detailed UNO request monitor - 60 minute test analyzing all phases of a match.
Tracks every UNO command, match phases, and provides comprehensive statistics.
"""

import subprocess
import time
import re
from datetime import datetime
from collections import defaultdict, Counter
from typing import Dict, List, Optional

def run_ssh_command(cmd):
    """Execute SSH command and return output."""
    try:
        result = subprocess.run(
            ['ssh', 'minipc', cmd],
            capture_output=True,
            text=True,
            timeout=15
        )
        return result.stdout
    except Exception as e:
        print(f"❌ Error: {e}")
        return ""

def get_docker_logs_since(since_minutes=1):
    """Get Docker logs from production."""
    cmd = f"docker logs --since {since_minutes}m wyniki-tenis 2>&1"
    return run_ssh_command(cmd)

def parse_uno_commands(logs):
    """Parse all UNO commands from logs."""
    commands = defaultdict(int)
    
    # Pattern: "poller kort=X command=CommandName:"
    pattern = r'poller kort=(\d+) command=(\w+):'
    
    for line in logs.split('\n'):
        match = re.search(pattern, line)
        if match:
            court = match.group(1)
            command = match.group(2)
            commands[f"{court}:{command}"] += 1
    
    return commands

def parse_match_state(logs):
    """Parse match state and phases."""
    states = {}
    
    # Pattern: "uno state kort=X | "PlayerA" sets=X-X pts=X vs "PlayerB" sets=X-X pts=X | currSet=X"
    pattern = r'uno state kort=(\d+) \| "(.*?)" sets=([\d-]+) pts=(\d+) vs "(.*?)" sets=([\d-]+) pts=(\d+) \| currSet=(\w+)'
    
    for line in logs.split('\n'):
        match = re.search(pattern, line)
        if match:
            court = match.group(1)
            states[court] = {
                'player_a': match.group(2)[:30],
                'player_b': match.group(5)[:30],
                'sets_a': match.group(3),
                'sets_b': match.group(6),
                'points_a': match.group(4),
                'points_b': match.group(7),
                'current_set': match.group(8)
            }
    
    return states

def detect_match_phase(state):
    """Detect match phase based on state."""
    if not state:
        return "UNKNOWN"
    
    player_a = state.get('player_a', '-')
    player_b = state.get('player_b', '-')
    points_a = int(state.get('points_a', 0))
    points_b = int(state.get('points_b', 0))
    curr_set = state.get('current_set', 'None')
    
    # No players
    if player_a == '-' and player_b == '-':
        return "EMPTY"
    
    # Players loaded but no points
    if points_a == 0 and points_b == 0 and curr_set in ['None', 'null']:
        return "WARMUP"
    
    # Match in progress
    if points_a > 0 or points_b > 0:
        # Check for decisive points
        if points_a >= 40 or points_b >= 40:
            return "DECISIVE"
        else:
            return "IN_PLAY"
    
    return "BETWEEN_POINTS"

def parse_rate_limit_info(logs):
    """Parse rate limit information."""
    limit_info = None
    
    # Pattern: "RATE LIMIT kort=X: X/X remaining (resets at HH:MM:SS)"
    pattern = r'RATE LIMIT kort=\d+: (\d+)/(\d+) remaining \(resets at ([\d:]+)\)'
    
    for line in logs.split('\n'):
        match = re.search(pattern, line)
        if match:
            limit_info = {
                'remaining': int(match.group(1)),
                'total': int(match.group(2)),
                'reset_time': match.group(3)
            }
            # Keep last one
    
    return limit_info

def print_sample_report(iteration, elapsed_min, commands, states, limit_info, cumulative):
    """Print detailed sample report."""
    print(f"\n{'='*80}")
    print(f"📊 SAMPLE #{iteration} - {datetime.now().strftime('%H:%M:%S')} (elapsed: {elapsed_min:.1f} min)")
    print(f"{'='*80}")
    
    # Match states
    print(f"\n🎾 COURT STATUS:")
    if states:
        for court, state in sorted(states.items()):
            phase = detect_match_phase(state)
            emoji = {
                'EMPTY': '⚪',
                'WARMUP': '🔵',
                'IN_PLAY': '🟢',
                'DECISIVE': '🔴',
                'BETWEEN_POINTS': '🟡',
                'UNKNOWN': '⚫'
            }.get(phase, '⚫')
            
            print(f"  {emoji} Kort {court}: {state['player_a'][:20]} vs {state['player_b'][:20]}")
            print(f"     Phase: {phase} | Score: {state['points_a']}-{state['points_b']} | Set: {state['current_set']}")
    else:
        print(f"  No match data")
    
    # Commands breakdown
    if commands:
        print(f"\n📈 UNO COMMANDS (last minute):")
        
        # Group by court
        by_court = defaultdict(lambda: defaultdict(int))
        for key, count in commands.items():
            court, cmd = key.split(':', 1)
            by_court[court][cmd] += count
        
        total_commands = sum(commands.values())
        
        for court in sorted(by_court.keys()):
            court_cmds = by_court[court]
            court_total = sum(court_cmds.values())
            print(f"\n  Kort {court} ({court_total} commands):")
            
            # Sort by frequency
            for cmd, count in sorted(court_cmds.items(), key=lambda x: -x[1])[:10]:
                print(f"    {cmd:30s} {count:3d}x")
        
        print(f"\n  TOTAL COMMANDS: {total_commands}")
        cumulative['total_commands'] += total_commands
    else:
        print(f"\n📈 UNO COMMANDS: 0 (no logs)")
    
    # Rate limit
    if limit_info:
        print(f"\n⚠️  RATE LIMIT STATUS:")
        remaining = limit_info['remaining']
        total = limit_info['total']
        used = total - remaining
        percentage = (used / total * 100) if total > 0 else 0
        
        print(f"  Used: {used:,}/{total:,} ({percentage:.1f}%)")
        print(f"  Remaining: {remaining:,}")
        print(f"  Resets at: {limit_info['reset_time']}")
        
        # Warning thresholds
        if percentage > 90:
            print(f"  🔴 CRITICAL: {percentage:.1f}% used!")
        elif percentage > 80:
            print(f"  🟡 WARNING: {percentage:.1f}% used")
        elif percentage > 50:
            print(f"  🟢 OK: {percentage:.1f}% used")
    
    # Cumulative stats
    print(f"\n📊 CUMULATIVE STATISTICS:")
    print(f"  Total samples: {cumulative['samples']}")
    print(f"  Total commands: {cumulative['total_commands']:,}")
    if cumulative['samples'] > 0:
        avg_per_min = cumulative['total_commands'] / cumulative['samples']
        print(f"  Avg commands/minute: {avg_per_min:.1f}")
        print(f"  Projected/hour: {avg_per_min * 60:.0f}")
        print(f"  Projected/day: {avg_per_min * 60 * 24:.0f}")
    
    print(f"\n{'='*80}\n")

def main():
    """Main monitoring loop - 60 minutes."""
    print("🚀 Starting DETAILED UNO Request Monitor")
    print("📝 Monitoring: wyniki-tenis (production)")
    print("⏱️  Duration: 60 minutes")
    print("🔄 Sample interval: 60 seconds")
    print(f"🕐 Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\n" + "="*80)
    print("This test will track:")
    print("  • All UNO commands per court")
    print("  • Match phases (WARMUP, IN_PLAY, DECISIVE, etc.)")
    print("  • Rate limit status")
    print("  • Command frequency analysis")
    print("="*80)
    print("\nPress Ctrl+C to stop early\n")
    
    start_time = time.time()
    duration_minutes = 60
    sample_interval = 60
    
    cumulative = {
        'samples': 0,
        'total_commands': 0,
        'samples_data': [],
        'phases_history': defaultdict(int),
        'commands_history': Counter()
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
            
            # Get logs from last minute
            logs = get_docker_logs_since(since_minutes=1)
            
            if logs:
                # Parse everything
                commands = parse_uno_commands(logs)
                states = parse_match_state(logs)
                limit_info = parse_rate_limit_info(logs)
                
                # Update cumulative
                cumulative['samples'] += 1
                
                # Track phases
                for court, state in states.items():
                    phase = detect_match_phase(state)
                    cumulative['phases_history'][phase] += 1
                
                # Track commands
                for key, count in commands.items():
                    court, cmd = key.split(':', 1)
                    cumulative['commands_history'][cmd] += count
                
                # Store sample
                cumulative['samples_data'].append({
                    'timestamp': datetime.now(),
                    'commands': dict(commands),
                    'states': dict(states),
                    'limit_info': limit_info
                })
                
                # Print report
                print_sample_report(
                    iteration,
                    elapsed_minutes,
                    commands,
                    states,
                    limit_info,
                    cumulative
                )
            else:
                print(f"\n⚠️  Sample #{iteration} - No logs retrieved")
            
            # Wait for next sample
            if elapsed_minutes < duration_minutes:
                remaining = duration_minutes - elapsed_minutes
                print(f"⏳ Next sample in 60s... ({remaining:.1f} min remaining)")
                time.sleep(sample_interval)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Monitoring stopped by user")
        elapsed_minutes = (time.time() - start_time) / 60
    
    # Final summary
    print(f"\n{'#'*80}")
    print(f"📋 FINAL REPORT - 60 MINUTE UNO MONITORING TEST")
    print(f"{'#'*80}")
    
    print(f"\n⏱️  TEST DURATION: {elapsed_minutes:.1f} minutes")
    print(f"📊 SAMPLES COLLECTED: {cumulative['samples']}")
    
    print(f"\n📈 COMMAND STATISTICS:")
    print(f"  Total commands: {cumulative['total_commands']:,}")
    
    if cumulative['samples'] > 0:
        avg_per_min = cumulative['total_commands'] / cumulative['samples']
        print(f"  Avg per minute: {avg_per_min:.1f}")
        print(f"  Avg per hour: {avg_per_min * 60:.0f}")
        print(f"  Projected per day (24h): {avg_per_min * 60 * 24:,.0f}")
        print(f"  Projected per day (8h play): {avg_per_min * 60 * 8:,.0f}")
        
        if avg_per_min * 60 * 8 > 50000:
            print(f"  ❌ EXCEEDS 50k daily limit!")
        elif avg_per_min * 60 * 8 > 40000:
            print(f"  ⚠️  WARNING: Close to 50k limit")
        else:
            print(f"  ✅ Within 50k daily limit")
    
    # Top commands
    if cumulative['commands_history']:
        print(f"\n🔝 TOP 15 UNO COMMANDS:")
        for cmd, count in cumulative['commands_history'].most_common(15):
            percentage = (count / cumulative['total_commands'] * 100) if cumulative['total_commands'] > 0 else 0
            print(f"  {cmd:35s} {count:6,}x ({percentage:5.1f}%)")
    
    # Phase distribution
    if cumulative['phases_history']:
        print(f"\n🎯 MATCH PHASES DISTRIBUTION:")
        total_observations = sum(cumulative['phases_history'].values())
        for phase, count in sorted(cumulative['phases_history'].items(), key=lambda x: -x[1]):
            percentage = (count / total_observations * 100) if total_observations > 0 else 0
            print(f"  {phase:20s} {count:4d}x ({percentage:5.1f}%)")
    
    # Timeline analysis
    if cumulative['samples_data']:
        print(f"\n📉 TIMELINE ANALYSIS:")
        
        # Find peak activity
        max_commands = 0
        peak_sample = None
        for sample in cumulative['samples_data']:
            cmd_count = sum(sample['commands'].values())
            if cmd_count > max_commands:
                max_commands = cmd_count
                peak_sample = sample
        
        if peak_sample:
            print(f"  Peak activity: {max_commands} commands at {peak_sample['timestamp'].strftime('%H:%M:%S')}")
        
        # Find quietest period
        min_commands = float('inf')
        quiet_sample = None
        for sample in cumulative['samples_data']:
            cmd_count = sum(sample['commands'].values())
            if cmd_count < min_commands and cmd_count > 0:
                min_commands = cmd_count
                quiet_sample = sample
        
        if quiet_sample:
            print(f"  Quietest period: {min_commands} commands at {quiet_sample['timestamp'].strftime('%H:%M:%S')}")
    
    print(f"\n{'#'*80}\n")
    
    # Save detailed report
    report_file = f"uno_detailed_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(f"UNO Detailed Monitoring Report - 60 Minutes\n")
        f.write(f"{'='*80}\n\n")
        f.write(f"Start: {datetime.fromtimestamp(start_time).strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Duration: {elapsed_minutes:.1f} minutes\n")
        f.write(f"Samples: {cumulative['samples']}\n\n")
        
        f.write(f"COMMAND SUMMARY:\n")
        f.write(f"Total commands: {cumulative['total_commands']:,}\n")
        if cumulative['samples'] > 0:
            avg = cumulative['total_commands'] / cumulative['samples']
            f.write(f"Avg/min: {avg:.1f}\n")
            f.write(f"Avg/hour: {avg * 60:.0f}\n")
            f.write(f"Projected/day (8h): {avg * 60 * 8:,.0f}\n\n")
        
        f.write(f"TOP COMMANDS:\n")
        for cmd, count in cumulative['commands_history'].most_common(20):
            pct = (count / cumulative['total_commands'] * 100) if cumulative['total_commands'] > 0 else 0
            f.write(f"  {cmd:35s} {count:6,}x ({pct:5.1f}%)\n")
        
        f.write(f"\n\nDETAILED TIMELINE:\n")
        f.write(f"{'-'*80}\n")
        for i, sample in enumerate(cumulative['samples_data'], 1):
            cmd_count = sum(sample['commands'].values())
            f.write(f"\nSample #{i} - {sample['timestamp'].strftime('%H:%M:%S')}\n")
            f.write(f"  Commands: {cmd_count}\n")
            
            if sample['states']:
                f.write(f"  Courts:\n")
                for court, state in sorted(sample['states'].items()):
                    phase = detect_match_phase(state)
                    f.write(f"    Kort {court}: {phase:15s} {state['player_a'][:20]} vs {state['player_b'][:20]}\n")
            
            if sample['limit_info']:
                info = sample['limit_info']
                f.write(f"  Rate limit: {info['remaining']}/{info['total']} remaining\n")
    
    print(f"📄 Detailed report saved to: {report_file}\n")

if __name__ == '__main__':
    main()
