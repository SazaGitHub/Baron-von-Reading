import { token } from "./token";

export interface Settings {
  speed: number;
  theme: "light" | "dark" | "amoled";
  fontSize: number;
  voice?: string;
  ttsEngine?: "browser" | "kokoro";
}

export interface Progress {
  sentenceIndex: number;
}

export interface BookMeta {
  fileId: string;
  name: string;
}

export interface PhoneticEntry {
  word: string;
  phonetic: string;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const t = token();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (t !== null) {
    headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  return res;
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return res.json() as Promise<{ token: string }>;
}

export async function getAuthStatus(): Promise<{ registrationSecretRequired: boolean }> {
  const res = await fetch("/api/auth/status");
  if (!res.ok) return { registrationSecretRequired: false };
  return res.json() as Promise<{ registrationSecretRequired: boolean }>;
}

export async function register(username: string, password: string, secret?: string): Promise<void> {
  await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, secret }),
  });
}

export async function getSettings(): Promise<Settings> {
  const res = await apiFetch("/settings");
  return res.json() as Promise<Settings>;
}

export async function putSettings(settings: Settings): Promise<void> {
  await apiFetch("/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export async function getProgress(fileId: string): Promise<Progress> {
  const res = await apiFetch(`/progress/${encodeURIComponent(fileId)}`);
  return res.json() as Promise<Progress>;
}

export async function patchProgress(fileId: string, sentenceIndex: number): Promise<void> {
  await apiFetch(`/progress/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    body: JSON.stringify({ sentenceIndex }),
  });
}

export async function getBooks(): Promise<BookMeta[]> {
  const res = await apiFetch("/books");
  return res.json() as Promise<BookMeta[]>;
}

export async function uploadBook(file: File): Promise<{ fileId: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/books", { method: "POST", body: form });
  return res.json() as Promise<{ fileId: string }>;
}

export async function deleteBook(fileId: string): Promise<void> {
  await apiFetch(`/books/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

export interface BookChapterMeta {
  title: string;
  id: string;
}

export interface BookStructure {
  chapters: BookChapterMeta[];
}

export interface BookChapter {
  title: string;
  paragraphs: string[];
  id: string;
}

export async function getBook(fileId: string): Promise<BookStructure> {
  const res = await apiFetch(`/books/${encodeURIComponent(fileId)}`);
  return res.json() as Promise<BookStructure>;
}

export async function getChapter(fileId: string, index: number): Promise<BookChapter> {
  const res = await apiFetch(`/books/${encodeURIComponent(fileId)}/chapters/${index}`);
  const data = await res.json() as BookChapter;
  const t = token();
  if (t) {
    // Inject token into image URLs so the browser can load them
    // This regex targets the src attribute specifically and handles both " and ' quotes.
    data.paragraphs = data.paragraphs.map(p => 
      p.replace(/(<img\s[^>]*src=["'])(\/api\/books\/[^"'>]+\/images\/[^"'>]+)(["'])/g, (_match, p1, p2, p3) => {
        const separator = p2.includes('?') ? '&' : '?';
        return `${p1}${p2}${separator}token=${t}${p3}`;
      })
    );
  }
  return data;
}

export async function synthesize(text: string, speed: number, voice?: string): Promise<Blob> {
  const t = token();
  const res = await fetch("/api/tts/synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: JSON.stringify({ text, speed, speaker_wav: voice }),
  });
  if (!res.ok) throw new Error("TTS synthesis failed");
  return res.blob();
}

export async function getTtsStatus(): Promise<{ status: string; progress: number }> {
  const t = token();
  const res = await fetch("/api/tts/status", {
    headers: {
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
  if (!res.ok) return { status: "offline", progress: 0 };
  return res.json() as Promise<{ status: string; progress: number }>;
}

export async function getPhoneticDict(): Promise<PhoneticEntry[]> {
  const res = await apiFetch("/phonetic-dict");
  return res.json() as Promise<PhoneticEntry[]>;
}

export async function upsertPhonetic(word: string, phonetic: string): Promise<void> {
  await apiFetch(`/phonetic-dict/${encodeURIComponent(word)}`, {
    method: "PUT",
    body: JSON.stringify({ phonetic }),
  });
}

export async function deletePhonetic(word: string): Promise<void> {
  await apiFetch(`/phonetic-dict/${encodeURIComponent(word)}`, { method: "DELETE" });
}
