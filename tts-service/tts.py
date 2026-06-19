"""NeuTTS Nano synthesis wrapper. Model loaded on startup."""

import asyncio
import io
import time
import os
import logging
import re
from pathlib import Path

import torch
import soundfile as sf
import numpy as np
from neutts import NeuTTS

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TTS")

# Model is loaded lazily on first request or via explicit preload
_model: NeuTTS | None = None
_is_loading = False
_load_start_time = 0

# NeuTTS Nano configuration
MODEL_ID = "neuphonic/neutts-nano"
CODEC_ID = "neuphonic/neucodec"

def get_status() -> dict:
    """Return the current status of the model."""
    global _model, _is_loading
    if _model is not None:
        return {"status": "ready", "progress": 100}
    
    if _is_loading:
        elapsed = time.time() - _load_start_time
        # NeuTTS models are relatively small (~200MB)
        progress = min(95, int((elapsed / 45) * 100)) 
        return {"status": "downloading", "progress": progress}
    
    return {"status": "not_started", "progress": 0}

async def ensure_model_loaded() -> NeuTTS:
    """Load NeuTTS model if not already loaded."""
    global _model, _is_loading, _load_start_time
    if _model is None:
        if _is_loading:
            while _is_loading:
                await asyncio.sleep(1)
            return _model

        _is_loading = True
        _load_start_time = time.time()
        try:
            logger.info(f"Loading NeuTTS model: {MODEL_ID}")
            # NeuTTS Nano is designed for CPU but can use GPU
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            def _load():
                return NeuTTS(
                    backbone_repo=MODEL_ID,
                    backbone_device=device,
                    codec_repo=CODEC_ID,
                    codec_device=device
                )

            _model = await asyncio.get_event_loop().run_in_executor(None, _load)
            
            logger.info(f"NeuTTS model loaded successfully on {device} in {time.time() - _load_start_time:.2f}s")
        except Exception as e:
            logger.error(f"Error loading NeuTTS model: {e}", exc_info=True)
            raise e
        finally:
            _is_loading = False
    return _model


# Global semaphore for synthesis
# NeuTTS Nano is lightweight; allow limited concurrency if resources allow
_semaphore = asyncio.Semaphore(2)

# Sample voice data
VOICES = {
    "Jo": {"url": "https://github.com/neuphonic/neutts/raw/main/samples/jo.wav", "text": "This is a recording of a woman speaking."},
    "Dave": {"url": "https://github.com/neuphonic/neutts/raw/main/samples/dave.wav", "text": "This is a recording of a man speaking."},
    "Greta": {"url": "https://github.com/neuphonic/neutts/raw/main/samples/greta.wav", "text": "Dies ist eine Aufnahme einer Frau, die Deutsch spricht."},
    "Mateo": {"url": "https://github.com/neuphonic/neutts/raw/main/samples/mateo.wav", "text": "Esta es una grabación de un hombre hablando español."},
}

VOICE_DIR = Path("voices")
_voice_cache = {}

async def _get_voice_data(speaker: str, model: NeuTTS):
    """Download and encode voice reference if not cached."""
    speaker = speaker or "Jo"
    if speaker not in VOICES:
        logger.warning(f"Voice {speaker} not found, falling back to Jo")
        speaker = "Jo"
    
    if speaker in _voice_cache:
        return _voice_cache[speaker]
    
    VOICE_DIR.mkdir(exist_ok=True)
    voice_path = VOICE_DIR / f"{speaker.lower()}.wav"
    
    if not voice_path.exists():
        import requests
        logger.info(f"Downloading voice sample for {speaker}...")
        res = requests.get(VOICES[speaker]["url"])
        res.raise_for_status()
        voice_path.write_bytes(res.content)
    
    logger.info(f"Encoding reference for {speaker}...")
    def _encode():
        return model.encode_reference(str(voice_path))
    
    codes = await asyncio.get_event_loop().run_in_executor(None, _encode)
    _voice_cache[speaker] = (codes, VOICES[speaker]["text"])
    return _voice_cache[speaker]

async def synthesize(text: str, speed: float, speaker: str | None = None) -> bytes:
    """Return raw WAV bytes for the given text."""
    async with _semaphore:
        try:
            model = await ensure_model_loaded()
            
            # Get voice reference codes and text
            ref_codes, ref_text = await _get_voice_data(speaker, model)

            # Clean text - strip [H1] etc.
            text = re.sub(r'\[H[1-6]\]', '', text)
            text = text.strip()
            if not text:
                logger.warning("Empty text received for synthesis")
                raise ValueError("Synthesis text is empty")
            
            logger.info(f"Synthesizing ({len(text)} chars): '{text[:50]}...' (speaker={speaker})")
            
            start_time = time.time()
            
            def _generate():
                # Neuphonic NeuTTS uses .infer() method
                # Correct signature: infer(text, ref_codes, ref_text)
                audio_data = model.infer(text=text, ref_codes=ref_codes, ref_text=ref_text)
                sr = getattr(model, 'sample_rate', 24000)
                return audio_data, sr

            audio, sr = await asyncio.get_event_loop().run_in_executor(None, _generate)
            
            # Convert to WAV bytes in memory
            buffer = io.BytesIO()
            sf.write(buffer, audio, sr, format='WAV')
            
            end_time = time.time()
            logger.info(f"Synthesis completed in {end_time - start_time:.2f}s")
            return buffer.getvalue()
        except Exception as e:
            logger.error(f"Synthesis error: {e}", exc_info=True)
            raise e
