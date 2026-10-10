import "../../../styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
// biome-ignore lint/suspicious/noAssignInExpressions: Bun HMR requires direct `import.meta.hot.data` access
(import.meta.hot.data.root ??= createRoot(el)).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
