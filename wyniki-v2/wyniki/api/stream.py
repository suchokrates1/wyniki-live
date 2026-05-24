"""SSE Stream endpoints."""
from flask import Blueprint, Response, stream_with_context
import json

from ..services.event_broker import event_broker
from ..services.court_manager import serialize_public_snapshot
from ..config import logger

blueprint = Blueprint('stream', __name__, url_prefix='/api')


@blueprint.route('/stream')
def event_stream():
    """Server-Sent Events stream for real-time updates."""
    def generate():
        listener = event_broker.listen()
        try:
            # Send initial snapshot
            snapshot = serialize_public_snapshot()
            for kort_id, state in snapshot.items():
                payload = json.dumps({"court_id": kort_id, **state})
                yield f"event: court_update\ndata: {payload}\n\n"
            
            # Stream updates
            while True:
                try:
                    event = listener.get(timeout=30)  # 30s timeout for heartbeat
                    kort_id = event.get("kort_id", "")
                    state = event.get("data", {})
                    payload = json.dumps({"court_id": kort_id, **state})
                    yield f"event: court_update\ndata: {payload}\n\n"
                except:
                    # Send heartbeat
                    yield f": heartbeat\n\n"
        except GeneratorExit:
            logger.info("Client disconnected from SSE stream")
        finally:
            event_broker.discard(listener)
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )

