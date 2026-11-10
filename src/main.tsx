import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Applies the remembered colour theme (and the browser bar colour) before the first render.
import "./lib/theme";
import { registerServiceWorker } from "./pwa/register";
import { createApp } from "./router";
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

const app = createApp();
registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App {...app} />
  </StrictMode>,
);
