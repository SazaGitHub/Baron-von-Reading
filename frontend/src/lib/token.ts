import { createSignal } from "solid-js";

const [token, _setToken] = createSignal<string | null>(
  localStorage.getItem("token")
);

function setToken(value: string | null): void {
  if (value === null) {
    localStorage.removeItem("token");
  } else {
    localStorage.setItem("token", value);
  }
  _setToken(value);
}

export { token, setToken };
