"""The walls every organizer blueprint shares, so a new route cannot forget them.

Before a request: a live session, and when the route names a series or a tournament,
that it is one of the person's series. After a change: a line in the change log.
"""
from __future__ import annotations

from flask import Blueprint, g, request

from ..database.series_records import record
from ..services import organizer_auth as auth

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _payload() -> dict:
    if request.is_json:
        body = request.get_json(silent=True)
        return body if isinstance(body, dict) else {"items": body}
    return request.form.to_dict()


def guarded_blueprint(name: str, url_prefix: str, *, open_endpoints: frozenset[str] = frozenset(),
                      unpaid_writes: frozenset[str] = frozenset()) -> Blueprint:
    """unpaid_writes: changes still allowed after the subscription ended (the person's own settings)."""
    blueprint = Blueprint(name, __name__, url_prefix=url_prefix)

    @blueprint.before_request
    def guard():
        if request.endpoint in open_endpoints:
            return None
        denied = auth.require_organizer()
        if denied:
            return denied
        args = request.view_args or {}
        if "series_id" in args:
            denied = auth.require_series(args["series_id"])
            if denied:
                return denied
        if "tournament_id" in args:
            denied = auth.require_series_tournament(args["tournament_id"])
            if denied:
                return denied
        if request.method in MUTATING and request.endpoint not in unpaid_writes:
            return auth.require_paid_up(args.get("series_id"), args.get("tournament_id"))
        return None

    @blueprint.after_request
    def log_change(response):
        account = getattr(g, "account", None)
        if account and request.method in MUTATING and response.status_code < 400 and request.endpoint not in open_endpoints:
            args = request.view_args or {}
            detail = {**{key: value for key, value in args.items() if key != "tournament_id"}, **_payload()}
            record(account, request.endpoint.split(".")[-1], args.get("tournament_id") or g.get("audit_tournament_id"), detail)
        return response

    return blueprint
