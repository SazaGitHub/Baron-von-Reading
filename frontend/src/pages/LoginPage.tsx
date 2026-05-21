import { createSignal, Show, createResource } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { login, register, getAuthStatus, putSettings } from "../lib/api";
import { setToken } from "../lib/token";
import { settings, setSettings, loadSettings } from "../stores/settingsStore";

export default function LoginPage() {
  const [authStatus] = createResource(getAuthStatus);
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [secret, setSecret] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const navigate = useNavigate();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode() === "register") {
        await register(username(), password(), secret());
      }
      const { token } = await login(username(), password());
      setToken(token);
      await loadSettings();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const bgColor = () => {
    if (settings.theme === "amoled") return "#000000";
    if (settings.theme === "dark") return "#0f172a";
    return "#faf9f6";
  };
  const cardBg = () => {
    if (settings.theme === "amoled") return "#121212";
    if (settings.theme === "dark") return "#1e293b";
    return "#ffffff";
  };
  const fgColor = () => {
    if (settings.theme === "amoled") return "#ffffff";
    if (settings.theme === "dark") return "#f1f5f9";
    return "#2c2c2c";
  };
  const accentColor = "#38bdf8";
  const borderColor = () => {
    if (settings.theme === "light") return "#e2e8f0";
    return "#334155";
  };

  const nextTheme = () => {
    if (settings.theme === "light") return "dark";
    if (settings.theme === "dark") return "amoled";
    return "light";
  };

  const themeLabel = () => {
    if (settings.theme === "light") return "🍦 Cream";
    if (settings.theme === "dark") return "🌙 Blue";
    return "🌑 Amoled";
  };

  return (
    <div style={{ 
      display: "flex", 
      "flex-direction": "column",
      "justify-content": "center", 
      "align-items": "center", 
      "min-height": "100vh", 
      background: bgColor(),
      margin: 0,
      padding: "2rem",
      "font-family": "Inter, sans-serif",
      position: "relative"
    }}>
      <button 
        onClick={async () => {
          const nt = nextTheme();
          const s = { ...settings, theme: nt as any };
          setSettings(s); await putSettings(s).catch(() => {});
        }}
        style={{ 
          position: "absolute",
          top: "2rem",
          right: "2rem",
          background: "transparent",
          border: `1px solid ${borderColor()}`,
          padding: "0.5rem 1rem",
          "border-radius": "8px",
          cursor: "pointer",
          color: fgColor(),
          "font-size": "0.8rem",
          "font-weight": "600",
          transition: "all 0.2s"
        }}
      >
        {themeLabel()}
      </button>
      <div style={{ "margin-bottom": "3rem", "text-align": "center" }}>
        <h2 style={{ 
          margin: 0, 
          "font-family": "'Playfair Display', serif", 
          "font-weight": "900", 
          "font-size": "3.5rem", 
          color: accentColor,
          "text-transform": "uppercase",
          "letter-spacing": "0.15em",
          "text-shadow": "0 10px 20px rgba(0,0,0,0.3), 0 0 40px rgba(56, 189, 248, 0.2)",
          background: `linear-gradient(135deg, ${accentColor} 0%, #0ea5e9 100%)`,
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
          "margin-top": "-0.5rem"
        }}>
          <div style={{ height: "1px", width: "40px", background: `linear-gradient(to right, transparent, ${accentColor})` }}></div>
          <span style={{ 
            "font-family": "'Dancing Script', cursive", 
            "font-size": "1.8rem", 
            color: "#94a3b8",
            "font-style": "italic"
          }}>von</span>
          <div style={{ height: "1px", width: "40px", background: `linear-gradient(to left, transparent, ${accentColor})` }}></div>
        </div>
        <h2 style={{ 
          margin: 0, 
          "font-family": "'Playfair Display', serif", 
          "font-weight": "900", 
          "font-size": "3.5rem", 
          color: fgColor(),
          "text-transform": "uppercase",
          "letter-spacing": "0.15em",
          "margin-top": "-0.5rem",
          "text-shadow": "0 10px 20px rgba(0,0,0,0.3)"
        }}>
          Reading
        </h2>

      </div>

      <div style={{ 
        background: cardBg(), 
        padding: "2.5rem", 
        "border-radius": "16px", 
        width: "360px", 
        color: fgColor(),
        "box-shadow": "0 25px 50px -12px rgba(0,0,0,0.5)",
        border: `1px solid ${borderColor()}`,
        position: "relative",
        "overflow": "hidden"
      }}>
        <div style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          height: "4px", 
          background: `linear-gradient(to right, transparent, ${accentColor}, transparent)` 
        }}></div>
        <form onSubmit={handleSubmit}>
          <div style={{ "margin-bottom": "1.2rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.5rem", "font-size": "0.9rem", opacity: 0.8 }}>Username</label>
            <input
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              required
              style={{ 
                width: "100%", 
                padding: "0.75rem", 
                "border-radius": "8px", 
                border: `1px solid ${borderColor()}`, 
                background: bgColor(), 
                color: fgColor(), 
                "box-sizing": "border-box",
                outline: "none"
              }}

            />
          </div>
          <div style={{ "margin-bottom": "1.5rem" }}>
            <label style={{ display: "block", "margin-bottom": "0.5rem", "font-size": "0.9rem", opacity: 0.8 }}>Password</label>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              style={{ 
                width: "100%", 
                padding: "0.75rem", 
                "border-radius": "8px", 
                border: `1px solid ${borderColor()}`, 
                background: bgColor(), 
                color: fgColor(), 
                "box-sizing": "border-box",
                outline: "none"
              }}

            />
          </div>

          <Show when={mode() === "register" && authStatus()?.registrationSecretRequired}>
            <div style={{ "margin-bottom": "1.5rem" }}>
              <label style={{ display: "block", "margin-bottom": "0.5rem", "font-size": "0.9rem", opacity: 0.8 }}>Registration Secret</label>
              <input
                type="password"
                value={secret()}
                onInput={(e) => setSecret(e.currentTarget.value)}
                required
                placeholder="Ask the admin for the code"
                style={{ 
                  width: "100%", 
                  padding: "0.75rem", 
                  "border-radius": "8px", 
                  border: `1px solid ${borderColor()}`, 
                  background: bgColor(), 
                  color: fgColor(), 
                  "box-sizing": "border-box",
                  outline: "none"
                }}
              />
            </div>
          </Show>

          {error() && (
            <p style={{ 
              color: "#ef4444", 
              "margin-bottom": "1.2rem", 
              "font-size": "0.85rem",
              background: "rgba(239, 68, 68, 0.1)",
              padding: "0.6rem",
              "border-radius": "6px"
            }}>{error()}</p>
          )}
          <button type="submit" style={{ 
            width: "100%", 
            padding: "0.8rem", 
            background: accentColor, 
            border: "none", 
            "border-radius": "8px", 
            color: "#0f172a", 
            cursor: "pointer", 
            "font-size": "1rem", 
            "font-weight": "700",
            "margin-bottom": "1rem",
            transition: "transform 0.1s"
          }}>
            {mode() === "login" ? "Login" : "Register"}
          </button>
          <button
            type="button"
            onClick={() => { setMode(mode() === "login" ? "register" : "login"); setError(null); }}
            style={{ 
              width: "100%", 
              background: "none", 
              border: "none", 
              color: accentColor, 
              cursor: "pointer", 
              "font-size": "0.85rem",
              opacity: 0.8
            }}
          >
            {mode() === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
