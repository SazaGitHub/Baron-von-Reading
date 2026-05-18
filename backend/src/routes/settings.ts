import { db } from "../db/schema";

interface SettingsRow {
  data: string;
}

export function handleSettings(req: Request, userId: number): Response {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/api/settings") {
    const row = db
      .query<SettingsRow, [number]>("SELECT data FROM settings WHERE user_id = ?")
      .get(userId);
    const data = row ? JSON.parse(row.data) : { speed: 1, theme: "light", fontSize: 16 };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    return new Response(null, { status: 202 });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}

export async function handleSettingsAsync(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await req.json();
    const data = JSON.stringify(body);
    db.run(
      "INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data",
      [userId, data]
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return handleSettings(req, userId);
}
