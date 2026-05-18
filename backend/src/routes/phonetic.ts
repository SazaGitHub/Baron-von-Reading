import { db } from "../db/schema";

interface PhoneticRow {
  word: string;
  phonetic: string;
}

export async function handlePhonetic(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/phonetic-dict — list all entries
  if (req.method === "GET" && url.pathname === "/api/phonetic-dict") {
    const rows = db
      .query<PhoneticRow, [number]>("SELECT word, phonetic FROM phonetic_dict WHERE user_id = ?")
      .all(userId);
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // PUT /api/phonetic-dict/:word — upsert
  const putMatch = url.pathname.match(/^\/api\/phonetic-dict\/(.+)$/);
  if (req.method === "PUT" && putMatch) {
    const word = decodeURIComponent(putMatch[1]).toLowerCase();
    const body = (await req.json()) as { phonetic: string };
    db.run(
      "INSERT INTO phonetic_dict (user_id, word, phonetic) VALUES (?, ?, ?) ON CONFLICT(user_id, word) DO UPDATE SET phonetic = excluded.phonetic",
      [userId, word, body.phonetic]
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // DELETE /api/phonetic-dict/:word
  const delMatch = url.pathname.match(/^\/api\/phonetic-dict\/(.+)$/);
  if (req.method === "DELETE" && delMatch) {
    const word = decodeURIComponent(delMatch[1]).toLowerCase();
    db.run("DELETE FROM phonetic_dict WHERE user_id = ? AND word = ?", [userId, word]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
