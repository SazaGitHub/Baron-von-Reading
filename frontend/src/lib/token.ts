import { createSignal } from "solid-js";

const [token, setToken] = createSignal<string | null>(
  localStorage.getItem("token")
);

export { token, setToken };
