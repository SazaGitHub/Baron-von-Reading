export async function handleTtsProxy(req: Request, _userId: number): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/api/tts/status") {
    return new Response(JSON.stringify({ status: "offline", progress: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
    return new Response(JSON.stringify({ error: "Server-side TTS is disabled in desktop mode" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
