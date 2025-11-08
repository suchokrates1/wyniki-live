"""SSE Stream endpoints."""
from flask import Blueprint, Response, stream_with_context
import json
import time

blueprint = Blueprint('stream', __name__, url_prefix='/api')


@blueprint.route('/stream')
def event_stream():
    """Server-Sent Events stream for real-time updates."""
    def generate():
        while True:
            # TODO: Implement real event streaming
            data = {
                "courts": {
                    "1": {
                        "A": {"full_name": "Player A", "points": "0"},
                        "B": {"full_name": "Player B", "points": "0"},
                        "match_status": {"active": False}
                    }
                }
            }
            yield f"data: {json.dumps(data)}\n\n"
            time.sleep(5)
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )
