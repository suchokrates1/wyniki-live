"""Admin API routes for global players management."""
import os
from flask import Blueprint, jsonify, request

from ..db_models import GlobalPlayer, Player, Tournament
from ..config import logger
from ..services.player_registry import create_tournament_player, find_or_create_global_player, split_player_name
from ..services.office_event_broker import emit_office_invalidation
from ..database import (
    add_row,
    counting_tournaments_of_global_player,
    entries_count_of_global_player,
    entries_named,
    entries_named_loosely,
    entries_of_global_player,
    entry_named_in_tournament,
    entry_of_global_player_in_tournament,
    global_player_by_name,
    global_player_count,
    global_players_with_surname,
    global_players_without_first_name,
    search_global_players,
    classifications,
    commit_writes,
    delete_row,
    flush_writes,
    forget_row,
    get_row,
    repeated_global_player_surnames,
    tournament_counts_for_players,
    tournament_players_grouped_by_name,
    write_session,
)

blueprint = Blueprint('admin_global_players', __name__, url_prefix='/admin/api/global-players')


@blueprint.after_request
def _emit_global_player_import_invalidation(response):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and response.status_code < 400:
        tournament_id = (request.view_args or {}).get("tid")
        if tournament_id is not None:
            emit_office_invalidation(int(tournament_id), ["players", "groups", "dashboard"])
    return response


def _entry_counts_for_stats(entry: Player) -> bool:
    if not entry.tournament:
        return True
    return entry.tournament.stats_enabled is None or int(entry.tournament.stats_enabled) == 1


@blueprint.route('', methods=['GET'])
def list_global_players():
    """List all global players with optional filters."""
    q = request.args.get('q', '').strip()
    gender = request.args.get('gender', '').strip()
    category = request.args.get('category', '').strip()
    country = request.args.get('country', '').strip()

    players = search_global_players(
        q,
        gender=(classifications.normalize_gender(gender) or gender) if gender else "",
        category=category,
        country=country,
    )
    player_ids = [player.id for player in players]
    tournament_counts = tournament_counts_for_players(player_ids)

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
        gender=classifications.normalize_gender(data.get('gender', '')),
        birth_date=data.get('birth_date', '').strip() or None,
        country=data.get('country', '').strip(),
        category=classifications.normalize_class(data.get('category', '')) or data.get('category', '').strip(),
        notes=data.get('notes', '').strip() or None,
    )
    add_row(gp)
    commit_writes()
    logger.info("global_player_created", id=gp.id, name=gp.full_name)
    return jsonify(gp.to_dict()), 201


@blueprint.route('/<int:gp_id>', methods=['GET'])
def get_global_player(gp_id: int):
    """Get a global player with career stats."""
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    d = gp.to_dict()

    # Tournament entries
    entries = entries_of_global_player(gp_id)
    d['tournament_entries'] = [{
        'id': e.id,
        'tournament_id': e.tournament_id,
        'tournament_name': e.tournament.name if e.tournament else '',
        'category': e.category or '',
    } for e in entries]
    d['tournaments_count'] = sum(1 for entry in entries if _entry_counts_for_stats(entry))

    return jsonify(d)


@blueprint.route('/<int:gp_id>', methods=['PUT'])
def update_global_player(gp_id: int):
    """Update a global player."""
    gp = get_row(GlobalPlayer, gp_id)
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
        gp.gender = classifications.normalize_gender(data['gender'])
    if 'birth_date' in data:
        gp.birth_date = data['birth_date'].strip() or None
    if 'country' in data:
        gp.country = data['country'].strip()
    new_class = None
    if 'category' in data:
        requested = data['category'].strip()
        code = classifications.normalize_class(requested)
        if code and code != classifications.normalize_class(gp.category):
            # a class change goes through the history (below), which also sets the category
            new_class = code
        elif not code:
            gp.category = requested
    if 'notes' in data:
        gp.notes = data['notes'].strip() or None

    commit_writes()
    if new_class:
        classifications.record_classification_change(
            gp_id,
            new_class,
            source='manual',
            effective_date=(data.get('classification_date') or '').strip() or None,
            status=data.get('classification_status') if data.get('classification_status') in classifications.STATUSES else 'confirmed',
            note=(data.get('classification_note') or '').strip(),
        )
        forget_row(gp)
    logger.info("global_player_updated", id=gp_id)
    return jsonify(gp.to_dict())


