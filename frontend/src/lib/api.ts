import { token } from "./token";

export interface Settings {
  speed: number;
  theme: "light" | "dark";
  fontSize: number;
}

export interface Progress {
  sentenceIndex: number;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const t = token();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
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

export async function login(
  username: string,
  password: string
): Promise<{ token: string }> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return res.json() as Promise<{ token: string }>;
}

export async function getSettings(): Promise<Settings> {
  const res = await apiFetch("/settings");
  return res.json() as Promise<Settings>;
}

export async function putSettings(settings: Settings): Promise<void> {
  await apiFetch("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getProgress(fileId: string): Promise<Progress> {
  const res = await apiFetch(`/progress/${fileId}`);
  return res.json() as Promise<Progress>;
}

export async function patchProgress(fileId: string, sentenceIndex: number): Promise<void> {
  await apiFetch(`/progress/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ sentenceIndex }),
  });
}
