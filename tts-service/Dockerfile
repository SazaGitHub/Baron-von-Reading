FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for soundfile and onnxruntime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    curl \
    libsndfile1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install uv

COPY pyproject.toml ./

# Install dependencies using uv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

COPY main.py tts.py ./
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 8001

ENV TTS_HOME=/tmp/tts_models
ENV PYTHONUNBUFFERED=1

CMD ["./start.sh"]
