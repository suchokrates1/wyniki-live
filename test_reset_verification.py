#!/usr/bin/env python3
"""
Test reset verification script.
Checks if reset functionality properly clears all fields:
- Player names → "-"
- Flags → removed (flag_url=None, flag_code=None)
- Points → "0"
- Sets (1/2/3) → 0
- Tie-break → hidden (visible=False)
- Active set → cleared (None)
- Match time → 0 seconds, not running
"""

import sys
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from wyniki.state import (
    reset_after_match,
    enqueue_uno_full_reset,
    snapshots,
    ensure_court_state,
    UNO_PENDING_COMMANDS,
)


def print_section(title):
    """Print section header."""
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")


def verify_state_reset():
    """Verify that reset_after_match() clears all fields correctly."""
    print_section("TEST 1: State Reset Verification")
    
    # Create test court state with data
    test_kort = "test1"
    state = ensure_court_state(test_kort)
    
    # Set up test data (simulating an active match)
    state["A"]["full_name"] = "John Doe"
    state["A"]["surname"] = "Doe"
    state["A"]["flag_url"] = "https://flagcdn.com/w80/us.png"
    state["A"]["flag_code"] = "us"
    state["A"]["points"] = "40"
    state["A"]["set1"] = 6
    state["A"]["set2"] = 3
    state["A"]["set3"] = 2
    state["A"]["current_games"] = 3
    
    state["B"]["full_name"] = "Jane Smith"
    state["B"]["surname"] = "Smith"
    state["B"]["flag_url"] = "https://flagcdn.com/w80/fr.png"
    state["B"]["flag_code"] = "fr"
    state["B"]["points"] = "30"
    state["B"]["set1"] = 4
    state["B"]["set2"] = 6
    state["B"]["set3"] = 1
    state["B"]["current_games"] = 1
    
    state["tie"]["visible"] = True
    state["tie"]["A"] = 7
    state["tie"]["B"] = 5
    state["current_set"] = 3
    state["match_time"]["seconds"] = 3600
    state["match_time"]["running"] = True
    state["match_status"]["active"] = True
    
    print("\n✓ Test data prepared:")
    print(f"  Player A: {state['A']['surname']} ({state['A']['flag_code']}) - {state['A']['points']}")
    print(f"  Player B: {state['B']['surname']} ({state['B']['flag_code']}) - {state['B']['points']}")
    print(f"  Sets: {state['A']['set1']}-{state['B']['set1']}, {state['A']['set2']}-{state['B']['set2']}, {state['A']['set3']}-{state['B']['set3']}")
    print(f"  Tie-break: {state['tie']['A']}-{state['tie']['B']} (visible: {state['tie']['visible']})")
    print(f"  Current set: {state['current_set']}")
    print(f"  Match time: {state['match_time']['seconds']}s (running: {state['match_time']['running']})")
    
    # Execute reset
    print("\n→ Executing reset_after_match()...")
    reset_after_match(state)
    
    # Verify results
    print("\n✓ Verification results:")
    
    checks = []
    
    # Player A checks
    checks.append(("Player A surname", state["A"]["surname"], "-"))
    checks.append(("Player A full_name", state["A"]["full_name"], None))
    checks.append(("Player A flag_url", state["A"]["flag_url"], None))
    checks.append(("Player A flag_code", state["A"]["flag_code"], None))
    checks.append(("Player A points", state["A"]["points"], "0"))
    checks.append(("Player A set1", state["A"]["set1"], 0))
    checks.append(("Player A set2", state["A"]["set2"], 0))
    checks.append(("Player A set3", state["A"]["set3"], 0))
    checks.append(("Player A current_games", state["A"]["current_games"], 0))
    
    # Player B checks
    checks.append(("Player B surname", state["B"]["surname"], "-"))
    checks.append(("Player B full_name", state["B"]["full_name"], None))
    checks.append(("Player B flag_url", state["B"]["flag_url"], None))
    checks.append(("Player B flag_code", state["B"]["flag_code"], None))
    checks.append(("Player B points", state["B"]["points"], "0"))
    checks.append(("Player B set1", state["B"]["set1"], 0))
    checks.append(("Player B set2", state["B"]["set2"], 0))
    checks.append(("Player B set3", state["B"]["set3"], 0))
    checks.append(("Player B current_games", state["B"]["current_games"], 0))
    
    # Tie-break checks
    checks.append(("Tie-break visible", state["tie"]["visible"], False))
    checks.append(("Tie-break A", state["tie"]["A"], 0))
    checks.append(("Tie-break B", state["tie"]["B"], 0))
    
    # Other checks
    checks.append(("Current set", state["current_set"], None))
    checks.append(("Match time seconds", state["match_time"]["seconds"], 0))
    checks.append(("Match time running", state["match_time"]["running"], False))
    checks.append(("Match status active", state["match_status"]["active"], False))
    
    passed = 0
    failed = 0
    
    for name, actual, expected in checks:
        if actual == expected:
            print(f"  ✓ {name}: {actual}")
            passed += 1
        else:
            print(f"  ✗ {name}: {actual} (expected: {expected})")
            failed += 1
    
    print(f"\n{'─'*60}")
    print(f"  Results: {passed} passed, {failed} failed")
    
    return failed == 0


