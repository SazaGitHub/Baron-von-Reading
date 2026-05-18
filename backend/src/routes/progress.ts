import { db } from "../db/schema";

interface ProgressRow {
  sentence_index: number;
}

export async function handleProgress(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/progress\/(.+)$/);
  if (!match) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  const fileId = decodeURIComponent(match[1]);

  if (req.method === "GET") {
    const row = db
      .query<ProgressRow, [number, string]>(
        "SELECT sentence_index FROM progress WHERE user_id = ? AND file_id = ?"
      )
      .get(userId, fileId);
    return new Response(JSON.stringify({ sentenceIndex: row?.sentence_index ?? 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "PATCH") {
    const body = (await req.json()) as { sentenceIndex: number };
    db.run(
      "INSERT INTO progress (user_id, file_id, sentence_index) VALUES (?, ?, ?) ON CONFLICT(user_id, file_id) DO UPDATE SET sentence_index = excluded.sentence_index",
      [userId, fileId, body.sentenceIndex]
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
}
