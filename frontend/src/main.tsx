import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";

render(
  () => (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={LibraryPage} />
      <Route path="/read/:fileId" component={ReaderPage} />
    </Router>
  ),
  document.getElementById("root")!
);