@blueprint.route('/<int:gp_id>/classifications', methods=['GET'])
def get_classification_history(gp_id: int):
    """The player's sport class history, oldest first."""
    if not get_row(GlobalPlayer, gp_id):
        return jsonify({'error': 'Player not found'}), 404
    return jsonify({'history': classifications.fetch_classification_history(gp_id)})


@blueprint.route('/tournaments/<int:tid>/classification-review', methods=['GET'])
def get_classification_review(tid: int):
    """Players of a tournament who played outside their sport class."""
    if not get_row(Tournament, tid):
        return jsonify({'error': 'Tournament not found'}), 404
    return jsonify(classifications.classification_review(tid))


@blueprint.route('/tournaments/<int:tid>/classification-review', methods=['POST'])
def apply_classification_review(tid: int):
    """Body: { decisions: [{ global_player_id, decision: reclassify|play_up|skip, classification? }] }"""
    if not get_row(Tournament, tid):
        return jsonify({'error': 'Tournament not found'}), 404
    data = request.get_json(silent=True) or {}
    decisions = data.get('decisions')
    if not isinstance(decisions, list) or not decisions:
        return jsonify({'error': 'decisions are required'}), 400
    result = classifications.apply_classification_decisions(tid, decisions)
    status = 200 if result['applied'] or not result['errors'] else 422
    return jsonify(result), status


@blueprint.route('/<int:gp_id>', methods=['DELETE'])
def delete_global_player(gp_id: int):
    """Delete a global player (only if no tournament entries)."""
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    entries_count = entries_count_of_global_player(gp_id)
    if entries_count > 0:
        return jsonify({
            'error': f'Cannot delete: player has {entries_count} tournament entries. Unlink them first.'
        }), 409

    delete_row(gp)
    commit_writes()
    classifications.delete_classifications(gp_id)
    logger.info("global_player_deleted", id=gp_id)
    return jsonify({'message': 'Player deleted'})


@blueprint.route('/<int:gp_id>/photo', methods=['POST'])
def upload_photo(gp_id: int):
    """Upload a player photo (resized to max 200x200)."""
    gp = get_row(GlobalPlayer, gp_id)
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

        photo = Image.open(file.stream).convert('RGB')
        photo.thumbnail((200, 200), Image.Resampling.LANCZOS)

        # Store in /data/photos/ (persistent volume), not in static/
        data_dir = os.path.dirname(settings.database_path)
        photos_dir = os.path.join(data_dir, 'photos')
        os.makedirs(photos_dir, exist_ok=True)

        filename = f'{gp_id}.jpg'
        filepath = os.path.join(photos_dir, filename)
        photo.save(filepath, 'JPEG', quality=85)

        gp.photo_url = f'/data/photos/{filename}'
        commit_writes()

        logger.info("global_player_photo_uploaded", id=gp_id)
        return jsonify({'photo_url': gp.photo_url})
    except Exception as e:
        logger.error("photo_upload_error", id=gp_id, error=str(e))
        return jsonify({'error': f'Failed to process image: {str(e)}'}), 500


@blueprint.route('/<int:gp_id>/photo', methods=['DELETE'])
def delete_photo(gp_id: int):
    """Delete a player photo."""
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({'error': 'Player not found'}), 404

    if gp.photo_url:
        from ..config import settings
        data_dir = os.path.dirname(settings.database_path)
        filepath = os.path.join(data_dir, 'photos', f'{gp_id}.jpg')
        if os.path.exists(filepath):
            os.remove(filepath)
        gp.photo_url = None
        commit_writes()

    return jsonify({'message': 'Photo deleted'})


