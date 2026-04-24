"""SQLAlchemy models for database."""
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class GlobalPlayer(db.Model):
    """Universal player — one record per real person, across all tournaments."""
    __tablename__ = 'global_players'

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False, default='')
    last_name = db.Column(db.String(100), nullable=False, default='')
    gender = db.Column(db.String(1), nullable=True, default='')
    birth_date = db.Column(db.String(10), nullable=True)  # YYYY-MM-DD
    country = db.Column(db.String(10), nullable=True, default='')
    category = db.Column(db.String(100), nullable=True, default='')
    photo_url = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())

    # Relationships
    tournament_entries = db.relationship('Player', back_populates='global_player', lazy='dynamic')

    @property
    def full_name(self) -> str:
        fn = (self.first_name or '').strip()
        ln = (self.last_name or '').strip()
        if fn and ln:
            return f"{fn} {ln}"
        return ln or fn or ''

    @property
    def age(self):
        if not self.birth_date:
            return None
        try:
            bd = date.fromisoformat(self.birth_date)
            today = date.today()
            return today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        except (ValueError, TypeError):
            return None

    def to_dict(self):
        return {
            'id': self.id,
            'first_name': self.first_name or '',
            'last_name': self.last_name or '',
            'full_name': self.full_name,
            'gender': self.gender or '',
            'birth_date': self.birth_date or '',
            'age': self.age,
            'country': (self.country or '').upper(),
            'category': self.category or '',
            'photo_url': self.photo_url or '',
            'notes': self.notes or '',
            'created_at': self.created_at,
        }


class Tournament(db.Model):
    """Tournament model."""
    __tablename__ = 'tournaments'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    start_date = db.Column(db.String(50), nullable=False)
    end_date = db.Column(db.String(50), nullable=False)
    active = db.Column(db.Integer, default=0)
    location = db.Column(db.String(200), nullable=True, default='')
    city = db.Column(db.String(200), nullable=True, default='')
    country = db.Column(db.String(50), nullable=True, default='')
    logo_path = db.Column(db.String(500), nullable=True)
    report_email = db.Column(db.String(255), nullable=True, default='')
    summary_sent_at = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    players = db.relationship('Player', back_populates='tournament', cascade='all, delete-orphan')
    courts = db.relationship('Court', back_populates='tournament', lazy='dynamic')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'active': self.active,
            'location': self.location or '',
            'city': self.city or '',
            'country': self.country or '',
            'logo_path': self.logo_path,
            'report_email': self.report_email or '',
            'summary_sent_at': self.summary_sent_at,
            'court_count': self.courts.count() if self.courts is not None else 0,
            'created_at': self.created_at
        }


class Player(db.Model):
    """Player model — tournament entry linked to a GlobalPlayer."""
    __tablename__ = 'players'
    
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id', ondelete='CASCADE'), nullable=False)
    global_player_id = db.Column(db.Integer, db.ForeignKey('global_players.id', ondelete='SET NULL'), nullable=True)
    name = db.Column(db.String(200), nullable=False)  # legacy: full name
    first_name = db.Column(db.String(100), nullable=True, default='')  # imię
    last_name = db.Column(db.String(100), nullable=True, default='')   # nazwisko
    gender = db.Column(db.String(1), nullable=True, default='')  # M or F
    category = db.Column(db.String(100))
    country = db.Column(db.String(10))
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    tournament = db.relationship('Tournament', back_populates='players')
    global_player = db.relationship('GlobalPlayer', back_populates='tournament_entries')
    
    @property
    def full_name(self) -> str:
        """Return 'first_name last_name', fallback to name."""
        fn = (self.first_name or '').strip()
        ln = (self.last_name or '').strip()
        if fn and ln:
            return f"{fn} {ln}"
        if ln:
            return ln
        if fn:
            return fn
        return self.name or ''
    
    def to_dict(self):
        return {
            'id': self.id,
            'tournament_id': self.tournament_id,
            'global_player_id': self.global_player_id,
            'name': self.full_name,
            'first_name': self.first_name or '',
            'last_name': self.last_name or '',
            'gender': self.gender or '',
            'category': self.category,
            'country': self.country,
            'created_at': self.created_at
        }


