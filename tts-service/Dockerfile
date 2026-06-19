FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for soundfile, torch, and build tools
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    curl \
    espeak-ng \
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
# Separating this step ensures source code changes don't invalidate this layer
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --link-mode=copy

# Copy source code last
COPY main.py tts.py start.sh ./
RUN chmod +x start.sh

EXPOSE 8001

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/tmp/huggingface
# Ensure we use the virtualenv created by uv
ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
