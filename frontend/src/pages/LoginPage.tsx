import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { login } from "../lib/api";
import { setToken } from "../lib/token";

export default function LoginPage() {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    try {
      const { token } = await login(username(), password());
      setToken(token);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div>
      <h1>Baron von Reading</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input
            type="text"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>
        {error() && <p style={{ color: "red" }}>{error()}</p>}
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