def verify_uno_reset_commands():
    """Verify that enqueue_uno_full_reset() sends all necessary commands."""
    print_section("TEST 2: UNO Reset Commands Verification")
    
    # Create test court state with UNO flag fields
    test_kort = "test2"
    state = ensure_court_state(test_kort)
    state["uno"]["flag_field_a"] = "player_a_flag"
    state["uno"]["flag_field_b"] = "player_b_flag"
    
    # Clear any existing commands
    UNO_PENDING_COMMANDS.clear()
    
    print("\n✓ Test court prepared with UNO flag fields:")
    print(f"  Flag field A: {state['uno']['flag_field_a']}")
    print(f"  Flag field B: {state['uno']['flag_field_b']}")
    
    # Execute UNO reset
    print("\n→ Executing enqueue_uno_full_reset()...")
    result = enqueue_uno_full_reset(test_kort)
    
    print(f"  Result: {result}")
    
    # Check queued commands
    queued = UNO_PENDING_COMMANDS.get(test_kort, {})
    print(f"\n✓ Queued commands: {len(queued)} total")
    
    expected_commands = {
        "reset_points": "ResetPoints",
        "name_a": "SetNamePlayerA",
        "name_b": "SetNamePlayerB",
        "set1_a": "SetSet1PlayerA",
        "set1_b": "SetSet1PlayerB",
        "set2_a": "SetSet2PlayerA",
        "set2_b": "SetSet2PlayerB",
        "set3_a": "SetSet3PlayerA",
        "set3_b": "SetSet3PlayerB",
        "hide_tb": "HideTieBreak",
        "tb_a": "SetTieBreakPlayerA",
        "tb_b": "SetTieBreakPlayerB",
        "reset_time": "ResetMatchTime",
        "flag:reset_a": "SetCustomizationField",
        "flag:reset_b": "SetCustomizationField",
    }
    
    checks = []
    
    for key, expected_cmd in expected_commands.items():
        item = queued.get(key)
        if item:
            actual_cmd = item.get("command")
            checks.append((key, actual_cmd, expected_cmd, item.get("payload")))
        else:
            checks.append((key, None, expected_cmd, None))
    
    passed = 0
    failed = 0
    
    for key, actual_cmd, expected_cmd, payload in checks:
        if actual_cmd == expected_cmd:
            payload_str = json.dumps(payload) if payload else "None"
            print(f"  ✓ {key}: {actual_cmd} - payload: {payload_str}")
            passed += 1
        else:
            print(f"  ✗ {key}: {actual_cmd} (expected: {expected_cmd})")
            failed += 1
    
    # Verify flag reset commands have correct payloads
    flag_a = queued.get("flag:reset_a")
    flag_b = queued.get("flag:reset_b")
    
    print("\n✓ Flag reset command details:")
    
    if flag_a:
        expected_payload_a = {"fieldId": "player_a_flag", "value": ""}
        actual_payload_a = flag_a.get("payload", {})
        if actual_payload_a == expected_payload_a:
            print(f"  ✓ Flag A payload correct: {actual_payload_a}")
            passed += 1
        else:
            print(f"  ✗ Flag A payload incorrect: {actual_payload_a} (expected: {expected_payload_a})")
            failed += 1
    else:
        print("  ✗ Flag A command missing")
        failed += 1
    
    if flag_b:
        expected_payload_b = {"fieldId": "player_b_flag", "value": ""}
        actual_payload_b = flag_b.get("payload", {})
        if actual_payload_b == expected_payload_b:
            print(f"  ✓ Flag B payload correct: {actual_payload_b}")
            passed += 1
        else:
            print(f"  ✗ Flag B payload incorrect: {actual_payload_b} (expected: {expected_payload_b})")
            failed += 1
    else:
        print("  ✗ Flag B command missing")
        failed += 1
    
    print(f"\n{'─'*60}")
    print(f"  Results: {passed} passed, {failed} failed")
    
    return failed == 0


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print(" RESET FUNCTIONALITY VERIFICATION")
    print("="*60)
    
    test1_passed = verify_state_reset()
    test2_passed = verify_uno_reset_commands()
    
    print_section("FINAL RESULTS")
    
    if test1_passed and test2_passed:
        print("\n✓ ALL TESTS PASSED")
        print("\nConclusion:")
        print("  • reset_after_match() correctly clears all state fields")
        print("  • enqueue_uno_full_reset() sends all 15 commands:")
        print("    - 13 basic reset commands (points, names, sets, tie-break, time)")
        print("    - 2 flag reset commands (SetCustomizationField for A & B)")
        print("  • Scoreboards will display cleared values correctly")
        print("  • UNO overlay will receive flag reset commands with empty values")
        return 0
    else:
        print("\n✗ SOME TESTS FAILED")
        if not test1_passed:
            print("  • State reset has issues")
        if not test2_passed:
            print("  • UNO command queue has issues")
        return 1


if __name__ == "__main__":
    sys.exit(main())
