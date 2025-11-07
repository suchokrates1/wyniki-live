"""Quick reset verification test."""
from wyniki.state import reset_after_match, enqueue_uno_full_reset, ensure_court_state, UNO_PENDING_COMMANDS

# Test 1: State reset
print("="*60)
print("TEST 1: State Reset")
print("="*60)

state = ensure_court_state('test1')
state['A']['surname'] = 'TestPlayer'
state['A']['flag_url'] = 'http://flag.url'
state['A']['flag_code'] = 'us'
state['A']['points'] = '40'
state['A']['set1'] = 6
state['tie']['visible'] = True
state['current_set'] = 2

print(f"\nBefore reset:")
print(f"  surname: {state['A']['surname']}")
print(f"  flag_url: {state['A']['flag_url']}")
print(f"  flag_code: {state['A']['flag_code']}")
print(f"  points: {state['A']['points']}")
print(f"  set1: {state['A']['set1']}")
print(f"  tie_visible: {state['tie']['visible']}")
print(f"  current_set: {state['current_set']}")

reset_after_match(state)

print(f"\nAfter reset:")
print(f"  surname: {state['A']['surname']}")
print(f"  flag_url: {state['A']['flag_url']}")
print(f"  flag_code: {state['A']['flag_code']}")
print(f"  points: {state['A']['points']}")
print(f"  set1: {state['A']['set1']}")
print(f"  tie_visible: {state['tie']['visible']}")
print(f"  current_set: {state['current_set']}")

# Check results
checks = [
    ('surname', state['A']['surname'] == '-'),
    ('flag_url', state['A']['flag_url'] is None),
    ('flag_code', state['A']['flag_code'] is None),
    ('points', state['A']['points'] == '0'),
    ('set1', state['A']['set1'] == 0),
    ('tie_visible', state['tie']['visible'] is False),
    ('current_set', state['current_set'] is None),
]

print(f"\nVerification:")
all_passed = True
for name, passed in checks:
    status = '✓' if passed else '✗'
    print(f"  {status} {name}: {'PASS' if passed else 'FAIL'}")
    if not passed:
        all_passed = False

# Test 2: UNO commands
print("\n" + "="*60)
print("TEST 2: UNO Reset Commands")
print("="*60)

state2 = ensure_court_state('test2')
state2['uno']['flag_field_a'] = 'player_a_flag'
state2['uno']['flag_field_b'] = 'player_b_flag'

UNO_PENDING_COMMANDS.clear()
result = enqueue_uno_full_reset('test2')

print(f"\nResult: {result}")
queued = UNO_PENDING_COMMANDS.get('test2', {})
print(f"Commands queued: {len(queued)}")

expected = [
    'reset_points', 'name_a', 'name_b',
    'set1_a', 'set1_b', 'set2_a', 'set2_b', 'set3_a', 'set3_b',
    'hide_tb', 'tb_a', 'tb_b', 'reset_time',
    'flag:reset_a', 'flag:reset_b'
]

print(f"\nExpected commands: {len(expected)}")
print(f"Commands found:")
for key in expected:
    item = queued.get(key)
    if item:
        cmd = item.get('command')
        payload = item.get('payload', {})
        print(f"  ✓ {key}: {cmd} {payload}")
    else:
        print(f"  ✗ {key}: MISSING")
        all_passed = False

# Verify flag commands
flag_a = queued.get('flag:reset_a')
flag_b = queued.get('flag:reset_b')

print(f"\nFlag reset verification:")
if flag_a and flag_a['payload'] == {'fieldId': 'player_a_flag', 'value': ''}:
    print(f"  ✓ Flag A: correct payload")
else:
    print(f"  ✗ Flag A: incorrect or missing")
    all_passed = False

if flag_b and flag_b['payload'] == {'fieldId': 'player_b_flag', 'value': ''}:
    print(f"  ✓ Flag B: correct payload")
else:
    print(f"  ✗ Flag B: incorrect or missing")
    all_passed = False

print("\n" + "="*60)
if all_passed:
    print("✓ ALL TESTS PASSED")
else:
    print("✗ SOME TESTS FAILED")
print("="*60)
