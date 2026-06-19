import { token } from "./token";
async function apiFetch(path, options = {}) {
    const t = token();
    const headers = {
        ...options.headers,
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
export async function login(username, password) {
    const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
    return res.json();
}
export async function getAuthStatus() {
    const res = await fetch("/api/auth/status");
    if (!res.ok)
        return { registrationSecretRequired: false };
    return res.json();
}
export async function register(username, password, secret) {
    await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, secret }),
    });
}
export async function getSettings() {
    const res = await apiFetch("/settings");
    return res.json();
}
export async function putSettings(settings) {
    await apiFetch("/settings", { method: "PUT", body: JSON.stringify(settings) });
}
export async function getProgress(fileId) {
    const res = await apiFetch(`/progress/${encodeURIComponent(fileId)}`);
    return res.json();
}
export async function patchProgress(fileId, sentenceIndex) {
    await apiFetch(`/progress/${encodeURIComponent(fileId)}`, {
        method: "PATCH",
        body: JSON.stringify({ sentenceIndex }),
    });
}
export async function getBooks() {
    const res = await apiFetch("/books");
    return res.json();
}
export async function uploadBook(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch("/books", { method: "POST", body: form });
    return res.json();
}
export async function deleteBook(fileId) {
    await apiFetch(`/books/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}
export async function renameBook(fileId, displayName) {
    await apiFetch(`/books/${encodeURIComponent(fileId)}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
    });
}
export async function getBook(fileId) {
    const res = await apiFetch(`/books/${encodeURIComponent(fileId)}`);
    return res.json();
}
export async function getChapter(fileId, index) {
    const res = await apiFetch(`/books/${encodeURIComponent(fileId)}/chapters/${index}`);
    const data = await res.json();
    const t = token();
    if (t) {
        // Inject token into image URLs so the browser can load them
        // This regex targets the src attribute specifically and handles both " and ' quotes.
        data.paragraphs = data.paragraphs.map(p => p.replace(/(<img\s[^>]*src=["'])(\/api\/books\/[^"'>]+\/images\/[^"'>]+)(["'])/g, (_match, p1, p2, p3) => {
            const separator = p2.includes('?') ? '&' : '?';
            return `${p1}${p2}${separator}token=${t}${p3}`;
        }));
    }
    return data;
}
export async function synthesize(text, speed, voice) {
    const t = token();
    const res = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ text, speed, speaker_wav: voice }),
    });
    if (!res.ok)
        throw new Error("TTS synthesis failed");
    return res.blob();
}
export async function getTtsStatus() {
    const t = token();
    const res = await fetch("/api/tts/status", {
        headers: {
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
    });
    if (!res.ok)
        return { status: "offline", progress: 0 };
    return res.json();
}
export async function getPhoneticDict() {
    const res = await apiFetch("/phonetic-dict");
    return res.json();
}
export async function upsertPhonetic(word, phonetic) {
    await apiFetch(`/phonetic-dict/${encodeURIComponent(word)}`, {
        method: "PUT",
        body: JSON.stringify({ phonetic }),
    });
}
export async function deletePhonetic(word) {
    await apiFetch(`/phonetic-dict/${encodeURIComponent(word)}`, { method: "DELETE" });
}
export async function getBookshelves() {
    const res = await apiFetch("/bookshelves");
    return res.json();
}
export async function createBookshelf(name) {
    const res = await apiFetch("/bookshelves", {
        method: "POST",
        body: JSON.stringify({ name }),
    });
    return res.json();
}
export async function deleteBookshelf(id) {
    await apiFetch(`/bookshelves/${id}`, { method: "DELETE" });
}
export async function addBookToShelf(shelfId, fileId) {
    await apiFetch(`/bookshelves/${shelfId}/books`, {
        method: "POST",
        body: JSON.stringify({ fileId }),
    });
}
export async function removeBookFromShelf(shelfId, fileId) {
    await apiFetch(`/bookshelves/${shelfId}/books/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
    });
}
