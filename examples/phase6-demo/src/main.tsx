/**
 * Bootstrap of the Phase 6 demo host.
 *
 * It composes the builder (the whole integration of a host application) and
 * mounts the demo. There is no second wiring step: the React binding reads the
 * builder's state, registries and renderers, so nothing has to be handed to the
 * UI besides the builder itself.
 */

import { createRoot } from "react-dom/client";

import { createDemoBuilder } from "./builder.js";
import { DemoApp } from "./demo-app.js";

const builder = createDemoBuilder();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(<DemoApp builder={builder} />);
