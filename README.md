# Baron von Reading

A self-hosted, password-protected ebook reader with custom text-to-speech narration powered by [XTTS](https://github.com/coqui-ai/TTS). Built for a home server.

## Features

- 📚 Upload and read **TXT, PDF, and EPUB** files in the browser
- 🗣️ **Text-to-speech** using a locally-run XTTS model (custom voice cloning, natural prosody)
- 📖 **Per-sentence reading progress** — resume exactly where you left off, per user
- 🔤 **Phonetic dictionary** — override how specific words are pronounced
- ⚙️ **Per-user settings** (reading speed, voice, theme, font size) stored server-side
- 📤 **Import/export settings** as a JSON file
- 🔐 **Multi-user** with password-based authentication (JWT)
- 🐳 Fully containerised with Docker Compose

## Stack

| Layer | Tech |
|---|---|
| Frontend | SolidJS + TypeScript (Vite, Bun) |
| Backend | Bun (TypeScript) REST API |
| TTS Service | Python + FastAPI + XTTS |
| Database | SQLite (`bun:sqlite`) |
| Auth | JWT + bcrypt |
| Runtime | Docker + Docker Compose |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- (For local dev without Docker) [Bun](https://bun.sh/) and [uv](https://github.com/astral-sh/uv)

### Run with Docker

```bash
git clone <repo-url>
cd baron-von-reading
docker compose up --build
```

The app will be available at `http://localhost:5173`.

> **First run:** The XTTS model downloads automatically on first startup (~2 GB). This takes a few minutes. Subsequent starts are fast.

### Local Development

```bash
# Terminal 1 — Frontend (hot reload)
cd frontend && bun install && bun run dev

# Terminal 2 — Backend
cd backend && bun install && bun run dev

# Terminal 3 — TTS service
cd tts-service && uv sync && uv run uvicorn main:app --reload --port 8001
```

## Project Structure

```
frontend/       SolidJS + TypeScript web app
backend/        Bun TypeScript REST API + SQLite
tts-service/    Python FastAPI + XTTS synthesis
docker-compose.yml
```

See [AGENTS.md](./AGENTS.md) for the full architecture, patterns, and contribution guide.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | (required) | Secret used to sign JWTs — set in `docker-compose.yml` or `.env` |
| `TTS_SERVICE_URL` | `http://tts-service:8001` | Internal URL for the TTS service (Docker network) |
| `DATA_DIR` | `/app/data` | Where uploaded book files are stored |

## Backup

Mount `backend/db.sqlite` and `backend/data/` as Docker volumes. Back up those two paths to preserve all users, progress, settings, and books.

## License

MIT
