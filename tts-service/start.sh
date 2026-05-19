#!/bin/bash
# Set environment to auto-accept XTTS license
export TTS_HOME=/tmp/tts_models
export TTS_MODEL_CACHE=/tmp/tts_models

# Trap stdin to auto-accept prompts
(echo "y"; sleep 30) | python -c "
from TTS.api import TTS
print('Pre-loading XTTS model...')
try:
    TTS('tts_models/multilingual/multi-dataset/xtts_v2')
    print('Model loaded successfully')
except Exception as e:
    print(f'Warning: Pre-load failed (will try at runtime): {e}')
" 2>/dev/null || true

# Start the server
exec uv run uvicorn main:app --host 0.0.0.0 --port 8001
