#!/bin/bash
curl -s -m 10 -X POST http://127.0.0.1:8088/api/events \
  -H "Content-Type: application/json" \
  -d @/tmp/test_event.json
echo ""
echo "Exit code: $?"
