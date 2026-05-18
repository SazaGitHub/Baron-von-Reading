import path from "path";
import { parseTxt, parsePdf, parseEpub } from "../lib/parsers";

const DATA_DIR = process.env["DATA_DIR"] ?? path.join(import.meta.dir, "../../data");

interface BookMeta {
  fileId: string;
  name: string;
}

export async function handleBooks(req: Request, _userId: number): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/books
  if (req.method === "GET" && url.pathname === "/api/books") {
    const dir = Bun.file(DATA_DIR);
    // List files in DATA_DIR
    const { readdir } = await import("fs/promises");
    let names: string[] = [];
    try {
      names = await readdir(DATA_DIR);
    } catch {
      names = [];
    }
    const books: BookMeta[] = names.map((name) => ({ fileId: name, name }));
    return new Response(JSON.stringify(books), {
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
    const ext = path.extname(fileId).toLowerCase();
    let sentences: string[];
    if (ext === ".txt") {
      sentences = parseTxt(buf);
    } else if (ext === ".pdf") {
      sentences = await parsePdf(buf);
    } else if (ext === ".epub") {
      sentences = await parseEpub(buf);
    } else {
      return new Response(JSON.stringify({ error: "Unsupported file type" }), { status: 415 });
    }
    return new Response(JSON.stringify({ sentences }), {
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
    const { mkdir, writeFile } = await import("fs/promises");
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
