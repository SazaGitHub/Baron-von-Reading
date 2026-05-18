"""XTTS synthesis wrapper. Loaded once at module level; serialised via asyncio.Lock."""

import asyncio
import tempfile
from pathlib import Path

from TTS.api import TTS  # type: ignore[import-untyped]

# Load model once — this is expensive (10-30 s) but must not be repeated per request.
_tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

# Serialize concurrent requests; XTTS is not thread-safe.
_lock = asyncio.Lock()


async def synthesize(text: str, speed: float) -> bytes:
    """Return raw WAV bytes for the given text at the requested speed."""
    async with _lock:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _tts.tts_to_file(
                text=text,
                file_path=tmp_path,
                speed=speed,
                language="en",
            ),
        )

        data = Path(tmp_path).read_bytes()
        Path(tmp_path).unlink(missing_ok=True)
        return data
