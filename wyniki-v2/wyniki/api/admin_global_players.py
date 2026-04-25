"""Admin API routes for global players management."""
import os
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, func

from ..db_models import db, GlobalPlayer, Player, MatchHistory
from ..config import logger
from ..services.player_registry import create_tournament_player, find_or_create_global_player, split_player_name

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
    player_ids = [player.id for player in players]
    tournament_counts = {}
    if player_ids:
        tournament_counts = dict(
            db.session.query(Player.global_player_id, func.count(Player.id))
            .filter(Player.global_player_id.in_(player_ids))
            .group_by(Player.global_player_id)
            .all()
        )

    result = []
    for gp in players:
        d = gp.to_dict()
        d['tournaments_count'] = tournament_counts.get(gp.id, 0)
        result.append(d)

    return jsonify(result)


@blueprint.route('', methods=['POST'])
def create_global_player():
    """Create a new global player."""
    data = request.get_json(silent=True) or {}
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
    gp = db.session.get(GlobalPlayer, gp_id)
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
    gp = db.session.get(GlobalPlayer, gp_id)
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
    gp = db.session.get(GlobalPlayer, gp_id)
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
    gp = db.session.get(GlobalPlayer, gp_id)
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
    gp = db.session.get(GlobalPlayer, gp_id)
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
    tournament = db.session.get(Tournament, tid)
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404
    if int(tournament.active or 0) != 1:
        return jsonify({'error': 'Tournament is inactive'}), 409

    data = request.get_json(silent=True) or {}
    gp_id = data.get('global_player_id')
    if not gp_id:
        return jsonify({'error': 'global_player_id is required'}), 400

    gp = db.session.get(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({'error': 'Global player not found'}), 404

    # Check if already registered
    existing = Player.query.filter_by(tournament_id=tid, global_player_id=gp_id).first()
    if existing:
        return jsonify({'error': 'Player already in this tournament'}), 409

    category = data.get('category', '').strip() or gp.category or ''

    p = create_tournament_player(
        db.session,
        tournament_id=tid,
        name=gp.full_name,
        first_name=gp.first_name,
        last_name=gp.last_name,
        gender=gp.gender or '',
        category=category,
        country=gp.country or '',
        global_player=gp,
    )
    db.session.commit()

    logger.info("global_player_added_to_tournament", gp_id=gp_id, tournament_id=tid, player_id=p.id)
    return jsonify(p.to_dict()), 201


@blueprint.route('/tournaments/<int:tid>/import-file', methods=['POST'])
def import_file_to_tournament(tid: int):
    """Import players from text — auto-match to global_players or create new.
    Body: { text: "First Last Category Country\\n..." }
    """
    from ..db_models import Tournament
    tournament = db.session.get(Tournament, tid)
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404
    if int(tournament.active or 0) != 1:
        return jsonify({'error': 'Tournament is inactive'}), 409

    data = request.get_json(silent=True) or {}
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

        name, fn, ln = split_player_name(name=name.strip())

        # Skip test entry
        if f"{fn} {ln}".strip().lower() == 'dawid suchodolski':
            continue

        gp_exists = GlobalPlayer.query.filter(
            func.lower(func.trim(GlobalPlayer.first_name)) == fn.lower(),
            func.lower(func.trim(GlobalPlayer.last_name)) == ln.lower(),
        ).first()
        gp = find_or_create_global_player(db.session, fn, ln, category, country)
        if not gp:
            continue
        if gp_exists:
            matched_global += 1
        else:
            created_global += 1

        # Check if already in tournament
        existing = Player.query.filter_by(tournament_id=tid, global_player_id=gp.id).first()
        if existing:
            continue

        create_tournament_player(
            db.session,
            tournament_id=tid,
            name=name,
            first_name=fn,
            last_name=ln,
            gender=gp.gender or '',
            category=category.strip() or gp.category or '',
            country=country.strip() or gp.country or '',
            global_player=gp,
        )
        added_tournament += 1

    db.session.commit()
    return jsonify({
        'message': f'Imported {added_tournament} players ({matched_global} matched, {created_global} new)',
        'added': added_tournament,
        'matched_global': matched_global,
        'created_global': created_global,
    })


@blueprint.route('/duplicates', methods=['GET'])
def find_duplicates():
    """Find duplicate global players (same last_name or same first+last)."""
    from sqlalchemy import func as sqf

    # Find by same last_name
    dupes_by_lastname = (
        db.session.query(sqf.lower(sqf.trim(GlobalPlayer.last_name)).label('ln'),
                         sqf.count(GlobalPlayer.id).label('cnt'))
        .filter(GlobalPlayer.last_name.isnot(None), sqf.trim(GlobalPlayer.last_name) != '')
        .group_by(sqf.lower(sqf.trim(GlobalPlayer.last_name)))
        .having(sqf.count(GlobalPlayer.id) > 1)
        .all()
    )

    result = []
    for ln, cnt in dupes_by_lastname:
        players = GlobalPlayer.query.filter(
            sqf.lower(sqf.trim(GlobalPlayer.last_name)) == ln
        ).all()
        entries = []
        for gp in players:
            tournament_count = Player.query.filter_by(global_player_id=gp.id).count()
            entries.append({
                **gp.to_dict(),
                'tournaments_count': tournament_count,
            })
        result.append({
            'last_name': ln,
            'count': cnt,
            'players': entries,
        })

    return jsonify(result)


@blueprint.route('/no-first-name', methods=['GET'])
def find_no_first_name():
    """Find global players without first names."""
    from sqlalchemy import func as sqf

    players = GlobalPlayer.query.filter(
        or_(GlobalPlayer.first_name.is_(None), sqf.trim(GlobalPlayer.first_name) == '')
    ).order_by(GlobalPlayer.last_name).all()

    result = []
    for gp in players:
        d = gp.to_dict()
        d['tournaments_count'] = Player.query.filter_by(global_player_id=gp.id).count()
        result.append(d)

    return jsonify(result)


@blueprint.route('/merge', methods=['POST'])
def merge_players():
    """Merge duplicate global players. Keep target, transfer entries from source.
    Body: { target_id: int, source_ids: [int, ...] }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    target_id = data.get('target_id')
    source_ids = data.get('source_ids', [])

    if not target_id or not source_ids:
        return jsonify({'error': 'target_id and source_ids are required'}), 400

    target = db.session.get(GlobalPlayer, target_id)
    if not target:
        return jsonify({'error': 'Target player not found'}), 404

    transferred = 0
    deleted = 0
    for src_id in source_ids:
        if src_id == target_id:
            continue
        source = db.session.get(GlobalPlayer, src_id)
        if not source:
            continue

        # Transfer all tournament entries from source to target
        entries = Player.query.filter_by(global_player_id=src_id).all()
        for entry in entries:
            entry.global_player_id = target_id
            entry.first_name = target.first_name
            entry.last_name = target.last_name
            entry.name = target.full_name
            transferred += 1

        # Delete source global player
        db.session.delete(source)
        deleted += 1

    db.session.commit()
    logger.info("global_players_merged", target_id=target_id, source_ids=source_ids,
                transferred=transferred, deleted=deleted)
    return jsonify({
        'message': f'Merged {deleted} duplicates into ID {target_id}, transferred {transferred} entries',
        'target': target.to_dict(),
        'transferred': transferred,
        'deleted': deleted,
    })