@blueprint.route('/migrate', methods=['POST'])
def migrate_existing_players():
    """One-time migration: create GlobalPlayer records from existing players.
    Groups by first_name+last_name, creates global records, links players."""
    # Check if already migrated
    existing = global_player_count()
    if existing > 0:
        return jsonify({'message': f'Already migrated ({existing} global players exist)', 'count': existing})

    # Group existing players by first_name + last_name
    groups = tournament_players_grouped_by_name()

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
        add_row(gp)
        flush_writes()  # get gp.id

        # Link all matching players
        matching = entries_named(fn, ln)
        for p in matching:
            p.global_player_id = gp.id
            linked += 1

        created += 1

    # Also delete the test player entries
    test_players = entries_named_loosely('dawid', 'suchodolski')
    for tp in test_players:
        delete_row(tp)

    commit_writes()
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
    tournament = get_row(Tournament, tid)
    if not tournament:
        return jsonify({'error': 'Tournament not found'}), 404
    if int(tournament.active or 0) != 1:
        return jsonify({'error': 'Tournament is inactive'}), 409

    data = request.get_json(silent=True) or {}
    gp_id = data.get('global_player_id')
    if not gp_id:
        return jsonify({'error': 'global_player_id is required'}), 400

    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({'error': 'Global player not found'}), 404

    # Check if already registered
    existing = entry_of_global_player_in_tournament(tid, gp_id)
    if existing:
        return jsonify({'error': 'Player already in this tournament'}), 409

    category = data.get('category', '').strip() or gp.category or ''

    p = create_tournament_player(
        write_session(),
        tournament_id=tid,
        name=gp.full_name,
        first_name=gp.first_name,
        last_name=gp.last_name,
        gender=gp.gender or '',
        category=category,
        country=gp.country or '',
        global_player=gp,
    )
    commit_writes()

    logger.info("global_player_added_to_tournament", gp_id=gp_id, tournament_id=tid, player_id=p.id)
    return jsonify(p.to_dict()), 201


@blueprint.route('/tournaments/<int:tid>/import-file', methods=['POST'])
def import_file_to_tournament(tid: int):
    """Import players from text — auto-match to global_players or create new.
    Body: { text: "First Last Category Country\\n..." }
    """
    from ..db_models import Tournament
    tournament = get_row(Tournament, tid)
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

        gp = None
        if int(tournament.is_simulation or 0) != 1:
            gp_exists = global_player_by_name(fn, ln)
            gp = find_or_create_global_player(write_session(), fn, ln, category, country)
            if not gp:
                continue
            if gp_exists:
                matched_global += 1
            else:
                created_global += 1

            existing = entry_of_global_player_in_tournament(tid, gp.id)
            if existing:
                continue
        else:
            existing = entry_named_in_tournament(tid, fn, ln)
            if existing:
                continue

        create_tournament_player(
            write_session(),
            tournament_id=tid,
            name=name,
            first_name=fn,
            last_name=ln,
            gender=(gp.gender if gp else ''),
            category=category.strip() or ((gp.category or '') if gp else ''),
            country=country.strip() or ((gp.country or '') if gp else ''),
            global_player=gp,
        )
        added_tournament += 1

    commit_writes()
    return jsonify({
        'message': f'Imported {added_tournament} players ({matched_global} matched, {created_global} new)',
        'added': added_tournament,
        'matched_global': matched_global,
        'created_global': created_global,
    })


@blueprint.route('/duplicates', methods=['GET'])
def find_duplicates():
    """Find duplicate global players (same last_name or same first+last)."""

    # Find by same last_name
    dupes_by_lastname = repeated_global_player_surnames()

    result = []
    for ln, cnt in dupes_by_lastname:
        players = global_players_with_surname(ln)
        entries = []
        for gp in players:
            tournament_count = counting_tournaments_of_global_player(gp.id)
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

    players = global_players_without_first_name()

    result = []
    for gp in players:
        d = gp.to_dict()
        d['tournaments_count'] = counting_tournaments_of_global_player(gp.id)
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

    target = get_row(GlobalPlayer, target_id)
    if not target:
        return jsonify({'error': 'Target player not found'}), 404

    transferred = 0
    deleted = 0
    merged_ids = []
    for src_id in source_ids:
        if src_id == target_id:
            continue
        source = get_row(GlobalPlayer, src_id)
        if not source:
            continue

        # Transfer all tournament entries from source to target
        entries = entries_of_global_player(src_id)
        for entry in entries:
            entry.global_player_id = target_id
            entry.first_name = target.first_name
            entry.last_name = target.last_name
            entry.name = target.full_name
            transferred += 1

        # Delete source global player
        delete_row(source)
        merged_ids.append(src_id)
        deleted += 1

    commit_writes()
    for src_id in merged_ids:
        classifications.move_classifications(src_id, target_id)
    logger.info("global_players_merged", target_id=target_id, source_ids=source_ids,
                transferred=transferred, deleted=deleted)
    return jsonify({
        'message': f'Merged {deleted} duplicates into ID {target_id}, transferred {transferred} entries',
        'target': target.to_dict(),
        'transferred': transferred,
        'deleted': deleted,
    })
