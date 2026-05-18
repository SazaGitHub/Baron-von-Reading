FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
COPY main.py tts.py ./
COPY start.sh ./
RUN uv sync --no-dev && chmod +x start.sh
EXPOSE 8001
ENV TTS_HOME=/tmp/tts_models
CMD ["./start.sh"]
