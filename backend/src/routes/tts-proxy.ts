const TTS_SERVICE_URL = process.env["TTS_SERVICE_URL"] ?? "http://localhost:8001";

export async function handleTtsProxy(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
    const upstream = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: req.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "audio/wav",
      },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
