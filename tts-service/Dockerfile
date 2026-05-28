FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for soundfile, torch, and build tools
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    curl \
    libsndfile1 \
    libgomp1 \
    sox \
    libsox-dev \
    gcc \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install uv

COPY pyproject.toml ./

# Install dependencies using uv
# We use --link-mode=copy to avoid hardlink issues in some docker environments
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --link-mode=copy

COPY main.py tts.py ./
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 8001

ENV TTS_HOME=/tmp/tts_models
ENV PYTHONUNBUFFERED=1
# Ensure transformers uses the right cache directory
ENV HF_HOME=/tmp/huggingface

CMD ["./start.sh"]
