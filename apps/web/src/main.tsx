/**
 * The page: mounts the app over the real browser.
 *
 * This is the only file that both reaches for a platform object and renders,
 * which is why the two lines that do it are here rather than anywhere a
 * component might be tempted to copy them.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { browserStore, newTabId, registerServiceWorker, tabPresence } from "./platform.js";
import "@repo/ui/nodes.css";
import "./app.css";

const host = document.getElementById("root");
if (host === null) throw new Error("no mount point");

const { store, persistent } = browserStore();

createRoot(host).render(
  <StrictMode>
    <App store={store} presence={tabPresence(newTabId())} persistent={persistent} />
  </StrictMode>,
);

/**
 * Registered from a module rather than a snippet written into the page, so the
 * built site needs no inline script and no policy exception for one. The dev
 * server has no generated worker to register.
 */
if (import.meta.env.PROD) registerServiceWorker();
