#!/bin/bash
export TTS_HOME=/tmp/tts_models
export MODEL_DIR=/tmp/tts_models/qwen

# Create model directory
mkdir -p $MODEL_DIR

# Start the server
echo "Starting Qwen TTS server..."
exec ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
