import pdfParse from "pdf-parse";
import JSZip from "jszip";

/** Remove HTML/CSS tags and clean up text. */
function stripHtml(html: string): string {
  return html
    // Remove style and script tags entirely
    .replace(/<(style|script|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "\n")
    // Decode HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x[0-9a-f]+;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Remove leading/trailing whitespace from each line
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Split text into paragraphs (more readable than sentences). */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length > 20); // Skip very short lines (headers, etc.)
}

export function parseTxt(buffer: Buffer): string[] {
  const text = buffer.toString("utf8");
  return splitParagraphs(text);
}

export async function parsePdf(buffer: Buffer): Promise<string[]> {
  const data = await pdfParse(buffer);
  return splitParagraphs(data.text);
}

export async function parseEpub(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);

  // Parse container.xml to find the rootfile (OPF)
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error("Invalid EPUB: cannot find rootfile");
  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  // Extract spine item idrefs in order
  const spineMatches = [...opfXml.matchAll(/idref="([^"]+)"/g)].map((m) => m[1]);

  // Build id → href map from manifest
  const manifestMatches = [...opfXml.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g)];
  const idToHref = new Map<string, string>(manifestMatches.map((m) => [m[1], m[2]]));

  const paragraphs: string[] = [];

  for (const idref of spineMatches) {
    const href = idToHref.get(idref);
    if (!href) continue;
    const filePath = opfDir + href;
    const html = await zip.file(filePath)?.async("string");
    if (!html) continue;
    const text = stripHtml(html);
    paragraphs.push(...splitParagraphs(text));
  }

  return paragraphs;
}
