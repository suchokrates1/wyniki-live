"""A visitor's report that something on a public profile is wrong (the desk marks it done)."""
from __future__ import annotations

from .db_models import db, utc_now_iso


class ProfileReport(db.Model):
    """A visitor says something on a public profile is wrong. The desk marks it done."""

    __tablename__ = 'profile_reports'

    id = db.Column(db.Integer, primary_key=True)
    global_player_id = db.Column(db.Integer, nullable=True)
    entry_id = db.Column(db.Integer, nullable=True)
    player_name = db.Column(db.String(200), nullable=False, default='')
    message = db.Column(db.Text, nullable=False, default='')
    status = db.Column(db.String(20), nullable=False, default='open')
    created_at = db.Column(db.String(50), default=utc_now_iso)

    def to_dict(self):
        return {
            'id': self.id,
            'global_player_id': self.global_player_id,
            'entry_id': self.entry_id,
            'player_name': self.player_name or '',
            'message': self.message or '',
            'status': self.status or 'open',
            'created_at': self.created_at or '',
        }
