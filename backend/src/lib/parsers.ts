import pdfParse from "pdf-parse";
import JSZip from "jszip";

/** Split text into sentences on .!? followed by whitespace. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseTxt(buffer: Buffer): string[] {
  return splitSentences(buffer.toString("utf8"));
}

export async function parsePdf(buffer: Buffer): Promise<string[]> {
  const data = await pdfParse(buffer);
  return splitSentences(data.text);
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

  const sentences: string[] = [];

  for (const idref of spineMatches) {
    const href = idToHref.get(idref);
    if (!href) continue;
    const filePath = opfDir + href;
    const html = await zip.file(filePath)?.async("string");
    if (!html) continue;
    // Strip HTML tags, decode basic entities
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    sentences.push(...splitSentences(text));
  }

  return sentences;
}
