"""Match events API endpoint for Android app."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from flask import Blueprint, jsonify, request

from ..config import logger
from ..database import db_conn
from ..services.court_manager import ensure_court_state, is_known_kort, STATE_LOCK
from ..services.event_broker import event_broker

blueprint = Blueprint('events', __name__, url_prefix='/api')


VALID_EVENT_TYPES = {
    'match_start',
    'point',
    'game',
    'set',
    'match_end',
    'serve_change',
    'side_change',
}


def verify_court_pin(kort_id: str, provided_pin: str) -> bool:
    """Verify PIN for court access."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT pin FROM courts WHERE kort_id = ?",
                (kort_id,)
            )
            row = cursor.fetchone()
            if not row:
                return False
            
            correct_pin = row['pin'] if row['pin'] else None
            if not correct_pin:
                return True  # No PIN set, allow access
            
            return str(provided_pin) == str(correct_pin)
    except Exception as e:
        logger.error(f"PIN verification failed: {e}")
        return False


def validate_event_data(data: Dict[str, Any]) -> tuple[bool, str]:
    """Validate incoming event data."""
    # Required fields
    if 'court_id' not in data:
        return False, "Missing court_id"
    
    if 'event_type' not in data:
        return False, "Missing event_type"
    
    if data['event_type'] not in VALID_EVENT_TYPES:
        return False, f"Invalid event_type: {data['event_type']}"
    
    if 'pin' not in data:
        return False, "Missing PIN"
    
    # Player data validation
    if 'player1' not in data or 'player2' not in data:
        return False, "Missing player data"
    
    for player_key in ['player1', 'player2']:
        player = data[player_key]
        if not isinstance(player, dict):
            return False, f"Invalid {player_key} format"
        
        if 'name' not in player:
            return False, f"Missing name in {player_key}"
    
    # Score data validation
    if 'score' not in data:
        return False, "Missing score data"
    
    score = data['score']
    if not isinstance(score, dict):
        return False, "Invalid score format"
    
    return True, ""


def process_match_event(kort_id: str, event_data: Dict[str, Any]) -> None:
    """Process match event and update court state."""
    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        event_type = event_data['event_type']
        
        # Update player data
        player1 = event_data['player1']
        player2 = event_data['player2']
        
        state['A']['surname'] = player1.get('name', '-')
        state['A']['flag_code'] = player1.get('flag_code')
        state['A']['flag_url'] = player1.get('flag_url')
        
        state['B']['surname'] = player2.get('name', '-')
        state['B']['flag_code'] = player2.get('flag_code')
        state['B']['flag_url'] = player2.get('flag_url')
        
        # Update serve indicator
        if player1.get('serving'):
            state['serve'] = 'A'
        elif player2.get('serving'):
            state['serve'] = 'B'
        
        # Update score
        score = event_data['score']
        
        # Update sets
        if 'sets' in score:
            sets = score['sets']
            state['A']['set1'] = sets.get('player1_set1', 0)
            state['A']['set2'] = sets.get('player1_set2', 0)
            state['A']['set3'] = sets.get('player1_set3', 0)
            
            state['B']['set1'] = sets.get('player2_set1', 0)
            state['B']['set2'] = sets.get('player2_set2', 0)
            state['B']['set3'] = sets.get('player2_set3', 0)
        
        # Update games
        if 'games' in score:
            games = score['games']
            state['A']['current_games'] = games.get('player1', 0)
            state['B']['current_games'] = games.get('player2', 0)
        
        # Update points
        if 'points' in score:
            points = score['points']
            state['A']['points'] = str(points.get('player1', '0'))
            state['B']['points'] = str(points.get('player2', '0'))
        
        # Update tiebreak
        if 'tiebreak' in score:
            tiebreak = score['tiebreak']
            if tiebreak.get('active'):
                state['tie']['visible'] = True
                state['tie']['A'] = tiebreak.get('player1', 0)
                state['tie']['B'] = tiebreak.get('player2', 0)
            else:
                state['tie']['visible'] = False
        
        # Update current set
        if 'current_set' in score:
            state['current_set'] = score['current_set']
        
        # Update match status
        match_finished = event_data.get('match_finished', False)
        
        if event_type == 'match_start':
            state['match_status']['active'] = True
            state['match_time']['started_ts'] = datetime.now(timezone.utc).isoformat()
            state['match_time']['running'] = True
            state['match_time']['resume_ts'] = datetime.now(timezone.utc).isoformat()
            logger.info(f"Match started on court {kort_id}: {player1['name']} vs {player2['name']}")
        
        elif event_type == 'match_end' or match_finished:
            state['match_status']['active'] = False
            state['match_time']['running'] = False
            state['match_time']['finished_ts'] = datetime.now(timezone.utc).isoformat()
            
            # Save to match history
            save_match_to_history(kort_id, state, event_data)
            logger.info(f"Match ended on court {kort_id}")
        
        # Update timestamp
        state['updated'] = datetime.now(timezone.utc).isoformat()
        
        # Broadcast update via SSE
        broadcast_state_update(kort_id, state)


