"""Administrator session issuance endpoint."""
from flask import Blueprint

from ..services.api_auth import admin_login_response

blueprint = Blueprint("admin_auth", __name__, url_prefix="/admin/api")


@blueprint.route("/auth", methods=["POST"])
def admin_auth():
    return admin_login_response()
