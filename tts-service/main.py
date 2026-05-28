"""FastAPI entry point for the Baron von Reading TTS service."""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from tts import synthesize, get_status, ensure_model_loaded

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("API")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload model on startup to avoid first-request delay
    logger.info("Preloading model during startup...")
    asyncio.create_task(ensure_model_loaded())
    yield

app = FastAPI(title="Baron TTS Service", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str
    speed: float = 1.0
    speaker_wav: str | None = None


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/status")
async def status_endpoint() -> dict:
    """Return model loading status."""
    return get_status()


@app.post("/synthesize")
async def synthesize_endpoint(req: SynthesizeRequest) -> StreamingResponse:
    """Synthesize speech and stream back WAV audio."""
    try:
        logger.info(f"Received synthesis request: '{req.text[:20]}...' voice={req.speaker_wav} speed={req.speed}")
        audio_bytes = await synthesize(req.text, req.speed, req.speaker_wav)

        def _iter() -> bytes:  # type: ignore[return]
            yield audio_bytes

        return StreamingResponse(
            _iter(),
            media_type="audio/wav",
        )
    except Exception as e:
        logger.error(f"Endpoint error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)}
        )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )
