import path from "path";
import { readdir, mkdir, unlink } from "fs/promises";
import { 
  getTxtStructure, parseTxtChapter, 
  getPdfStructure, parsePdfChapter,
  getEpubStructure, parseHtmlChapter,
  type Chapter, type BookStructure 
} from "../lib/parsers";

const DATA_DIR = process.env["DATA_DIR"] ?? path.join(import.meta.dir, "../../data");

interface BookMeta {
  fileId: string;
  name: string;
}

// In-memory cache for book structure and context
interface BookContext {
  structure: BookStructure;
  ext: string;
  // EPUB specific context
  epub?: {
    zip: any;
    opfDir: string;
    idToHref: Map<string, string>;
    spineMatches: string[];
  };
  // Pre-parsed chapters for TXT/PDF (since they are monolithic)
  fullChapter?: Chapter;
}

const bookContextCache = new Map<string, BookContext>();

async function getOrInitContext(fileId: string): Promise<BookContext> {
  const cached = bookContextCache.get(fileId);
  if (cached) return cached;

  const filePath = path.join(DATA_DIR, fileId);
  const fileHandle = Bun.file(filePath);
  if (!(await fileHandle.exists())) throw new Error("File not found");

  const ext = path.extname(fileId).toLowerCase();
  
  // Use arrayBuffer directly and wrap in Buffer once to avoid redundant copies
  const buf = Buffer.from(await fileHandle.arrayBuffer());

  let ctx: BookContext;
  if (ext === ".txt") {
    ctx = { structure: getTxtStructure(), ext, fullChapter: parseTxtChapter(buf) };
  } else if (ext === ".pdf") {
    ctx = { structure: getPdfStructure(), ext, fullChapter: await parsePdfChapter(buf) };
  } else if (ext === ".epub") {
    const epub = await getEpubStructure(buf, fileId);
    ctx = { 
      structure: epub.structure, 
      ext, 
      epub: { 
        zip: epub.zip, 
        opfDir: epub.opfDir, 
        idToHref: epub.idToHref, 
        spineMatches: epub.spineMatches 
      } 
    };
  } else {
    throw new Error("Unsupported file type");
  }

  bookContextCache.set(fileId, ctx);
  return ctx;
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
      bookContextCache.delete(fileId);
    } catch {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/books/:fileId/images/:path
  const imageMatch = url.pathname.match(/^\/api\/books\/(.+)\/images\/(.+)$/);
  if (req.method === "GET" && imageMatch) {
    const fileId = decodeURIComponent(imageMatch[1]);
    const imagePath = decodeURIComponent(imageMatch[2]);
    try {
      const ctx = await getOrInitContext(fileId);
      if (!ctx.epub) throw new Error("Only EPUB images supported");
      
      const file = ctx.epub.zip.file(ctx.epub.opfDir + imagePath);
      if (!file) return new Response("Image not found", { status: 404 });
      
      const content = await file.async("nodebuffer");
      const ext = path.extname(imagePath).toLowerCase();
      let contentType = "image/jpeg";
      if (ext === ".png") contentType = "image/png";
      else if (ext === ".gif") contentType = "image/gif";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".svg") contentType = "image/svg+xml";

      return new Response(content, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
      });
    } catch (err) {
      return new Response((err as Error).message, { status: 500 });
    }
  }

  // GET /api/books/:fileId/chapters/:index
  const chapterMatch = url.pathname.match(/^\/api\/books\/(.+)\/chapters\/(\d+)$/);
  if (req.method === "GET" && chapterMatch) {
    const fileId = decodeURIComponent(chapterMatch[1]);
    const index = parseInt(chapterMatch[2], 10);
    try {
      const ctx = await getOrInitContext(fileId);
      
      if (ctx.fullChapter) {
        return new Response(JSON.stringify(ctx.fullChapter), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (ctx.epub) {
        const idref = ctx.epub.spineMatches[index];
        const href = ctx.epub.idToHref.get(idref);
        if (!href) throw new Error("Chapter metadata missing");
        const hrefFile = href.split("#")[0];
        const filePath = ctx.epub.opfDir + hrefFile;
        const html = await ctx.epub.zip.file(filePath)?.async("string");
        if (!html) throw new Error("Chapter content missing in ZIP");
        
        const chapter = parseHtmlChapter(html, hrefFile, fileId);
        return new Response(JSON.stringify(chapter), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "Chapter not found" }), { status: 404 });
    } catch (err) {
      console.error(`Error fetching chapter ${index} for ${fileId}:`, err);
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
  }

  // GET /api/books/:fileId (Returns structure only)
  const structureMatch = url.pathname.match(/^\/api\/books\/(.+)$/);
  if (req.method === "GET" && structureMatch) {
    const fileId = decodeURIComponent(structureMatch[1]);
    try {
      const ctx = await getOrInitContext(fileId);
      return new Response(JSON.stringify(ctx.structure), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(`Error fetching structure for ${fileId}:`, err);
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
    }
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
    
    // Pass the File object directly to Bun.write.
    // This is the most efficient way and correctly writes binary data.
    await Bun.write(destPath, file);
    
    return new Response(JSON.stringify({ fileId: file.name }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
