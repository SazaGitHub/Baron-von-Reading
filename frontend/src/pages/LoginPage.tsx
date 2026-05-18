import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { login, register } from "../lib/api";
import { setToken } from "../lib/token";
import { loadSettings } from "../stores/settingsStore";

export default function LoginPage() {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const navigate = useNavigate();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode() === "register") {
        await register(username(), password());
      }
      const { token } = await login(username(), password());
      setToken(token);
      await loadSettings();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div style={{ display: "flex", "justify-content": "center", "align-items": "center", "min-height": "100vh", background: "#1a1a2e" }}>
      <div style={{ background: "#16213e", padding: "2rem", "border-radius": "12px", width: "320px", color: "#eee" }}>
        <h1 style={{ "text-align": "center", "margin-bottom": "1.5rem", "font-size": "1.4rem" }}>📖 Baron von Reading</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ "margin-bottom": "1rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.4rem", "font-size": "0.9rem" }}>Username</label>
            <input
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              required
              style={{ width: "100%", padding: "0.5rem", "border-radius": "6px", border: "1px solid #444", background: "#0f3460", color: "#eee", "box-sizing": "border-box" }}
            />
          </div>
          <div style={{ "margin-bottom": "1rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.4rem", "font-size": "0.9rem" }}>Password</label>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              style={{ width: "100%", padding: "0.5rem", "border-radius": "6px", border: "1px solid #444", background: "#0f3460", color: "#eee", "box-sizing": "border-box" }}
            />
          </div>
          {error() && <p style={{ color: "#ff6b6b", "margin-bottom": "1rem", "font-size": "0.85rem" }}>{error()}</p>}
          <button type="submit" style={{ width: "100%", padding: "0.6rem", background: "#e94560", border: "none", "border-radius": "6px", color: "white", cursor: "pointer", "font-size": "1rem", "margin-bottom": "0.8rem" }}>
            {mode() === "login" ? "Login" : "Register"}
          </button>
          <button
            type="button"
            onClick={() => { setMode(mode() === "login" ? "register" : "login"); setError(null); }}
            style={{ width: "100%", background: "none", border: "none", color: "#aaa", cursor: "pointer", "font-size": "0.85rem" }}
          >
            {mode() === "login" ? "New here? Register" : "Already have an account? Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
