"""Kokoro TTS synthesis wrapper. Model loaded on first request."""

import asyncio
import os
from pathlib import Path
import io
import time

import requests
import soundfile as sf
from kokoro_onnx import Kokoro

# Model is loaded lazily on first request, not at module import time.
_kokoro: Kokoro | None = None
_is_loading = False
_download_progress = 0

MODEL_DIR = Path("/tmp/tts_models/kokoro")
MODEL_PATH = MODEL_DIR / "kokoro-v1.0.onnx"
VOICES_PATH = MODEL_DIR / "voices-v1.0.bin"

# URLs for model and voices (v1.0)
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

def get_status() -> dict:
    """Return the current status of the model."""
    global _kokoro, _is_loading, _download_progress
    if _kokoro is not None:
        return {"status": "ready", "progress": 100}
    
    if _is_loading:
        return {"status": "downloading", "progress": _download_progress}
    
    if not MODEL_PATH.exists() or not VOICES_PATH.exists():
        return {"status": "not_started", "progress": 0}

    return {"status": "ready", "progress": 100}

def _download_file(url: str, dest: Path):
    global _download_progress
    print(f"[TTS] Downloading {url} to {dest}...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    
    response = requests.get(url, stream=True)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0
    
    with open(dest, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    _download_progress = int((downloaded / total_size) * 100)

async def _ensure_model_loaded() -> Kokoro:
    """Load Kokoro model if not already loaded."""
    global _kokoro, _is_loading, _download_progress
    if _kokoro is None:
        _is_loading = True
        try:
            if not MODEL_PATH.exists():
                _download_progress = 0
                await asyncio.get_event_loop().run_in_executor(None, _download_file, MODEL_URL, MODEL_PATH)
            if not VOICES_PATH.exists():
                _download_progress = 0
                await asyncio.get_event_loop().run_in_executor(None, _download_file, VOICES_URL, VOICES_PATH)
            
            print(f"[TTS] Loading Kokoro model from {MODEL_PATH}")
            # Ensure we are using the right execution providers
            # onnxruntime-gpu should pick up CUDA if available
            _kokoro = Kokoro(str(MODEL_PATH), str(VOICES_PATH))
            print(f"[TTS] Kokoro model loaded successfully")
        except Exception as e:
            print(f"[TTS] Error loading Kokoro model: {e}")
            raise e
        finally:
            _is_loading = False
    return _kokoro


async def synthesize(text: str, speed: float, speaker: str | None = None) -> bytes:
    """Return raw WAV bytes for the given text at the requested speed."""
    try:
        kokoro = await _ensure_model_loaded()

        # Kokoro uses voice names like 'af_heart', 'am_adam', etc.
        voice = speaker if speaker else "af_sarah"
        
        # Determine language from voice prefix
        # a: American English, b: British English, j: Japanese, z: Chinese,
        # e: Spanish, f: French, h: Hindi, i: Italian, p: Portuguese
        lang_map = {
            'a': 'en-us',
            'b': 'en-gb',
            'j': 'ja',
            'z': 'zh',
            'e': 'es',
            'f': 'fr-fr',
            'h': 'hi',
            'i': 'it',
            'p': 'pt-br'
        }
        lang = lang_map.get(voice[0], 'en-us') if voice else 'en-us'
        
        print(f"[TTS] Synthesizing: '{text[:50]}...' with voice {voice} ({lang}) at speed {speed}")
        
        start_time = time.time()
        samples, sample_rate = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: kokoro.create(
                text,
                voice=voice,
                speed=speed,
                lang=lang
            )
        )
        end_time = time.time()
        print(f"[TTS] Synthesis completed in {end_time - start_time:.2f}s")

        # Convert to WAV bytes in memory
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        return buffer.getvalue()
    except Exception as e:
        print(f"[TTS] Synthesis error: {e}")
        raise e
