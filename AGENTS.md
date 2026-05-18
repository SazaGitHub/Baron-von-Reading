You are an experienced, pragmatic software engineering AI agent. Do not over-engineer a solution when a simple one is possible. Keep edits minimal. If you want an exception to ANY rule, you MUST stop and get permission first.

# Baron von Reading — AGENTS.md

## Project Overview

**Baron von Reading** is a self-hosted, password-protected ebook reader web app with custom text-to-speech (TTS) narration. It runs on a home server via Docker.

### Goals
- Upload and read `txt`, `pdf`, and `epub` files in the browser.
- Generate speech from book text using a locally-run XTTS model (custom voice, natural prosody).
- Support a per-user **phonetic dictionary** (override pronunciations of specific words).
- Allow adjusting **reading speed** and other TTS settings.
- Track **reading progress per file per sentence** for each user.
- Save all user settings to SQLite (server-side, per-user) and allow import/export as a JSON file.
- Multi-user support with simple password-based authentication.

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | [SolidJS](https://www.solidjs.com/) + TypeScript, built with Vite (via Bun) |
| API Backend | Bun (TypeScript) — HTTP server for auth, file management, progress, settings |
| TTS Service | Python + [XTTS](https://github.com/coqui-ai/TTS) (Coqui TTS), served via FastAPI |
| Auth | JWT tokens, bcrypt-hashed passwords |
| Storage | SQLite (via Bun's built-in `bun:sqlite`) for users, progress, phonetic dictionaries, and settings |
| Containerization | Docker + Docker Compose |
| Python package manager | [uv](https://github.com/astral-sh/uv) |

---

## Repository Structure

```
/
├── frontend/          # SolidJS + TypeScript app
│   ├── src/
│   │   ├── components/   # UI components (Reader, Settings, FileList, etc.)
│   │   ├── pages/        # Route-level pages (Login, Library, Reader)
│   │   ├── stores/       # SolidJS signals/stores for global state
│   │   └── lib/          # Utility helpers (localStorage, API client, parsers)
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/           # Bun TypeScript API server
│   ├── src/
│   │   ├── routes/       # Route handlers (auth, books, progress, tts-proxy, settings)
│   │   ├── db/           # SQLite schema and query helpers
│   │   ├── middleware/   # Auth middleware (JWT verification)
│   │   └── lib/          # File parsers (pdf, epub, txt), helpers
│   ├── data/             # Uploaded book files (volume-mounted in Docker)
│   ├── db.sqlite         # SQLite database file (volume-mounted in Docker)
│   ├── tsconfig.json
│   └── package.json
│
├── tts-service/       # Python FastAPI + XTTS
│   ├── main.py           # FastAPI app entry point
│   ├── tts.py            # XTTS wrapper logic
│   ├── requirements.txt
│   └── pyproject.toml    # uv project manifest
│
├── docker-compose.yml
└── AGENTS.md
```

### Key Files

| File | Purpose |
|---|---|
| `backend/src/db/schema.ts` | SQLite table definitions (users, progress, phonetic_dict) |
| `backend/src/middleware/auth.ts` | JWT verification middleware — all protected routes use this |
| `backend/src/routes/tts-proxy.ts` | Forwards TTS requests to the Python service, streams audio back |
| `frontend/src/stores/settingsStore.ts` | Global SolidJS store; synced from/to backend settings API |
| `frontend/src/lib/api.ts` | Typed fetch wrapper for all backend calls |
| `tts-service/tts.py` | XTTS model loading and synthesis logic |
| `docker-compose.yml` | Wires all three services together |

---

## Essential Commands

All commands assume you are in the relevant subdirectory unless stated.

### Development

```bash
# Start all services (recommended for local dev)
docker compose up --build

# Frontend dev server only (hot reload)
cd frontend && bun run dev

# Backend dev server only
cd backend && bun run dev

# TTS service only
cd tts-service && uv run uvicorn main:app --reload --port 8001
```

### Build

```bash
# Frontend production build
cd frontend && bun run build

# Backend (Bun doesn't need a separate compile step; Docker handles it)

# Full production build via Docker
docker compose build
```

### Lint & Format

```bash
# Frontend + backend TypeScript
cd frontend && bun run lint        # eslint
cd frontend && bun run format      # prettier

cd backend && bun run lint
cd backend && bun run format

# Python TTS service
cd tts-service && uv run ruff check .
cd tts-service && uv run ruff format .
```

### Test

```bash
cd frontend && bun test
cd backend && bun test
cd tts-service && uv run pytest
```

### Clean

```bash
# Remove build artifacts
cd frontend && rm -rf dist
docker compose down --volumes   # also removes SQLite + uploaded files volumes
```

---

## Architecture

```
Browser
  │  (HTTPS on home server)
  ▼
frontend (SolidJS, port 5173 dev / Nginx in prod)
  │  REST + SSE
  ▼
backend (Bun, port 3000)
  │  JWT-protected routes
  ├── SQLite  (users, reading progress, phonetic dict)
  ├── /data/  (uploaded book files on disk)
  │
  │  Internal HTTP (not exposed externally)
  ▼
tts-service (FastAPI + XTTS, port 8001)
```

- The **backend** is the single external API. The TTS service is internal-only (not reachable from outside Docker).
- The **frontend** never calls the TTS service directly — always via the backend proxy.
- Audio is streamed back to the browser as the TTS service generates it (chunked transfer or SSE).

---

## Patterns

### Authentication
- Login returns a signed JWT (short-lived, e.g. 1 hour) stored in `localStorage`.
- All backend routes (except `POST /auth/login`) require `Authorization: Bearer <token>`.
- The backend `auth` middleware verifies the JWT and attaches `req.userId` for downstream handlers.

### Reading Progress
- Progress is tracked at the **sentence level**: `(userId, fileId, sentenceIndex)`.
- The frontend sends a `PATCH /progress/:fileId` with `{ sentenceIndex }` after the user advances.
- On load, `GET /progress/:fileId` returns the last sentence index so the reader resumes correctly.

### Phonetic Dictionary
- Stored in SQLite: `(userId, word, phonetic)`.
- Before calling XTTS, the backend substitutes words in the text with their phonetic overrides.
- Dictionary is scoped per-user; one user's overrides don't affect others.

### Settings
- All TTS and reader settings (speed, voice, theme, font size, etc.) are stored in SQLite per-user in a `settings` table as a JSON blob.
- The frontend loads settings on login via `GET /settings` and saves changes via `PUT /settings`.
- The SolidJS `settingsStore` is the in-memory representation; it is hydrated from the API on startup and flushed on every change.
- Import/export: serialize the settings JSON to a file (`settings.json`). Import validates the schema before calling `PUT /settings`.

### File Parsing
- The backend parses uploaded files into a flat array of sentences server-side before storing.
- Sentence splitting uses a simple rule-based approach (punctuation + length cap) — keep it simple.
- Parsed sentence arrays are cached to avoid re-parsing on every read.

### XTTS / TTS Service
- The TTS service exposes `POST /synthesize` with `{ text, speed, phonetic_dict? }`.
- The XTTS model is loaded once at startup (expensive); never reload it per-request.
- Use a request queue in the TTS service to avoid concurrent synthesis (XTTS is not thread-safe by default).

---

## Anti-Patterns

- **Don't call the TTS service from the frontend directly.** It must go through the backend proxy so auth is enforced and the service stays internal.
- **Don't store settings in `localStorage`.** Settings belong in SQLite (per-user, server-side) so they roam across browsers/devices and are included in a single backup.
- **Don't reload the XTTS model per request.** Load it once at startup; model loading takes 10–30 seconds.
- **Don't expose the TTS service port in `docker-compose.yml`.** It should only be on the internal Docker network.
- **Don't parse book files on every read request.** Parse once on upload and cache the result.
- **Don't use `any` in TypeScript.** Use proper types or `unknown` with narrowing.

---

## Code Style

- **TypeScript:** Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Prettier handles formatting (configured in `prettier.config.js`). ESLint enforces rules.
- **Python:** [PEP 8](https://peps.python.org/pep-0008/), enforced by `ruff`. Max line length: 100.
- **Naming:** `camelCase` for TS variables/functions, `PascalCase` for components/classes, `snake_case` for Python.
- SolidJS components go in `frontend/src/components/` (shared) or `frontend/src/pages/` (route-level).

---

## Commit & Pull Request Guidelines

### Before Committing
1. Run `bun run lint` and `bun run format` in both `frontend/` and `backend/`.
2. Run `uv run ruff check .` in `tts-service/`.
3. Run `bun test` in `frontend/` and `backend/`.
4. Verify `docker compose build` succeeds if you changed `Dockerfile` or `docker-compose.yml`.

### Commit Message Format

```
type: short imperative summary (max 72 chars)

Optional body explaining *why*, not *what*.
```

**Types:** `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `chore`, `perf`

**Examples:**
```
feat: add phonetic dictionary import from CSV
fix: prevent XTTS model reload on concurrent requests
chore: upgrade bun to 1.x
```

### Pull Requests
- Title follows the same `type: summary` convention.
- Description must include: **what changed**, **why**, and **how to test it**.
- Link any related issues.
