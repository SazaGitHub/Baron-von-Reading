import { createSignal, createResource, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getBooks, uploadBook, deleteBook } from "../lib/api";
import { setToken } from "../lib/token";

export default function LibraryPage() {
  const navigate = useNavigate();
  const [books, { refetch }] = createResource(getBooks);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleUpload = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadBook(file);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm(`Delete "${fileId}"?`)) return;
    try {
      await deleteBook(fileId);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const logout = () => {
    setToken(null);
    navigate("/login");
  };

  return (
    <div style={{ "max-width": "800px", margin: "0 auto", padding: "2rem", "font-family": "sans-serif" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "2rem" }}>
        <h1 style={{ margin: 0 }}>📚 Library</h1>
        <button onClick={logout} style={{ background: "none", border: "1px solid #ccc", padding: "0.4rem 0.8rem", "border-radius": "6px", cursor: "pointer" }}>
          Logout
        </button>
      </div>

      <div style={{ "margin-bottom": "1.5rem" }}>
        <label style={{ display: "inline-block", padding: "0.5rem 1rem", background: "#4a90e2", color: "white", "border-radius": "6px", cursor: "pointer" }}>
          {uploading() ? "Uploading…" : "📤 Upload Book"}
          <input type="file" accept=".txt,.pdf,.epub" onChange={handleUpload} style={{ display: "none" }} disabled={uploading()} />
        </label>
      </div>

      {error() && <p style={{ color: "red" }}>{error()}</p>}

      <Show when={books.loading}>
        <p>Loading…</p>
      </Show>

      <Show when={!books.loading && books()?.length === 0}>
        <p style={{ color: "#888" }}>No books yet. Upload a .txt, .pdf, or .epub file to get started.</p>
      </Show>

      <For each={books()}>
        {(book) => (
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", padding: "0.8rem 1rem", "margin-bottom": "0.6rem", background: "#f5f5f5", "border-radius": "8px" }}>
            <span
              style={{ cursor: "pointer", "font-size": "1.05rem", flex: 1 }}
              onClick={() => navigate(`/read/${encodeURIComponent(book.fileId)}`)}
            >
              📖 {book.name}
            </span>
            <button
              onClick={() => handleDelete(book.fileId)}
              style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", "font-size": "1.1rem", "margin-left": "1rem" }}
              title="Delete"
            >
              🗑
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
