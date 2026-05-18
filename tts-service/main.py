"""FastAPI entry point for the Baron von Reading TTS service."""

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tts import synthesize

app = FastAPI(title="Baron TTS Service")


class SynthesizeRequest(BaseModel):
    text: str
    speed: float = 1.0
    speaker_wav: str | None = None


@app.post("/synthesize")
async def synthesize_endpoint(req: SynthesizeRequest) -> StreamingResponse:
    """Synthesize speech and stream back WAV audio."""
    audio_bytes = await synthesize(req.text, req.speed)

    def _iter() -> bytes:  # type: ignore[return]
        yield audio_bytes

    return StreamingResponse(
        _iter(),
        media_type="audio/wav",
    )
