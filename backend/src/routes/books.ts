import path from "path";
import { parseTxt, parsePdf, parseEpub } from "../lib/parsers";
import { readdir, mkdir, writeFile, unlink } from "fs/promises";

const DATA_DIR = process.env["DATA_DIR"] ?? path.join(import.meta.dir, "../../data");

interface BookMeta {
  fileId: string;
  name: string;
}

// In-memory sentence cache: fileId → sentences
const sentenceCache = new Map<string, string[]>();

async function parseSentences(fileId: string, buf: Buffer): Promise<string[]> {
  const cached = sentenceCache.get(fileId);
  if (cached) return cached;
  const ext = path.extname(fileId).toLowerCase();
  let sentences: string[];
  if (ext === ".txt") {
    sentences = parseTxt(buf);
  } else if (ext === ".pdf") {
    sentences = await parsePdf(buf);
  } else if (ext === ".epub") {
    sentences = await parseEpub(buf);
  } else {
    throw new Error("Unsupported file type");
  }
  sentenceCache.set(fileId, sentences);
  return sentences;
}

export async function handleBooks(req: Request, _userId: number): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/books
  if (req.method === "GET" && url.pathname === "/api/books") {
    let names: string[] = [];
    try {
      names = await readdir(DATA_DIR);
    } catch {
      names = [];
    }
    const books: BookMeta[] = names
      .filter((n) => [".txt", ".pdf", ".epub"].includes(path.extname(n).toLowerCase()))
      .map((name) => ({ fileId: name, name }));
    return new Response(JSON.stringify(books), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // DELETE /api/books/:fileId
  const deleteMatch = url.pathname.match(/^\/api\/books\/(.+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const fileId = decodeURIComponent(deleteMatch[1]);
    const filePath = path.join(DATA_DIR, fileId);
    try {
      await unlink(filePath);
      sentenceCache.delete(fileId);
    } catch {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/books/:fileId
  const singleMatch = url.pathname.match(/^\/api\/books\/(.+)$/);
  if (req.method === "GET" && singleMatch) {
    const fileId = decodeURIComponent(singleMatch[1]);
    const filePath = path.join(DATA_DIR, fileId);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    let sentences: string[];
    try {
      sentences = await parseSentences(fileId, buf);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : "Parse error" }),
        { status: 415 }
      );
    }
    return new Response(JSON.stringify({ paragraphs: sentences }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/books
  if (req.method === "POST" && url.pathname === "/api/books") {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
    }
    const ext = path.extname(file.name).toLowerCase();
    if (![".txt", ".pdf", ".epub"].includes(ext)) {
      return new Response(JSON.stringify({ error: "Unsupported file type" }), { status: 415 });
    }
    await mkdir(DATA_DIR, { recursive: true });
    const destPath = path.join(DATA_DIR, file.name);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(destPath, buf);
    return new Response(JSON.stringify({ fileId: file.name }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
