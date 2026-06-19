import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { createEffect, onMount, lazy } from "solid-js";
import { token } from "./lib/token";
import { loadSettings } from "./stores/settingsStore";
const LoginPage = lazy(() => import("./pages/LoginPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));
function App() {
    onMount(() => {
        loadSettings();
    });
    return (<Router>
      <Route path="/login" component={LoginPage}/>
      <Route path="/" component={() => <AuthGuard><LibraryPage /></AuthGuard>}/>
      <Route path="/read/:fileId" component={() => <AuthGuard><ReaderPage /></AuthGuard>}/>
    </Router>);
}
function AuthGuard(props) {
    createEffect(() => {
        if (token() === null) {
            window.location.href = "/login";
        }
    });
    return <>{props.children}</>;
}
render(() => <App />, document.getElementById("root"));