def save_match_to_history(kort_id: str, state: Dict[str, Any], event_data: Dict[str, Any]) -> None:
    """Save completed match to history."""
    try:
        from ..database import insert_match_history
        
        # Calculate duration
        started_ts = state['match_time'].get('started_ts')
        finished_ts = state['match_time'].get('finished_ts')
        
        duration_seconds = 0
        if started_ts and finished_ts:
            from ..utils import parse_iso_datetime
            started = parse_iso_datetime(started_ts)
            finished = parse_iso_datetime(finished_ts)
            duration_seconds = int((finished - started).total_seconds())
        
        # Format scores
        player1 = event_data['player1']
        player2 = event_data['player2']
        
        score_a = f"{state['A']['set1']}-{state['A']['set2']}-{state['A']['set3']}"
        score_b = f"{state['B']['set1']}-{state['B']['set2']}-{state['B']['set3']}"
        
        entry = {
            'kort_id': kort_id,
            'ended_ts': finished_ts or datetime.now(timezone.utc).isoformat(),
            'duration_seconds': duration_seconds,
            'player_a': player1['name'],
            'player_b': player2['name'],
            'score_a': score_a,
            'score_b': score_b,
            'category': state.get('history_meta', {}).get('category'),
            'phase': state.get('history_meta', {}).get('phase', 'Grupowa'),
        }
        
        insert_match_history(entry)
        logger.info(f"Match saved to history: {kort_id}")
        
    except Exception as e:
        logger.error(f"Failed to save match history: {e}")


def broadcast_state_update(kort_id: str, state: Dict[str, Any]) -> None:
    """Broadcast state update to SSE clients."""
    try:
        # Prepare payload for SSE
        payload = {
            'type': 'state_update',
            'kort_id': kort_id,
            'data': serialize_court_state(state),
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        
        event_broker.broadcast(payload)
    except Exception as e:
        logger.error(f"Failed to broadcast update: {e}")


def serialize_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize court state for public API."""
    return {
        'players': {
            'A': {
                'name': state['A']['surname'],
                'flag_code': state['A']['flag_code'],
                'flag_url': state['A']['flag_url'],
                'points': state['A']['points'],
                'set1': state['A']['set1'],
                'set2': state['A']['set2'],
                'set3': state['A']['set3'],
                'games': state['A']['current_games'],
            },
            'B': {
                'name': state['B']['surname'],
                'flag_code': state['B']['flag_code'],
                'flag_url': state['B']['flag_url'],
                'points': state['B']['points'],
                'set1': state['B']['set1'],
                'set2': state['B']['set2'],
                'set3': state['B']['set3'],
                'games': state['B']['current_games'],
            },
        },
        'serve': state.get('serve'),
        'current_set': state.get('current_set', 1),
        'tiebreak': {
            'active': state['tie'].get('visible', False),
            'A': state['tie'].get('A', 0),
            'B': state['tie'].get('B', 0),
        },
        'match_active': state['match_status'].get('active', False),
        'match_time': state['match_time'].get('seconds', 0),
    }


@blueprint.route('/events', methods=['POST'])
def receive_event():
    """Receive match event from Android app."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate event data
        valid, error_msg = validate_event_data(data)
        if not valid:
            return jsonify({'error': error_msg}), 400
        
        kort_id = str(data['court_id'])
        
        # Check if court exists
        if not is_known_kort(kort_id):
            return jsonify({'error': f'Court {kort_id} not found'}), 404
        
        # Verify PIN
        provided_pin = str(data['pin'])
        if not verify_court_pin(kort_id, provided_pin):
            logger.warning(f"Invalid PIN attempt for court {kort_id}")
            return jsonify({'error': 'Invalid PIN'}), 403
        
        # Process event
        process_match_event(kort_id, data)
        
        logger.info(
            "event_received",
            kort_id=kort_id,
            event_type=data['event_type'],
            player1=data['player1']['name'],
            player2=data['player2']['name']
        )
        
        return jsonify({
            'ok': True,
            'message': 'Event processed successfully',
            'kort_id': kort_id,
            'event_type': data['event_type'],
        }), 201
        
    except Exception as e:
        logger.error(f"Failed to process event: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
