import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
const root = document.getElementById("admin-root");
if (!root) throw Error("Missing admin root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
