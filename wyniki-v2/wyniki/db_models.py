"""SQLAlchemy models for database."""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Tournament(db.Model):
    """Tournament model."""
    __tablename__ = 'tournaments'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    start_date = db.Column(db.String(50), nullable=False)
    end_date = db.Column(db.String(50), nullable=False)
    active = db.Column(db.Integer, default=0)
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    players = db.relationship('Player', back_populates='tournament', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'active': self.active,
            'created_at': self.created_at
        }


class Player(db.Model):
    """Player model."""
    __tablename__ = 'players'
    
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(100))
    country = db.Column(db.String(10))
    created_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    tournament = db.relationship('Tournament', back_populates='players')
    
    def to_dict(self):
        return {
            'id': self.id,
            'tournament_id': self.tournament_id,
            'name': self.name,
            'category': self.category,
            'country': self.country,
            'created_at': self.created_at
        }


class Court(db.Model):
    """Court model."""
    __tablename__ = 'courts'
    
    kort_id = db.Column(db.String(50), primary_key=True)
    overlay_id = db.Column(db.String(50))
    pin = db.Column(db.String(10))
    active = db.Column(db.Integer, default=1)
    
    def to_dict(self):
        return {
            'kort_id': self.kort_id,
            'overlay_id': self.overlay_id,
            'pin': self.pin,
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
    
    def to_dict(self):
        import json
        return {
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
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }


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
    received_at = db.Column(db.String(50), default=lambda: datetime.utcnow().isoformat())
    
    # Relationships
    match = db.relationship('Match', back_populates='statistics')
    
    def to_dict(self):
        return {
            'match_id': self.match_id,
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
