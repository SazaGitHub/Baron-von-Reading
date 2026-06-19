import { createSignal, createResource, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getBooks, uploadBook, deleteBook, renameBook, getBookshelves, createBookshelf, deleteBookshelf, addBookToShelf, removeBookFromShelf } from "../lib/api";
import { setToken } from "../lib/token";
import { settings, saveSettings } from "../stores/settingsStore";
export default function LibraryPage() {
    const navigate = useNavigate();
    const [books, { refetch: refetchBooks }] = createResource(getBooks);
    const [shelves, { refetch: refetchShelves }] = createResource(getBookshelves);
    const [uploading, setUploading] = createSignal(false);
    const [error, setError] = createSignal(null);
    const [editingId, setEditingId] = createSignal(null);
    const [editName, setEditName] = createSignal("");
    const [selectedShelfId, setSelectedShelfId] = createSignal(null); // null = All Books
    const [newShelfName, setNewShelfName] = createSignal("");
    const [showAddShelf, setShowShelfInput] = createSignal(false);
    const filteredBooks = () => {
        const all = books() ?? [];
        const shelfId = selectedShelfId();
        if (shelfId === null)
            return all;
        const shelf = shelves()?.find(s => s.id === shelfId);
        if (!shelf)
            return all;
        return all.filter(b => shelf.bookFileIds.includes(b.fileId));
    };
    const handleCreateShelf = async (e) => {
        e.preventDefault();
        const name = newShelfName().trim();
        if (!name)
            return;
        try {
            await createBookshelf(name);
            setNewShelfName("");
            setShowShelfInput(false);
            refetchShelves();
        }
        catch (err) {
            setError("Failed to create bookshelf");
        }
    };
    const handleDeleteShelf = async (id) => {
        if (!confirm("Delete this bookshelf? Books will not be deleted."))
            return;
        try {
            await deleteBookshelf(id);
            if (selectedShelfId() === id)
                setSelectedShelfId(null);
            refetchShelves();
        }
        catch (err) {
            setError("Failed to delete bookshelf");
        }
    };
    const handleToggleBookInShelf = async (fileId, shelfId, inShelf) => {
        try {
            if (inShelf) {
                await removeBookFromShelf(shelfId, fileId);
            }
            else {
                await addBookToShelf(shelfId, fileId);
            }
            refetchShelves();
        }
        catch (err) {
            setError("Failed to update bookshelf");
        }
    };
    const handleUpload = async (e) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setError(null);
        try {
            await uploadBook(file);
            await refetchBooks();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        }
        finally {
            setUploading(false);
            input.value = "";
        }
    };
    const handleRename = async (fileId) => {
        const name = editName().trim();
        if (!name)
            return;
        try {
            await renameBook(fileId, name);
            setEditingId(null);
            await refetchBooks();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Rename failed");
        }
    };
    const startEditing = (book) => {
        setEditingId(book.fileId);
        setEditName(book.displayName || book.name);
    };
    const handleDelete = async (fileId) => {
        if (!confirm(`Delete "${fileId}"?`))
            return;
        try {
            await deleteBook(fileId);
            await refetchBooks();
            await refetchShelves();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        }
    };
    const logout = () => {
        setToken(null);
        navigate("/login");
    };
    const bgColor = () => {
        if (settings.theme === "amoled")
            return "#000000";
        if (settings.theme === "dark")
            return "#0f172a";
        return "#faf9f6";
    };
    const fgColor = () => {
        if (settings.theme === "amoled")
            return "#ffffff";
        if (settings.theme === "dark")
            return "#f1f5f9";
        return "#2c2c2c";
    };
    const cardBg = () => {
        if (settings.theme === "amoled")
            return "#121212";
        if (settings.theme === "dark")
            return "#1e293b";
        return "#ffffff";
    };
    const borderColor = () => {
        if (settings.theme === "light")
            return "#e2e8f0";
        return "#334155";
    };
    const nextTheme = () => {
        if (settings.theme === "light")
            return "dark";
        if (settings.theme === "dark")
            return "amoled";
        return "light";
    };
    const themeLabel = () => {
        if (settings.theme === "light")
            return "🍦 Cream";
        if (settings.theme === "dark")
            return "🌙 Blue";
        return "🌑 Amoled";
    };
    return (<div style={{ "min-height": "100vh", background: bgColor(), color: fgColor(), transition: "all 0.2s" }}>
      <div style={{ "max-width": "800px", margin: "0 auto", padding: "3rem 2rem", "font-family": "Inter, sans-serif" }}>
        
        <div style={{ "margin-bottom": "4rem", "text-align": "center", position: "relative" }}>
          <button onClick={() => {
            saveSettings({ theme: nextTheme() });
        }} style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: "transparent",
            border: `1px solid ${borderColor()}`,
            padding: "0.5rem 1rem",
            "border-radius": "8px",
            cursor: "pointer",
            color: fgColor(),
            "font-size": "0.8rem",
            "font-weight": "600",
            transition: "all 0.2s"
        }}>
            {themeLabel()}
          </button>
          <h2 style={{
            margin: 0,
            "font-family": "'Playfair Display', serif",
            "font-weight": "900",
            "font-size": "2.8rem",
            color: "#38bdf8",
            "text-transform": "uppercase",
            "letter-spacing": "0.15em",
            "text-shadow": "0 10px 20px rgba(0,0,0,0.1)",
            background: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
            "-webkit-background-clip": "text",
            "-webkit-text-fill-color": "transparent"
        }}>
            Baron
          </h2>
          <div style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            gap: "1rem",
            "margin-top": "-0.3rem"
        }}>
            <div style={{ height: "1px", width: "30px", background: "linear-gradient(to right, transparent, #38bdf8)" }}></div>
            <span style={{
            "font-family": "'Dancing Script', cursive",
            "font-size": "1.4rem",
            color: "#94a3b8",
            "font-style": "italic"
        }}>von</span>
            <div style={{ height: "1px", width: "30px", background: "linear-gradient(to left, transparent, #38bdf8)" }}></div>
          </div>
          <h2 style={{
            margin: 0,
            "font-family": "'Playfair Display', serif",
            "font-weight": "900",
            "font-size": "2.8rem",
            color: fgColor(),
            "text-transform": "uppercase",
            "letter-spacing": "0.15em",
            "margin-top": "-0.3rem",
            "text-shadow": "0 10px 20px rgba(0,0,0,0.1)"
        }}>
            Reading
          </h2>
        </div>

        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "2.5rem", padding: "1.5rem", background: cardBg(), "border-radius": "16px", border: `1px solid ${borderColor()}`, "box-shadow": "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <h1 style={{ margin: 0, "font-size": "1.4rem", "font-weight": "700", "letter-spacing": "-0.025em", opacity: 0.9 }}>📚 Library</h1>
          <button onClick={logout} style={{
            background: "transparent",
            border: `1px solid ${borderColor()}`,
            padding: "0.5rem 1rem",
            "border-radius": "8px",
            cursor: "pointer",
            color: fgColor(),
            "font-size": "0.9rem",
            transition: "all 0.2s"
        }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#38bdf8"; e.currentTarget.style.color = "#38bdf8"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = borderColor(); e.currentTarget.style.color = fgColor(); }}>
            Logout
          </button>
        </div>

        <div style={{ "margin-bottom": "2rem" }}>
          <label style={{
            display: "inline-flex",
            "align-items": "center",
            padding: "0.6rem 1.2rem",
            background: "#38bdf8",
            color: "#0f172a",
            "border-radius": "8px",
            cursor: "pointer",
            "font-weight": "600",
            "box-shadow": "0 2px 4px rgba(0,0,0,0.1)",
            transition: "transform 0.1s, background 0.2s"
        }}>
            {uploading() ? "Uploading…" : "📤 Upload Book"}
            <input type="file" accept=".txt,.pdf,.epub" onChange={handleUpload} style={{ display: "none" }} disabled={uploading()}/>
          </label>
        </div>

        {error() && (<p style={{
                color: "#ef4444",
                padding: "0.8rem",
                background: "rgba(239, 68, 68, 0.1)",
                "border-radius": "8px",
                "margin-bottom": "1.5rem",
                "font-size": "0.9rem"
            }}>
            {error()}
          </p>)}

        <Show when={books.loading}>
          <p style={{ opacity: 0.6 }}>Loading your library…</p>
        </Show>

        <Show when={!books.loading && books()?.length === 0}>
          <div style={{ "text-align": "center", padding: "4rem 0", color: "#64748b" }}>
            <p style={{ "font-size": "1.1rem" }}>No books yet.</p>
            <p style={{ "font-size": "0.9rem" }}>Upload a .txt, .pdf, or .epub file to get started.</p>
          </div>
        </Show>

          <div style={{ display: "flex", gap: "0.5rem", "margin-bottom": "2rem", "flex-wrap": "wrap", "align-items": "center" }}>
            <button onClick={() => setSelectedShelfId(null)} style={{
            padding: "0.4rem 1rem", "border-radius": "20px", border: "none", cursor: "pointer",
            background: selectedShelfId() === null ? "#38bdf8" : "rgba(0,0,0,0.05)",
            color: selectedShelfId() === null ? "#0f172a" : fgColor(),
            "font-weight": "600", "font-size": "0.85rem"
        }}>
              All Books
            </button>
            <For each={shelves()}>{(shelf) => (<div style={{ position: "relative", display: "inline-flex", "align-items": "center" }}>
                <button onClick={() => setSelectedShelfId(shelf.id)} style={{
                padding: "0.4rem 1rem", "border-radius": "20px", border: "none", cursor: "pointer",
                background: selectedShelfId() === shelf.id ? "#38bdf8" : "rgba(0,0,0,0.05)",
                color: selectedShelfId() === shelf.id ? "#0f172a" : fgColor(),
                "font-weight": "600", "font-size": "0.85rem"
            }}>
                  📁 {shelf.name}
                </button>
                <Show when={selectedShelfId() === shelf.id}>
                  <button onClick={() => handleDeleteShelf(shelf.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", "margin-left": "0.3rem", "font-size": "0.8rem" }}>×</button>
                </Show>
              </div>)}</For>
            <Show when={!showAddShelf()} fallback={<form onSubmit={handleCreateShelf} style={{ display: "flex", gap: "0.4rem" }}>
                <input autofocus type="text" value={newShelfName()} onInput={(e) => setNewShelfName(e.currentTarget.value)} placeholder="Shelf name..." style={{ padding: "0.3rem 0.6rem", "border-radius": "6px", border: `1px solid ${borderColor()}`, background: bgColor(), color: fgColor(), "font-size": "0.85rem" }}/>
                <button type="submit" style={{ background: "#38bdf8", border: "none", "border-radius": "6px", padding: "0 0.6rem", cursor: "pointer" }}>OK</button>
                <button onClick={() => setShowShelfInput(false)} style={{ background: "none", border: "none", color: fgColor(), cursor: "pointer" }}>Cancel</button>
              </form>}>
              <button onClick={() => setShowShelfInput(true)} style={{ padding: "0.4rem 1rem", "border-radius": "20px", border: "1px dashed #38bdf8", background: "none", color: "#38bdf8", cursor: "pointer", "font-size": "0.85rem" }}>+ New Shelf</button>
            </Show>
          </div>

          <div style={{ display: "grid", gap: "0.75rem" }}>
            <For each={filteredBooks()}>
              {(book) => (<div style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "1rem 1.25rem",
                background: cardBg(),
                "border-radius": "12px",
                border: `1px solid ${borderColor()}`,
                "box-shadow": "0 1px 3px rgba(0,0,0,0.05)",
                transition: "transform 0.2s, border-color 0.2s"
            }}>
                  <Show when={editingId() === book.fileId} fallback={<span style={{ cursor: "pointer", "font-size": "1.05rem", flex: 1, "font-weight": "500" }} onClick={() => navigate(`/read/${encodeURIComponent(book.fileId)}`)}>
                        {book.fileId.endsWith(".pdf") ? "📕" : book.fileId.endsWith(".epub") ? "📗" : "📄"} {book.displayName || book.name}
                      </span>}>
                    <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
                      <input type="text" value={editName()} onInput={(e) => setEditName(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && handleRename(book.fileId)} style={{
                flex: 1,
                padding: "0.4rem 0.8rem",
                "border-radius": "6px",
                border: `1px solid ${borderColor()}`,
                background: bgColor(),
                color: fgColor(),
                "font-size": "0.9rem"
            }} autofocus/>
                      <button onClick={() => handleRename(book.fileId)} style={{ background: "#38bdf8", color: "#0f172a", border: "none", "border-radius": "6px", padding: "0 0.8rem", cursor: "pointer", "font-weight": "600" }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ background: "transparent", color: fgColor(), border: `1px solid ${borderColor()}`, "border-radius": "6px", padding: "0 0.8rem", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </Show>

                  <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.2rem" }}>
                      <For each={shelves()}>{(shelf) => (<button onClick={() => handleToggleBookInShelf(book.fileId, shelf.id, shelf.bookFileIds.includes(book.fileId))} title={shelf.bookFileIds.includes(book.fileId) ? `Remove from ${shelf.name}` : `Add to ${shelf.name}`} style={{
                    background: shelf.bookFileIds.includes(book.fileId) ? "#38bdf8" : "rgba(0,0,0,0.05)",
                    border: "none",
                    "border-radius": "4px", padding: "0.1rem 0.3rem", cursor: "pointer", "font-size": "0.6rem",
                    color: shelf.bookFileIds.includes(book.fileId) ? "#0f172a" : fgColor(), opacity: 0.7
                }}>
                          {shelf.name.substring(0, 3)}
                        </button>)}</For>
                    </div>
                    <Show when={editingId() !== book.fileId}>
                      <button onClick={() => startEditing(book)} style={{ background: "none", border: "none", cursor: "pointer", "font-size": "1.1rem", opacity: 0.5 }} title="Rename">
                        ✏️
                      </button>
                    </Show>
                    <button onClick={() => handleDelete(book.fileId)} style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                "font-size": "1.2rem",
                padding: "0.4rem",
                transition: "color 0.2s"
            }} onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"} onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"} title="Delete">
                      🗑
                    </button>
                  </div>
                </div>)}
            </For>
            <Show when={filteredBooks().length === 0 && !books.loading}>
              <p style={{ "text-align": "center", opacity: 0.5, padding: "2rem" }}>No books found in this shelf.</p>
            </Show>
          </div>
      </div>
    </div>);
}
