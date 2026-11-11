/**
 * Bootstrap of the Phase 7 demo host.
 *
 * It composes the builder — the whole integration of a host application — and
 * mounts the demo. There is no second wiring step: the React binding reads the
 * builder's state, registries and renderers, so nothing but the builder and the
 * manager that installed its plugins reaches the UI.
 *
 * The canvas engine's stylesheet is a host concern, as for any other host: the
 * demo imports it here and keeps no copy in `index.html`. It is the only thing
 * taken from `@xyflow/react` — never a component, and never an internal
 * `@nodera/*` package.
 */

import "@xyflow/react/dist/style.css";

import { createRoot } from "react-dom/client";

import { createDemoBuilder, demoPluginManager } from "./builder.js";
import { DemoApp } from "./demo-app.js";

const builder = createDemoBuilder();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(<DemoApp builder={builder} manager={demoPluginManager(builder)} />);
