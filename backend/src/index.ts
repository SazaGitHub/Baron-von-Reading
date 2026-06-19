import http from "http";
import path from "path";
import fs from "fs/promises";
import { handleAuth } from "./routes/auth";
import { handleSettingsAsync } from "./routes/settings";
import { handleProgress } from "./routes/progress";
import { handleBooks } from "./routes/books";
import { handleBookshelves } from "./routes/bookshelves";
import { handleTtsProxy } from "./routes/tts-proxy";
import { handlePhonetic } from "./routes/phonetic";
import { authMiddleware } from "./middleware/auth";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const PUBLIC_DIR = process.env["PUBLIC_DIR"] ?? path.join(process.cwd(), "public");

// Helper to convert Node.js req to Web Standard Request
async function toWebRequest(req: http.IncomingMessage, port: number): Promise<Request> {
  const method = req.method || "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const val of value) headers.append(key, val);
    } else {
      headers.set(key, value as string);
    }
  }

  const host = req.headers.host || `localhost:${port}`;
  const url = new URL(req.url || "/", `http://${host}`);

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    body = Buffer.concat(chunks).buffer;
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
    // Request body cannot be defined for GET/HEAD
    duplex: "half"
  } as any);
}

// Helper to write Web Standard Response to Node.js res
async function sendWebResponse(webRes: Response, res: http.ServerResponse): Promise<void> {
  res.statusCode = webRes.status;
  res.statusMessage = webRes.statusText;
  
  webRes.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });

  if (webRes.body) {
    for await (const chunk of webRes.body as any) {
      res.write(chunk);
    }
  }
  res.end();
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = new URL(req.url || "/", `http://localhost`);
  console.log(`[${req.method}] ${url.pathname}${url.search}`);

  try {
    // API Routes
    if (url.pathname.startsWith("/api/")) {
      const webReq = await toWebRequest(req, PORT);

      // Public auth routes — no JWT required
      if (url.pathname.startsWith("/api/auth")) {
        const webRes = await handleAuth(webReq);
        await sendWebResponse(webRes, res);
        return;
      }

      // All other routes require auth
      let userId: number;
      try {
        const ctx = await authMiddleware(webReq);
        userId = ctx.userId;
      } catch (err) {
        if (err instanceof Response) {
          console.error(`Auth failed for ${url.pathname}: ${err.status}`);
          await sendWebResponse(err, res);
          return;
        }
        console.error(`Auth error for ${url.pathname}:`, err);
        const errRes = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        await sendWebResponse(errRes, res);
        return;
      }

      let webRes: Response;
      if (url.pathname.startsWith("/api/bookshelves")) {
        webRes = await handleBookshelves(webReq, userId);
      } else if (url.pathname.startsWith("/api/books")) {
        webRes = await handleBooks(webReq, userId);
      } else if (url.pathname.startsWith("/api/progress")) {
        webRes = await handleProgress(webReq, userId);
      } else if (url.pathname.startsWith("/api/settings")) {
        webRes = await handleSettingsAsync(webReq, userId);
      } else if (url.pathname.startsWith("/api/phonetic-dict")) {
        webRes = await handlePhonetic(webReq, userId);
      } else if (url.pathname.startsWith("/api/tts")) {
        webRes = await handleTtsProxy(webReq, userId);
      } else {
        webRes = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }

      await sendWebResponse(webRes, res);
      return;
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, url.pathname);
    if (url.pathname === "/") filePath = path.join(PUBLIC_DIR, "index.html");

    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      // SPA Fallback: serve index.html for unknown routes
      try {
        const indexContent = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(indexContent);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Internal Server Error: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.error("Server error handling request:", err);
    res.statusCode = 500;
    res.end(`Internal Server Error: ${(err as Error).message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Baron von Reading unified backend listening on port ${PORT}`);
});

export { server };
