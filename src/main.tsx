import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
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
