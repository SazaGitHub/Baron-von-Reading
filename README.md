# 📖 Baron von Reading

A self-hosted, extremely fancy ebook reader with high-performance text-to-speech, tailored for a seamless home server experience.

## ✨ Features

- 📚 **Universal Library**: Upload and read **EPUB, PDF, and TXT** files directly in your browser.
- 🗣️ **Next-Gen TTS**: Powered by **Qwen-TTS (Qwen3-TTS-12Hz-0.6B)** for high-fidelity, natural speech. Supports custom voice timbres (Ryan, Aiden, Vivian, Serena).
- 🚀 **Zero Latency**: Aggressive prefetching and optimized inference ensure smooth, uninterrupted narration.
- 🎯 **Focus Tracking**: The window precisely centers the currently read sentence as you go.
- 🍦 **Fancy Themes**:
  - **Cream**: A soothing, lighter-than-air off-white (`#faf9f6`) for daylight reading.
  - **Blue**: The classic, professional slate blue dark mode.
  - **Amoled**: Pure pitch-black for OLED screens.
- 📖 **Per-User Progress**: Automatically saves your exact sentence position across sessions.
- 🔤 **Phonetic Dictionary**: Custom pronunciation overrides (e.g., "AI" → "Artificial Intelligence").
- 🔐 **Secure & Private**: Password-protected (JWT) with optional registration secrets.
- 🐳 **Optimized Docker**: BuildKit-powered multi-stage builds with aggressive caching for 20-second deployments.

## 🛠️ Stack

| Layer | Technology |
|---|---|
| **Frontend** | SolidJS + Vite (App Shell Architecture) |
| **Backend** | Bun (TypeScript) + SQLite |
| **TTS Service** | Python + FastAPI + Qwen-TTS |
| **Container** | Docker + Docker Compose |

## 🚀 Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose.
- NVIDIA GPU (4GB+ VRAM recommended for Qwen-TTS).
- At least 8GB RAM (if running on CPU).

### Run with Docker
```bash
git clone https://github.com/SazaGitHub/Baron-von-Reading.git
cd Baron-von-Reading
docker-compose up --build -d
```
The app will be available at `http://localhost:3000`.

> **First Run**: Qwen models (~2.5GB) are downloaded and initialized automatically on startup. This may take 2-5 minutes depending on your internet speed. Check the `tts-service` logs for progress.

## 📂 Project Structure

```text
├── backend/       # Bun API + Ebook Parsing Logic
├── frontend/      # SolidJS Web App
├── tts-service/   # Python TTS Synthesis (Qwen)
└── data/          # (Ignored) User databases and books
```

## ⚙️ Configuration

Set these in your `.env` file:
- `JWT_SECRET`: High-entropy string for session security.
- `REGISTRATION_SECRET`: (Optional) Required code for new account creation.

## 🛡️ Privacy & Backup

- All user data, books, and databases are strictly stored in `backend/data/` and are excluded from Git.
- To backup, simply save the `backend/data/` directory.

## 📜 License
MIT
