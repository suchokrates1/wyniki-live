"""Admin API routes for global players management."""
import os
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, func

from ..db_models import db, GlobalPlayer, Player, MatchHistory
from ..config import logger

blueprint = Blueprint('admin_global_players', __name__, url_prefix='/admin/api/global-players')


@blueprint.route('', methods=['GET'])
def list_global_players():
    """List all global players with optional filters."""
    q = request.args.get('q', '').strip()
    gender = request.args.get('gender', '').strip()
    category = request.args.get('category', '').strip()
    country = request.args.get('country', '').strip()

    query = GlobalPlayer.query

    if q:
        pattern = f'%{q}%'
        query = query.filter(or_(
            GlobalPlayer.first_name.ilike(pattern),
            GlobalPlayer.last_name.ilike(pattern),
        ))
    if gender:
        query = query.filter(GlobalPlayer.gender == gender)
    if category:
        query = query.filter(GlobalPlayer.category == category)
    if country:
        query = query.filter(func.upper(GlobalPlayer.country) == country.upper())

    players = query.order_by(GlobalPlayer.last_name, GlobalPlayer.first_name).all()

    result = []
    for gp in players:
        d = gp.to_dict()
        # Count tournament entries
        d['tournaments_count'] = Player.query.filter_by(global_player_id=gp.id).count()
        result.append(d)

    return jsonify(result)