class Court(db.Model):
    """Court model."""
    __tablename__ = 'courts'
    
    kort_id = db.Column(db.String(50), primary_key=True)
    pin = db.Column(db.String(10))
    name = db.Column(db.String(200), nullable=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id', ondelete='SET NULL'), nullable=True)
    display_order = db.Column(db.Integer, default=0)
    active = db.Column(db.Integer, default=1)

    tournament = db.relationship('Tournament', back_populates='courts')
    
    def to_dict(self):
        return {
            'kort_id': self.kort_id,
            'pin': self.pin,
            'name': self.name or self.kort_id,
            'tournament_id': self.tournament_id,
            'display_order': self.display_order,
            'tournament_name': self.tournament.name if self.tournament else None,
            'active': self.active
        }


class MatchHistory(db.Model):
    """Match history model."""
    __tablename__ = 'match_history'
    
    id = db.Column(db.Integer, primary_key=True)
    kort_id = db.Column(db.String(50), nullable=False)
    ended_ts = db.Column(db.String(50), nullable=False)
    duration_seconds = db.Column(db.Integer, nullable=False)
    player_a = db.Column(db.String(200))
    player_b = db.Column(db.String(200))
    score_a = db.Column(db.String(50))
    score_b = db.Column(db.String(50))
    category = db.Column(db.String(100))
    phase = db.Column(db.String(100), default='Grupowa')
    match_id = db.Column(db.Integer, nullable=True)
    stats_mode = db.Column(db.String(20), nullable=True)
    sets_history = db.Column(db.Text, nullable=True)
    tournament_id = db.Column(db.Integer, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'kort_id': self.kort_id,
            'ended_ts': self.ended_ts,
            'duration_seconds': self.duration_seconds,
            'player_a': self.player_a,
            'player_b': self.player_b,
            'score_a': self.score_a,
            'score_b': self.score_b,
            'category': self.category,
            'phase': self.phase
        }


class Match(db.Model):
    """Active match model from Umpire app."""
    __tablename__ = 'matches'
    
    id = db.Column(db.Integer, primary_key=True)
    court_id = db.Column(db.String(50), nullable=False)
    player1_name = db.Column(db.String(200), nullable=False)
    player2_name = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='in_progress')
    
    tournament_id = db.Column(db.Integer, nullable=True)
    bracket_group_id = db.Column(db.Integer, nullable=True)
    phase = db.Column(db.String(50), nullable=True)
    
    # Score data stored as JSON strings
    player1_sets = db.Column(db.Integer, default=0)
    player2_sets = db.Column(db.Integer, default=0)
    player1_games = db.Column(db.Integer, default=0)
    player2_games = db.Column(db.Integer, default=0)
    player1_points = db.Column(db.Integer, default=0)
    player2_points = db.Column(db.Integer, default=0)
    
    sets_history = db.Column(db.Text)  # JSON string
    
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    updated_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat(), onupdate=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    statistics = db.relationship('MatchStatistics', back_populates='match', uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self, bracket_warning=None):
        import json
        result = {
            'id': self.id,
            'court_id': self.court_id,
            'player1_name': self.player1_name,
            'player2_name': self.player2_name,
            'score': {
                'player1_sets': self.player1_sets,
                'player2_sets': self.player2_sets,
                'player1_games': self.player1_games,
                'player2_games': self.player2_games,
                'player1_points': self.player1_points,
                'player2_points': self.player2_points,
                'sets_history': json.loads(self.sets_history) if self.sets_history else []
            },
            'status': self.status,
            'tournament_id': self.tournament_id,
            'bracket_group_id': self.bracket_group_id,
            'phase': self.phase,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
        if bracket_warning:
            result['bracket_warning'] = bracket_warning
        return result


class MatchStatistics(db.Model):
    """Match statistics model."""
    __tablename__ = 'match_statistics'
    
    id = db.Column(db.Integer, primary_key=True)
    match_id = db.Column(db.Integer, db.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False, unique=True)
    
    # Player 1 stats
    player1_aces = db.Column(db.Integer, default=0)
    player1_double_faults = db.Column(db.Integer, default=0)
    player1_winners = db.Column(db.Integer, default=0)
    player1_forced_errors = db.Column(db.Integer, default=0)
    player1_unforced_errors = db.Column(db.Integer, default=0)
    player1_first_serves = db.Column(db.Integer, default=0)
    player1_first_serves_in = db.Column(db.Integer, default=0)
    player1_first_serve_percentage = db.Column(db.Float, default=0.0)
    
    # Player 2 stats
    player2_aces = db.Column(db.Integer, default=0)
    player2_double_faults = db.Column(db.Integer, default=0)
    player2_winners = db.Column(db.Integer, default=0)
    player2_forced_errors = db.Column(db.Integer, default=0)
    player2_unforced_errors = db.Column(db.Integer, default=0)
    player2_first_serves = db.Column(db.Integer, default=0)
    player2_first_serves_in = db.Column(db.Integer, default=0)
    player2_first_serve_percentage = db.Column(db.Float, default=0.0)
    
    match_duration_ms = db.Column(db.BigInteger, default=0)
    winner = db.Column(db.String(200))
    stats_mode = db.Column(db.String(20))
    received_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    match = db.relationship('Match', back_populates='statistics')
    
    def to_dict(self):
        return {
            'match_id': self.match_id,
            'stats_mode': self.stats_mode,
            'player1_stats': {
                'aces': self.player1_aces,
                'double_faults': self.player1_double_faults,
                'winners': self.player1_winners,
                'forced_errors': self.player1_forced_errors,
                'unforced_errors': self.player1_unforced_errors,
                'first_serves': self.player1_first_serves,
                'first_serves_in': self.player1_first_serves_in,
                'first_serve_percentage': self.player1_first_serve_percentage
            },
            'player2_stats': {
                'aces': self.player2_aces,
                'double_faults': self.player2_double_faults,
                'winners': self.player2_winners,
                'forced_errors': self.player2_forced_errors,
                'unforced_errors': self.player2_unforced_errors,
                'first_serves': self.player2_first_serves,
                'first_serves_in': self.player2_first_serves_in,
                'first_serve_percentage': self.player2_first_serve_percentage
            },
            'match_duration_ms': self.match_duration_ms,
            'winner': self.winner,
            'received_at': self.received_at
        }
