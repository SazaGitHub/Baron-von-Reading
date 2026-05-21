import path from "path";
import { handleAuth } from "./routes/auth";
import { handleSettingsAsync } from "./routes/settings";
import { handleProgress } from "./routes/progress";
import { handleBooks } from "./routes/books";
import { handleTtsProxy } from "./routes/tts-proxy";
import { handlePhonetic } from "./routes/phonetic";
import { authMiddleware } from "./middleware/auth";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const PUBLIC_DIR = path.join(import.meta.dir, "../public");

Bun.serve({
  port: PORT,
  maxRequestBodySize: 1024 * 1024 * 1024 * 5, // 5GB
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    console.log(`[${req.method}] ${url.pathname}${url.search}`);

    // API Routes
    if (url.pathname.startsWith("/api/")) {
      // Public auth routes — no JWT required
      if (url.pathname.startsWith("/api/auth")) {
        return handleAuth(req);
      }

      // All other routes require auth
      let userId: number;
      try {
        const ctx = await authMiddleware(req);
        userId = ctx.userId;
      } catch (err) {
        if (err instanceof Response) {
          console.error(`Auth failed for ${url.pathname}: ${err.status}`);
          return err;
        }
        console.error(`Auth error for ${url.pathname}:`, err);
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      if (url.pathname.startsWith("/api/books")) {
        return handleBooks(req, userId);
      }
      if (url.pathname.startsWith("/api/progress")) {
        return handleProgress(req, userId);
      }
      if (url.pathname.startsWith("/api/settings")) {
        return handleSettingsAsync(req, userId);
      }
      if (url.pathname.startsWith("/api/phonetic-dict")) {
        return handlePhonetic(req, userId);
      }
      if (url.pathname.startsWith("/api/tts")) {
        return handleTtsProxy(req, userId);
      }
      
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, url.pathname);
    if (url.pathname === "/") filePath = path.join(PUBLIC_DIR, "index.html");

    let file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA Fallback: if it's not a file and not an API, serve index.html
    const indexFile = Bun.file(path.join(PUBLIC_DIR, "index.html"));
    return new Response(indexFile);
  },
});

console.log(`Baron von Reading unified backend listening on port ${PORT}`);