@blueprint.route('', methods=['POST'])
def create_global_player():
    """Create a new global player."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    if not last_name:
        return jsonify({'error': 'last_name is required'}), 400

    gp = GlobalPlayer(
        first_name=first_name,
        last_name=last_name,
        gender=data.get('gender', '').strip(),
        birth_date=data.get('birth_date', '').strip() or None,
        country=data.get('country', '').strip(),
        category=data.get('category', '').strip(),
        notes=data.get('notes', '').strip() or None,
    )
    db.session.add(gp)
    db.session.commit()
    logger.info("global_player_created", id=gp.id, name=gp.full_name)
    return jsonify(gp.to_dict()), 201


@blueprint.route('/<int:gp_id>', methods=['GET'])
def get_global_player(gp_id: int):
    """Get a global player with career stats."""
    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    d = gp.to_dict()

    # Tournament entries
    entries = Player.query.filter_by(global_player_id=gp_id).all()
    d['tournament_entries'] = [{
        'id': e.id,
        'tournament_id': e.tournament_id,
        'tournament_name': e.tournament.name if e.tournament else '',
        'category': e.category or '',
    } for e in entries]
    d['tournaments_count'] = len(entries)

    return jsonify(d)


@blueprint.route('/<int:gp_id>', methods=['PUT'])
def update_global_player(gp_id: int):
    """Update a global player."""
    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'first_name' in data:
        gp.first_name = data['first_name'].strip()
    if 'last_name' in data:
        gp.last_name = data['last_name'].strip()
    if 'gender' in data:
        gp.gender = data['gender'].strip()
    if 'birth_date' in data:
        gp.birth_date = data['birth_date'].strip() or None
    if 'country' in data:
        gp.country = data['country'].strip()
    if 'category' in data:
        gp.category = data['category'].strip()
    if 'notes' in data:
        gp.notes = data['notes'].strip() or None

    db.session.commit()
    logger.info("global_player_updated", id=gp_id)
    return jsonify(gp.to_dict())


@blueprint.route('/<int:gp_id>', methods=['DELETE'])
def delete_global_player(gp_id: int):
    """Delete a global player (only if no tournament entries)."""
    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    entries_count = Player.query.filter_by(global_player_id=gp_id).count()
    if entries_count > 0:
        return jsonify({
            'error': f'Cannot delete: player has {entries_count} tournament entries. Unlink them first.'
        }), 409

    db.session.delete(gp)
    db.session.commit()
    logger.info("global_player_deleted", id=gp_id)
    return jsonify({'message': 'Player deleted'})


@blueprint.route('/<int:gp_id>/photo', methods=['POST'])
def upload_photo(gp_id: int):
    """Upload a player photo (resized to max 200x200)."""
    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    if 'photo' not in request.files:
        return jsonify({'error': 'No photo file provided'}), 400

    file = request.files['photo']
    if not file.filename:
        return jsonify({'error': 'Empty file'}), 400

    try:
        from PIL import Image
        from ..config import settings

        img = Image.open(file.stream)
        img = img.convert('RGB')
        img.thumbnail((200, 200), Image.LANCZOS)

        # Store in /data/photos/ (persistent volume), not in static/
        data_dir = os.path.dirname(settings.database_path)
        photos_dir = os.path.join(data_dir, 'photos')
        os.makedirs(photos_dir, exist_ok=True)

        filename = f'{gp_id}.jpg'
        filepath = os.path.join(photos_dir, filename)
        img.save(filepath, 'JPEG', quality=85)

        gp.photo_url = f'/data/photos/{filename}'
        db.session.commit()

        logger.info("global_player_photo_uploaded", id=gp_id)
        return jsonify({'photo_url': gp.photo_url})
    except Exception as e:
        logger.error("photo_upload_error", id=gp_id, error=str(e))
        return jsonify({'error': f'Failed to process image: {str(e)}'}), 500


@blueprint.route('/<int:gp_id>/photo', methods=['DELETE'])
def delete_photo(gp_id: int):
    """Delete a player photo."""
    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    if gp.photo_url:
        from ..config import settings
        data_dir = os.path.dirname(settings.database_path)
        filepath = os.path.join(data_dir, 'photos', f'{gp_id}.jpg')
        if os.path.exists(filepath):
            os.remove(filepath)
        gp.photo_url = None
        db.session.commit()

    return jsonify({'message': 'Photo deleted'})


@blueprint.route('/migrate', methods=['POST'])
def migrate_existing_players():
    """One-time migration: create GlobalPlayer records from existing players.
    Groups by first_name+last_name, creates global records, links players."""
    from sqlalchemy import func as sqf

    # Check if already migrated
    existing = GlobalPlayer.query.count()
    if existing > 0:
        return jsonify({'message': f'Already migrated ({existing} global players exist)', 'count': existing})

    # Group existing players by first_name + last_name
    groups = db.session.query(
        Player.first_name, Player.last_name,
        sqf.max(Player.gender).label('gender'),
        sqf.max(Player.category).label('category'),
        sqf.max(Player.country).label('country'),
    ).group_by(Player.first_name, Player.last_name).all()

    created = 0
    linked = 0
    skipped_names = []
    for g in groups:
        fn = (g.first_name or '').strip()
        ln = (g.last_name or '').strip()
        full = f"{fn} {ln}".strip()

        # Skip test entry
        if full.lower() == 'dawid suchodolski':
            skipped_names.append(full)
            continue

        gp = GlobalPlayer(
            first_name=fn,
            last_name=ln,
            gender=g.gender or '',
            country=g.country or '',
            category=g.category or '',
        )
        db.session.add(gp)
        db.session.flush()  # get gp.id

        # Link all matching players
        matching = Player.query.filter_by(first_name=fn, last_name=ln).all()
        for p in matching:
            p.global_player_id = gp.id
            linked += 1

        created += 1

    # Also delete the test player entries
    test_players = Player.query.filter(
        func.lower(Player.first_name) == 'dawid',
        func.lower(Player.last_name) == 'suchodolski'
    ).all()
    for tp in test_players:
        db.session.delete(tp)

    db.session.commit()
    logger.info("global_players_migrated", created=created, linked=linked, skipped=skipped_names)
    return jsonify({
        'message': f'Migration complete: {created} global players created, {linked} tournament entries linked',
        'created': created,
        'linked': linked,
        'skipped': skipped_names,
    })


# === Tournament player entry with global link ===

@blueprint.route('/tournaments/<int:tid>/add-global', methods=['POST'])
def add_global_to_tournament(tid: int):
    """Add a global player to a tournament.
    Body: { global_player_id: int, category: str (optional override) }
    """
    from ..db_models import Tournament
    tournament = Tournament.query.get(tid)
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404

    data = request.get_json()
    gp_id = data.get('global_player_id')
    if not gp_id:
        return jsonify({'error': 'global_player_id is required'}), 400

    gp = GlobalPlayer.query.get(gp_id)
    if not gp:
        return jsonify({'error': 'Global player not found'}), 404

    # Check if already registered
    existing = Player.query.filter_by(tournament_id=tid, global_player_id=gp_id).first()
    if existing:
        return jsonify({'error': 'Player already in this tournament'}), 409

    category = data.get('category', '').strip() or gp.category or ''

    p = Player(
        tournament_id=tid,
        global_player_id=gp_id,
        name=gp.full_name,
        first_name=gp.first_name,
        last_name=gp.last_name,
        gender=gp.gender or '',
        category=category,
        country=gp.country or '',
    )
    db.session.add(p)
    db.session.commit()

    logger.info("global_player_added_to_tournament", gp_id=gp_id, tournament_id=tid, player_id=p.id)
    return jsonify(p.to_dict()), 201


@blueprint.route('/tournaments/<int:tid>/import-file', methods=['POST'])
def import_file_to_tournament(tid: int):
    """Import players from text — auto-match to global_players or create new.
    Body: { text: "First Last Category Country\\n..." }
    """
    from ..db_models import Tournament
    tournament = Tournament.query.get(tid)
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404

    data = request.get_json()
    text = data.get('text', '')
    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    lines = text.strip().split('\n')
    created_global = 0
    matched_global = 0
    added_tournament = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue

        parts = line.rsplit(' ', 2)
        if len(parts) == 3:
            name, category, country = parts
        elif len(parts) == 2:
            name, category = parts
            country = ''
        else:
            name = line
            category = ''
            country = ''

        name = name.strip()
        name_parts = name.rsplit(' ', 1)
        if len(name_parts) == 2:
            fn, ln = name_parts[0].strip(), name_parts[1].strip()
        else:
            fn, ln = '', name.strip()

        # Skip test entry
        if f"{fn} {ln}".strip().lower() == 'dawid suchodolski':
            continue

        # Try to find existing global player
        gp = GlobalPlayer.query.filter(
            func.lower(GlobalPlayer.first_name) == fn.lower(),
            func.lower(GlobalPlayer.last_name) == ln.lower(),
        ).first()

        if gp:
            matched_global += 1
        else:
            gp = GlobalPlayer(
                first_name=fn,
                last_name=ln,
                gender='',
                country=country.strip(),
                category=category.strip(),
            )
            db.session.add(gp)
            db.session.flush()
            created_global += 1

        # Check if already in tournament
        existing = Player.query.filter_by(tournament_id=tid, global_player_id=gp.id).first()
        if existing:
            continue

        p = Player(
            tournament_id=tid,
            global_player_id=gp.id,
            name=gp.full_name,
            first_name=fn,
            last_name=ln,
            gender=gp.gender or '',
            category=category.strip() or gp.category or '',
            country=country.strip() or gp.country or '',
        )
        db.session.add(p)
        added_tournament += 1

    db.session.commit()
    return jsonify({
        'message': f'Imported {added_tournament} players ({matched_global} matched, {created_global} new)',
        'added': added_tournament,
        'matched_global': matched_global,
        'created_global': created_global,
    })
