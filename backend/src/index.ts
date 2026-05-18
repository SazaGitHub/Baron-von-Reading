import { handleAuth } from "./routes/auth";
import { handleSettingsAsync } from "./routes/settings";
import { handleProgress } from "./routes/progress";
import { handleBooks } from "./routes/books";
import { handleTtsProxy } from "./routes/tts-proxy";
import { authMiddleware } from "./middleware/auth";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

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
      if (err instanceof Response) return err;
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
    if (url.pathname.startsWith("/api/tts")) {
      return handleTtsProxy(req);
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  },
});

console.log(`Baron von Reading backend listening on port ${PORT}`);
