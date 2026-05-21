const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev-secret";

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64urlEncode(sig)}`;
}

export async function authMiddleware(req: Request): Promise<{ userId: number }> {
  let jwt: string | null = null;
  
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    jwt = authHeader.slice(7);
    console.log("Found JWT in Authorization header");
  } else {
    // Try query parameter for images/assets
    const url = new URL(req.url);
    jwt = url.searchParams.get("token");
    if (jwt) console.log("Found JWT in query parameter");
  }

  if (!jwt) {
    console.warn(`No JWT found for ${req.url}`);
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const parts = jwt.split(".");
  if (parts.length !== 3) {
    console.error(`Invalid JWT format: ${jwt.substring(0, 10)}...`);
    throw new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }
  const [header, body, signature] = parts as [string, string, string];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(signature),
    new TextEncoder().encode(`${header}.${body}`)
  );
  if (!valid) {
    console.error("JWT signature verification failed");
    throw new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as Record<string, unknown>;
  if (typeof payload["sub"] !== "number") {
    console.error("Invalid JWT sub payload type");
    throw new Response(JSON.stringify({ error: "Invalid token payload" }), { status: 401 });
  }
  return { userId: payload["sub"] };
}
