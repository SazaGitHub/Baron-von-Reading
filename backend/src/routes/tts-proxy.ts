// TTS is currently handled in the browser via SpeechSynthesis API.
// This stub remains so the route registration in index.ts compiles.

export async function handleTtsProxy(_req: Request, _userId: number): Promise<Response> {
  return new Response(
    JSON.stringify({ error: "TTS is handled client-side via SpeechSynthesis API" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
}
