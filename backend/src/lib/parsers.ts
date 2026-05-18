/**
 * Split plain text into sentences using punctuation-based rules.
 */
export function parseTxt(buffer: Buffer): string[] {
  const text = buffer.toString("utf8");
  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function parsePdf(_buffer: Buffer): Promise<string[]> {
  throw new Error("PDF parsing not yet implemented");
}

export async function parseEpub(_buffer: Buffer): Promise<string[]> {
  throw new Error("EPUB parsing not yet implemented");
}
