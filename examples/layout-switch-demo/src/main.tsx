/**
 * Bootstrap of the layout-switch demo.
 *
 * Two steps: compose the builder, then mount the host UI. The wrapper provider
 * is what lets the host's *own* controls — the "+" button, the dialog — read the
 * same builder state the canvas reads; `<NoderaEditor>` supplies its own on top
 * of it, so nothing has to be handed down by hand.
 *
 * The canvas engine's stylesheet is a host concern, exactly as for any other
 * host: it is imported here and kept out of `index.html`.
 */

import "@xyflow/react/dist/style.css";

import { createRoot } from "react-dom/client";

import { NoderaBuilderProvider } from "@nodera/react-flow";

import { LayoutSwitchDemo } from "./app.js";
import { createDemoBuilder } from "./builder.js";

const builder = createDemoBuilder();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(
  <NoderaBuilderProvider builder={builder}>
    <LayoutSwitchDemo builder={builder} />
  </NoderaBuilderProvider>,
);
