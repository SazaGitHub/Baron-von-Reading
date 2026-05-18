"""XTTS synthesis wrapper. Model loaded on first request; serialised via asyncio.Lock."""

import asyncio
import tempfile
from pathlib import Path

from TTS.api import TTS  # type: ignore[import-untyped]

# Model is loaded lazily on first request, not at module import time.
_tts: TTS | None = None

# Serialize concurrent requests; XTTS is not thread-safe.
_lock = asyncio.Lock()


async def _ensure_model_loaded() -> TTS:
    """Load XTTS model if not already loaded."""
    global _tts
    if _tts is None:
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    return _tts


async def synthesize(text: str, speed: float) -> bytes:
    """Return raw WAV bytes for the given text at the requested speed."""
    async with _lock:
        tts = await _ensure_model_loaded()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: tts.tts_to_file(
                text=text,
                file_path=tmp_path,
                speed=speed,
                language="en",
            ),
        )

        data = Path(tmp_path).read_bytes()
        Path(tmp_path).unlink(missing_ok=True)
        return data
