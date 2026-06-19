import { createSignal } from "solid-js";
const [token, _setToken] = createSignal(localStorage.getItem("token"));
function setToken(value) {
    if (value === null) {
        localStorage.removeItem("token");
    }
    else {
        localStorage.setItem("token", value);
    }
    _setToken(value);
}
export { token, setToken };
