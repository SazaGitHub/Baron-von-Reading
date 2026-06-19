import crypto from "crypto";
import { db } from "../db/schema";
import { signJwt } from "../middleware/auth";

const Bun = {
  password: {
    async hash(password: string): Promise<string> {
      const salt = crypto.randomBytes(16).toString("hex");
      const derivedKey = crypto.scryptSync(password, salt, 64);
      return `${salt}:${derivedKey.toString("hex")}`;
    },
    async verify(password: string, hash: string): Promise<boolean> {
      const [salt, key] = hash.split(":");
      if (!salt || !key) return false;
      const derivedKey = crypto.scryptSync(password, salt, 64);
      return crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
    }
  }
};

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

export async function handleAuth(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = (await req.json()) as { username: string; password: string };
    const user = db
      .query<UserRow, [string]>("SELECT id, username, password_hash FROM users WHERE username = ?")
      .get(body.username);
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
    }
    const valid = await Bun.password.verify(body.password, user.password_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
    }
    const token = await signJwt({ sub: user.id, username: user.username });
    return new Response(JSON.stringify({ token }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const requiredSecret = process.env["REGISTRATION_SECRET"];
    return new Response(JSON.stringify({ registrationSecretRequired: !!requiredSecret }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = (await req.json()) as { username: string; password: string; secret?: string };
    
    const requiredSecret = process.env["REGISTRATION_SECRET"];
    if (requiredSecret && body.secret !== requiredSecret) {
      return new Response(JSON.stringify({ error: "Invalid registration secret" }), { status: 403 });
    }

    const hash = await Bun.password.hash(body.password);
    try {
      db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [body.username, hash]);
    } catch {
      return new Response(JSON.stringify({ error: "Username already taken" }), { status: 409 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
