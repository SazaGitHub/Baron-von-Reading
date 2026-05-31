import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { createEffect, onMount } from "solid-js";
import { token } from "./lib/token";
import { loadSettings } from "./stores/settingsStore";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";

function App() {
  onMount(() => {
    loadSettings();
  });
  
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <AuthGuard><LibraryPage /></AuthGuard>} />
      <Route path="/read/:fileId" component={() => <AuthGuard><ReaderPage /></AuthGuard>} />
    </Router>
  );
}

function AuthGuard(props: { children: unknown }) {
  createEffect(() => {
    if (token() === null) {
      window.location.href = "/login";
    }
  });
  return <>{props.children}</>;
}

render(() => <App />, document.getElementById("root")!);
