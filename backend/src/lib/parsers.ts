import pdfParse from "pdf-parse";
import JSZip from "jszip";

export interface ChapterMeta {
  title: string;
  id: string;
}

export interface Chapter {
  title: string;
  paragraphs: string[];
  id: string;
}

export interface BookStructure {
  chapters: ChapterMeta[];
}

/** Decode common HTML entities in a text node (not for full HTML). */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function processInlineHtml(inner: string, fileId: string, chapterHref: string): string {
  // Resolve relative paths in EPUB
  // chapterHref is like "Text/ch01.xhtml", img src is like "../Images/fig1.jpg"
  const resolvePath = (rel: string) => {
    if (rel.startsWith("http")) return rel;
    const base = chapterHref.substring(0, chapterHref.lastIndexOf("/") + 1);
    const parts = (base + rel).split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part && part !== ".") stack.push(part);
    }
    return stack.join("/");
  };

  let out = inner.replace(
    /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_full, href: string, content: string) => {
      const resolved = resolvePath(decodeEntities(href));
      // Fancy styling: Inline, no padding to avoid "highlighted indent", just color and a nice border
      const style = "color: #38bdf8; text-decoration: none; font-weight: 600; border-bottom: 2px solid rgba(56, 189, 248, 0.3); transition: all 0.2s; cursor: pointer;";
      return `<a data-href="${resolved}" class="book-link" style="${style}">${content}</a>`;
    },
  );

  // Preserve <img> tags and rewrite src to our proxy
  out = out.replace(
    /<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi,
    (_full, src: string) => {
      const resolved = resolvePath(decodeEntities(src));
      // Ensure we don't have leading slashes that cause double slashes in the final URL
      const cleanResolved = resolved.startsWith("/") ? resolved.slice(1) : resolved;
      return `<img src="/api/books/${encodeURIComponent(fileId)}/images/${encodeURIComponent(cleanResolved)}" style="max-width: 100%; height: auto; display: block; margin: 1.5rem auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />`;
    }
  );

  // Strip dangerous tags but keep formatting and our allowed interactive tags
  out = out.replace(/<(?!a|img|span|b|i|em|strong|br|\/a|\/span|\/b|\/i|\/em|\/strong|\/br)[^>]+>/g, "");

  return decodeEntities(out).replace(/\s+/g, " ").trim();
}

function extractTitle(html: string, fileId: string, id: string): string {
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTagMatch?.[1]) return decodeEntities(titleTagMatch[1].replace(/<[^>]+>/g, "").trim());
  const headingMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (headingMatch?.[1]) return processInlineHtml(headingMatch[1], fileId, id);
  return "";
}

export function parseHtmlChapter(html: string, id: string, fileId: string): Chapter {
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "");
  const title = extractTitle(html, fileId, id);
  const blockRe = /<(p|li|blockquote|h[1-6]|pre)([^>]*)>([\s\S]*?)<\/\1>|<hr[^>]*>/gi;
  const paragraphs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(body)) !== null) {
    if (match[0].toLowerCase().startsWith("<hr")) {
      paragraphs.push("<hr />");
      continue;
    }
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const paraId = idMatch ? idMatch[1] : null;

    const inner = processInlineHtml(match[3], fileId, id);
    if (inner.trim().length === 0) continue;

    const finalInner = paraId ? `<span id="${paraId}"></span>${inner}` : inner;

    if (tag.startsWith("h")) {
      paragraphs.push(`[${tag.toUpperCase()}]${finalInner}`);
    } else {
      paragraphs.push(finalInner);
    }
  }
  if (paragraphs.length === 0) {
    const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const decoded = decodeEntities(plain);
    if (decoded.length > 0) paragraphs.push(decoded);
  }
  return { title, paragraphs, id };
}


/**
 * Handle Plain Text: One single chapter.
 */
export function getTxtStructure(): BookStructure {
  return { chapters: [{ title: "Book Content", id: "text" }] };
}

export function parseTxtChapter(buffer: Buffer): Chapter {
  const text = buffer.toString("utf8");
  const paragraphs = text
    .split(/\r?\n(\r?\n)+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  return { title: "Book Content", paragraphs, id: "text" };
}

/**
 * Handle PDF: One single chapter.
 */
export function getPdfStructure(): BookStructure {
  return { chapters: [{ title: "Book Content", id: "pdf" }] };
}

export async function parsePdfChapter(buffer: Buffer): Promise<Chapter> {
  const data = await pdfParse(buffer);
  const paragraphs = (data.text.split(/\n\s*\n/) as string[])
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  return { title: "Book Content", paragraphs, id: "pdf" };
}

/**
 * Handle EPUB: Lazy extraction using JSZip.
 */
export async function getEpubStructure(buffer: Buffer, _fileId: string): Promise<{ structure: BookStructure; opfDir: string; idToHref: Map<string, string>; spineMatches: string[]; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error("Invalid EPUB: cannot find rootfile");
  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  const spineMatches = [...opfXml.matchAll(/idref=["']([^"']+)["']/gi)].map((m) => m[1]);
  const manifestMatches = [...opfXml.matchAll(/<item\s+([^>]+)\/?>/gi)];
  const idToHref = new Map<string, string>();
  for (const match of manifestMatches) {
    const attrs = match[1];
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (idMatch && hrefMatch) {
      idToHref.set(idMatch[1], hrefMatch[1]);
    }
  }

  const meta: ChapterMeta[] = [];
  for (let i = 0; i < spineMatches.length; i++) {
    const idref = spineMatches[i];
    const href = idToHref.get(idref);
    if (!href) continue;
    const hrefFile = href.split("#")[0];
    
    let title = `Chapter ${i + 1}`;
    
    // Attempt a quick header scan for a better title
    const html = await zip.file(opfDir + hrefFile)?.async("string");
    if (html) {
      const hMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      if (hMatch?.[1]) {
        title = hMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        // If title is too long, it might be a paragraph mistaken for a header
        if (title.length > 100) title = title.substring(0, 97) + "...";
      } else {
        const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleTagMatch?.[1]) {
          const t = titleTagMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
          if (t && t.toLowerCase() !== "untitled" && t.length < 100) title = t;
        }
      }
    }

    meta.push({ title, id: hrefFile });
  }

  return {
    structure: { chapters: meta },
    opfDir,
    idToHref,
    spineMatches,
    zip
  };
}


