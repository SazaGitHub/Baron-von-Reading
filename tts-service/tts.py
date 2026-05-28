"""Qwen TTS synthesis wrapper. Model loaded on startup."""

import asyncio
import io
import time
import os
import logging
from pathlib import Path

import torch
import soundfile as sf
import librosa
import numpy as np
from qwen_tts import Qwen3TTSModel

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TTS")

# Model is loaded lazily on first request or via explicit preload
_model: Qwen3TTSModel | None = None
_is_loading = False
_load_start_time = 0

# Use CustomVoice variant for preset speakers like Ryan/Aiden
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"

def get_status() -> dict:
    """Return the current status of the model."""
    global _model, _is_loading
    if _model is not None:
        return {"status": "ready", "progress": 100}
    
    if _is_loading:
        elapsed = time.time() - _load_start_time
        # Fake progress for user feedback
        progress = min(95, int((elapsed / 60) * 100)) 
        return {"status": "downloading", "progress": progress}
    
    return {"status": "not_started", "progress": 0}

async def ensure_model_loaded() -> Qwen3TTSModel:
    """Load Qwen model if not already loaded."""
    global _model, _is_loading, _load_start_time
    if _model is None:
        if _is_loading:
            # Wait for already in-progress load
            while _is_loading:
                await asyncio.sleep(1)
            return _model

        _is_loading = True
        _load_start_time = time.time()
        try:
            logger.info(f"Loading Qwen model: {MODEL_ID}")
            # Use GPU if available, else CPU
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            # Use float32 on CPU for compatibility and stability
            dtype = torch.bfloat16 if device == "cuda" else torch.float32
            
            load_kwargs = {
                "dtype": dtype,
                "trust_remote_code": True
            }
            if device == "cuda":
                load_kwargs["device_map"] = "auto"
            else:
                # On CPU, avoid device_map to prevent meta-tensor copying issues
                load_kwargs["device_map"] = None

            def _load():
                return Qwen3TTSModel.from_pretrained(
                    MODEL_ID,
                    **load_kwargs
                )

            _model = await asyncio.get_event_loop().run_in_executor(None, _load)
            
            logger.info(f"Qwen model loaded successfully on {device} in {time.time() - _load_start_time:.2f}s")
        except Exception as e:
            logger.error(f"Error loading Qwen model: {e}", exc_info=True)
            raise e
        finally:
            _is_loading = False
    return _model


# Global lock for synthesis
_lock = asyncio.Lock()

async def synthesize(text: str, speed: float, speaker: str | None = None) -> bytes:
    """Return raw WAV bytes for the given text at the requested speed."""
    async with _lock:
        try:
            model = await ensure_model_loaded()

            # Default speaker for Qwen3-TTS-0.6B-CustomVoice
            # Ryan/Aiden are recommended for English.
            voice = speaker if speaker else "Ryan"
            
            logger.info(f"Synthesizing: '{text[:50]}...' with voice {voice}")
            
            start_time = time.time()
            
            # Qwen3-TTS generate call
            def _generate():
                with torch.no_grad():
                    # Qwen3-TTS generate returns (wavs, sr)
                    return model.generate_custom_voice(
                        text=text,
                        language="English",
                        speaker=voice
                    )

            wavs, sr = await asyncio.get_event_loop().run_in_executor(None, _generate)
            
            audio = wavs[0]
            
            # Time stretch if speed is not 1.0
            if abs(speed - 1.0) > 0.01:
                logger.info(f"Applying time stretch: {speed}x")
                # librosa expects numpy array
                if torch.is_tensor(audio):
                    audio = audio.cpu().numpy()
                
                # librosa.effects.time_stretch(y, *, rate, ...)
                audio = librosa.effects.time_stretch(audio, rate=speed)
            
            end_time = time.time()
            logger.info(f"Synthesis completed in {end_time - start_time:.2f}s")

            # Convert to WAV bytes in memory
            buffer = io.BytesIO()
            sf.write(buffer, audio, sr, format='WAV')
            return buffer.getvalue()
        except Exception as e:
            logger.error(f"Synthesis error: {e}", exc_info=True)
            raise e
