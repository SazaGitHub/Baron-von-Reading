import { db } from "../db/schema";

export async function handleBookshelves(req: Request, userId: number): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/bookshelves
  if (req.method === "GET" && url.pathname === "/api/bookshelves") {
    const shelves = db.query("SELECT * FROM bookshelves WHERE user_id = ?").all(userId) as any[];
    for (const shelf of shelves) {
      const books = db.query("SELECT file_id FROM bookshelf_books WHERE bookshelf_id = ?").all(shelf.id) as any[];
      shelf.bookFileIds = books.map(b => b.file_id);
    }
    return new Response(JSON.stringify(shelves), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/bookshelves
  if (req.method === "POST" && url.pathname === "/api/bookshelves") {
    return (async () => {
      try {
        const { name } = await req.json();
        const res = db.query("INSERT INTO bookshelves (user_id, name) VALUES (?, ?) RETURNING id").get(userId, name) as { id: number };
        return new Response(JSON.stringify({ id: res.id, name, bookFileIds: [] }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
      }
    })();
  }

  // DELETE /api/bookshelves/:id
  const shelfIdMatch = url.pathname.match(/^\/api\/bookshelves\/(\d+)$/);
  if (req.method === "DELETE" && shelfIdMatch) {
    const shelfId = parseInt(shelfIdMatch[1], 10);
    // Verify ownership
    const shelf = db.query("SELECT id FROM bookshelves WHERE id = ? AND user_id = ?").get(shelfId, userId);
    if (!shelf) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

    db.run("DELETE FROM bookshelves WHERE id = ?", [shelfId]);
    db.run("DELETE FROM bookshelf_books WHERE bookshelf_id = ?", [shelfId]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/bookshelves/:id/books
  const shelfBooksMatch = url.pathname.match(/^\/api\/bookshelves\/(\d+)\/books$/);
  if (req.method === "POST" && shelfBooksMatch) {
    return (async () => {
      const shelfId = parseInt(shelfBooksMatch[1], 10);
      const shelf = db.query("SELECT id FROM bookshelves WHERE id = ? AND user_id = ?").get(shelfId, userId);
      if (!shelf) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

      const { fileId } = await req.json();
      db.run("INSERT OR IGNORE INTO bookshelf_books (bookshelf_id, file_id) VALUES (?, ?)", [shelfId, fileId]);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    })();
  }

  // DELETE /api/bookshelves/:id/books/:fileId
  const shelfBookRemoveMatch = url.pathname.match(/^\/api\/bookshelves\/(\d+)\/books\/(.+)$/);
  if (req.method === "DELETE" && shelfBookRemoveMatch) {
    const shelfId = parseInt(shelfBookRemoveMatch[1], 10);
    const fileId = decodeURIComponent(shelfBookRemoveMatch[2]);
    
    const shelf = db.query("SELECT id FROM bookshelves WHERE id = ? AND user_id = ?").get(shelfId, userId);
    if (!shelf) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

    db.run("DELETE FROM bookshelf_books WHERE bookshelf_id = ? AND file_id = ?", [shelfId, fileId]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
