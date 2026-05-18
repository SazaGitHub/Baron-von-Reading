#!/bin/bash
# Auto-accept XTTS license
echo "y" | python -c "from TTS.api import TTS; print('License accepted')" 2>/dev/null || true
# Start the server
exec uv run uvicorn main:app --host 0.0.0.0 --port 8001
