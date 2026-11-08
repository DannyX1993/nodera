#!/usr/bin/env node
/**
 * Executable architecture bans of the presentation layer.
 *
 * `docs/PROJECT-STRUCTURE.md` §7.2 documents the package boundaries of the
 * Phase 5 UI layer. A documented rule is not enforced by documentation alone,
 * so this script turns those sentences into a check the repository can run:
 *
 * 1. `packages/{ui-core,theme-engine,layout-engine}/src` are framework-free:
 *    they may not import React, a DOM-only module, React Flow, or the
 *    application/domain packages. They hold contracts, data and pure functions.
 * 2. `packages/ui-react/src` and its `package.json` never mention
 *    `@xyflow`. React Flow stays inside the canvas adapter.
 * 3. `packages/ui-react` never references `@nodera/react-flow` — neither in its
 *    sources nor in its `package.json`: the React UI layer composes the adapter
 *    from the host's side, it does not own it.
 * 4. No package outside `packages/react-flow` imports `@xyflow/react`.
 * 5. `packages/sdk` is framework- and engine-free: its sources never import
 *    React, React DOM, `@nodera/ui-react`, `@nodera/react-flow` or `@xyflow`,
 *    and its manifest never declares them. The public SDK composes the
 *    framework-free core only; presentation arrives through a binding.
 * 6. `packages/react-flow` declares `@nodera/sdk` and its SDK binding layer
 *    composes a builder through it: the binding never imports
 *    `@nodera/domain`, `@nodera/application` or `@nodera/document` directly.
 *    Builder composition has one surface, and it is the public SDK.
 *
 * Plain Node ESM, builtins only: the check must be runnable without installing
 * anything and without a bundler (`node scripts/check-architecture.mjs`).
 *
 * Output is a one-line status per rule plus the offending files of the first
 * failing rule; the process exits non-zero as soon as a rule is violated.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = join(REPO_ROOT, "packages");
/** The React Flow integration: canvas adapter plus SDK binding in one package. */
const REACT_FLOW_PACKAGE = "react-flow";

/** Source extensions the check reads. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

/** Framework-free packages of the presentation layer (D1). */
const CORE_PACKAGES = ["ui-core", "theme-engine", "layout-engine"];

/**
 * Modules a framework-free package may never import.
 *
 * Each entry pairs the specifier pattern with the sentence of
 * `docs/PROJECT-STRUCTURE.md` §7.2 it enforces, so a failure explains itself.
 */
const CORE_FORBIDDEN_MODULES = [
  { pattern: /^react$/, reason: "React belongs to @nodera/ui-react" },
  { pattern: /^react\//, reason: "React belongs to @nodera/ui-react" },
  { pattern: /^react-dom(\/|$)/, reason: "DOM-only module; the core has no DOM" },
  { pattern: /^@testing-library\//, reason: "DOM-only test tooling; the core tests run headless" },
  { pattern: /^(jsdom|happy-dom|global-jsdom)$/, reason: "DOM-only module; the core has no DOM" },
  { pattern: /^@xyflow(\/|$)/, reason: "React Flow lives in packages/react-flow" },
  {
    pattern: /^@nodera\/(application|domain)(\/|$)/,
    reason: "the core sits below application/domain and cannot depend on them",
  },
  {
    pattern: /^@nodera\/react-flow(\/|$)/,
    reason: "the React Flow integration is a presentation sibling, never a core dependency",
  },
];

const REACT_FLOW_SPECIFIER = /^@xyflow(\/|$)/;
const XYFLOW_SUBSTRING = "@xyflow";
const REACT_FLOW_SPECIFIER_NAME = "@nodera/react-flow";
const SDK_SPECIFIER_NAME = "@nodera/sdk";

/** Import forms the check understands (`from` imports, side effects, dynamic, require). */
const SPECIFIER_PATTERNS = [
  /(?:^|[^\w$.])from\s*["']([^"']+)["']/g,
  /(?:^|[^\w$.])import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /(?:^|[^\w$.])require\s*\(\s*["']([^"']+)["']\s*\)/g,
  /(?:^|[^\w$.])import\s*["']([^"']+)["']/g,
];

/** One violation: where it is and what rule it breaks. */
function violation(file, line, detail) {
  return { file: relative(REPO_ROOT, file), line, detail };
}

/** Source files below a directory, recursively. */
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files.sort();
}

/** Line of a character offset, 1-based. */
function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** Module specifiers imported by one source text, with their line. */
function moduleSpecifiers(text) {
  const found = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push({ specifier, line: lineAt(text, match.index) });
      }
      match = pattern.exec(text);
    }
  }
  return found;
}

/** Reads a package's `src` sources; a missing package is a violation. */
async function packageSources(packageName) {
  const directory = join(PACKAGES_ROOT, packageName, "src");
  try {
    await readdir(directory);
  } catch {
    return { directory, files: [], missing: true };
  }
  return { directory, files: await sourceFiles(directory), missing: false };
}

/** Rule 1: the framework-free packages stay framework-free. */
async function checkFrameworkFreeCore() {
  const violations = [];
  for (const packageName of CORE_PACKAGES) {
    const { files, missing } = await packageSources(packageName);
    if (missing) {
      violations.push(
        violation(
          join(PACKAGES_ROOT, packageName, "src"),
          0,
          `packages/${packageName}/src is missing, so its boundaries cannot be checked`,
        ),
      );
      continue;
    }
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const { specifier, line } of moduleSpecifiers(text)) {
        const banned = CORE_FORBIDDEN_MODULES.find((rule) => rule.pattern.test(specifier));
        if (banned !== undefined) {
          violations.push(
            violation(
              file,
              line,
              `packages/${packageName} imports "${specifier}" — ${banned.reason}`,
            ),
          );
        }
      }
    }
  }
  return violations;
}

/**
 * Rule 2: `@nodera/ui-react` never references React Flow.
 *
 * The source scan is a plain substring search on purpose: a comment, a type
 * import or a test-only import would bind ui-react to the adapter just as hard
 * as runtime code.
 */
async function checkUiReactIgnoresReactFlow() {
  const violations = [];
  const { files } = await packageSources("ui-react");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const index = text.indexOf(XYFLOW_SUBSTRING);
    if (index !== -1) {
      violations.push(
        violation(
          file,
          lineAt(text, index),
          `packages/ui-react mentions "${XYFLOW_SUBSTRING}" — React Flow stays in packages/${REACT_FLOW_PACKAGE}`,
        ),
      );
    }
  }

  const manifest = join(PACKAGES_ROOT, "ui-react", "package.json");
  const manifestText = await readFile(manifest, "utf8");
  const manifestIndex = manifestText.indexOf(XYFLOW_SUBSTRING);
  if (manifestIndex !== -1) {
    violations.push(
      violation(
        manifest,
        lineAt(manifestText, manifestIndex),
        `packages/ui-react/package.json declares "${XYFLOW_SUBSTRING}" as a dependency`,
      ),
    );
  }
  return violations;
}

/**
 * Rule 3: ui-react neither imports nor depends on the React Flow integration.
 *
 * Both halves matter: `ui-react` is the only engine-agnostic React package, so a
 * source import would bind it to React Flow just as hard as a manifest entry.
 */
async function checkUiReactDoesNotOwnTheAdapter() {
  const violations = [];
  const { files } = await packageSources("ui-react");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const index = text.indexOf(REACT_FLOW_SPECIFIER_NAME);
    if (index !== -1) {
      violations.push(
        violation(
          file,
          lineAt(text, index),
          `packages/ui-react imports "${REACT_FLOW_SPECIFIER_NAME}" — the React Flow integration is a presentation sibling, not a ui-react dependency`,
        ),
      );
    }
  }

  const manifest = join(PACKAGES_ROOT, "ui-react", "package.json");
  const text = await readFile(manifest, "utf8");
  const index = text.indexOf(REACT_FLOW_SPECIFIER_NAME);
  if (index !== -1) {
    violations.push(
      violation(
        manifest,
        lineAt(text, index),
        `packages/ui-react/package.json declares "${REACT_FLOW_SPECIFIER_NAME}" — the React Flow integration is a presentation sibling, not a ui-react dependency`,
      ),
    );
  }
  return violations;
}

/** Rule 4: React Flow is imported by the React Flow integration only. */
async function checkReactFlowIsAdapterOnly() {
  const entries = await readdir(PACKAGES_ROOT, { withFileTypes: true });
  const violations = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === REACT_FLOW_PACKAGE) {
      continue;
    }
    const { files } = await packageSources(entry.name);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const { specifier, line } of moduleSpecifiers(text)) {
        if (REACT_FLOW_SPECIFIER.test(specifier)) {
          violations.push(
            violation(
              file,
              line,
              `packages/${entry.name} imports "${specifier}" — only packages/${REACT_FLOW_PACKAGE} may`,
            ),
          );
        }
      }
    }

    const manifest = join(PACKAGES_ROOT, entry.name, "package.json");
    const manifestText = await readFile(manifest, "utf8").catch(() => "");
    const index = manifestText.indexOf(XYFLOW_SUBSTRING);
    if (index !== -1) {
      violations.push(
        violation(
          manifest,
          lineAt(manifestText, index),
          `packages/${entry.name}/package.json declares "${XYFLOW_SUBSTRING}" — only packages/${REACT_FLOW_PACKAGE} may`,
        ),
      );
    }
  }
  return violations;
}

/** The framework-free public SDK. */
const SDK_PACKAGE = "sdk";

/**
 * Modules `packages/sdk` may never import.
 *
 * Matched against real module specifiers and manifest keys, never against free
 * text: adapter ids such as `nodera.react-flow` are data and must stay legal.
 */
const SDK_FORBIDDEN_MODULES = [
  { pattern: /^react$/, reason: "React belongs to @nodera/react-flow" },
  { pattern: /^react\//, reason: "React belongs to @nodera/react-flow" },
  { pattern: /^react-dom(\/|$)/, reason: "the SDK runs headless, with no DOM" },
  { pattern: /^@nodera\/ui-react(\/|$)/, reason: "the SDK is framework-free; presentation belongs to a binding" },
  {
    pattern: /^@nodera\/react-flow(\/|$)/,
    reason: "the SDK is engine-free; the React Flow integration belongs to a binding",
  },
  { pattern: /^@xyflow(\/|$)/, reason: "React Flow lives in packages/react-flow" },
];

/** Manifest dependency fields the SDK rule inspects. */
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** Reads a package manifest, or `undefined` when the package has none. */
async function readManifest(packageName) {
  const path = join(PACKAGES_ROOT, packageName, "package.json");
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) {
    return undefined;
  }
  return { path, text, json: JSON.parse(text) };
}

/** Rule 5: the public SDK never reaches a framework or an engine. */
async function checkSdkIsFrameworkFree() {
  const violations = [];
  const { files } = await packageSources(SDK_PACKAGE);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const { specifier, line } of moduleSpecifiers(text)) {
      const forbidden = SDK_FORBIDDEN_MODULES.find((entry) => entry.pattern.test(specifier));
      if (forbidden !== undefined) {
        violations.push(
          violation(file, line, `packages/${SDK_PACKAGE} imports "${specifier}" — ${forbidden.reason}`),
        );
      }
    }
  }

  const manifest = await readManifest(SDK_PACKAGE);
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest?.json[field] ?? {})) {
      const forbidden = SDK_FORBIDDEN_MODULES.find((entry) => entry.pattern.test(name));
      if (forbidden !== undefined) {
        const index = manifest.text.indexOf(`"${name}"`);
        violations.push(
          violation(
            manifest.path,
            index === -1 ? 1 : lineAt(manifest.text, index),
            `packages/${SDK_PACKAGE}/package.json declares "${name}" — ${forbidden.reason}`,
          ),
        );
      }
    }
  }
  return violations;
}

/**
 * The SDK binding layer of `packages/react-flow`.
 *
 * The package has two layers (docs/PROJECT-STRUCTURE.md §7.3): the canvas
 * adapter (`src/canvas`, `src/map`, `src/registries`, `src/renderers`) may use
 * `@nodera/application` and the model packages, because it translates the
 * portable graph into the engine and the engine into use cases. The binding
 * (`src/adapter`, `src/providers`, `src/editor`, `src/vocabulary.ts` and
 * `src/renderers/renderer-set.ts`) only composes a `Builder`.
 */
const REACT_FLOW_BINDING_LAYER = [
  "src/adapter",
  "src/providers",
  "src/editor",
  "src/renderers/renderer-set.ts",
  "src/vocabulary.ts",
];

/**
 * Modules the binding layer may never import.
 *
 * Builder composition is the SDK's job. If the binding reached into the domain,
 * the application use cases or the document packages itself, the public SDK
 * could drift from what the binding actually does and `builder.*` would stop
 * being the single composition surface — the invariant §7.3 describes.
 */
const BINDING_FORBIDDEN_MODULES = [
  { pattern: /^@nodera\/domain(\/|$)/, reason: "compose a builder through @nodera/sdk" },
  { pattern: /^@nodera\/application(\/|$)/, reason: "compose a builder through @nodera/sdk" },
  { pattern: /^@nodera\/document(\/|$)/, reason: "compose a builder through @nodera/sdk" },
];

/** Rule 6: the React Flow integration composes builders through the SDK. */
async function checkReactFlowConsumesTheSdk() {
  const manifest = await readManifest(REACT_FLOW_PACKAGE);
  if (manifest === undefined) {
    return [
      violation(
        join(PACKAGES_ROOT, REACT_FLOW_PACKAGE),
        1,
        `packages/${REACT_FLOW_PACKAGE} is missing, so its SDK contract cannot be checked`,
      ),
    ];
  }

  const violations = [];
  const declared = {
    ...(manifest.json.dependencies ?? {}),
    ...(manifest.json.peerDependencies ?? {}),
  };
  if (!(SDK_SPECIFIER_NAME in declared)) {
    violations.push(
      violation(
        manifest.path,
        1,
        `packages/${REACT_FLOW_PACKAGE} must declare "${SDK_SPECIFIER_NAME}": its binding layer composes a builder through the SDK`,
      ),
    );
  }

  const packageRoot = join(PACKAGES_ROOT, REACT_FLOW_PACKAGE);
  const { files } = await packageSources(REACT_FLOW_PACKAGE);
  let importsTheSdk = false;
  for (const file of files) {
    const inside = relative(packageRoot, file).replaceAll("\\", "/");
    const inBindingLayer = REACT_FLOW_BINDING_LAYER.some(
      (entry) => inside === entry || inside.startsWith(`${entry}/`),
    );
    if (!inBindingLayer) {
      continue;
    }
    const text = await readFile(file, "utf8");
    for (const { specifier, line } of moduleSpecifiers(text)) {
      if (specifier === SDK_SPECIFIER_NAME) {
        importsTheSdk = true;
      }
      const forbidden = BINDING_FORBIDDEN_MODULES.find((entry) => entry.pattern.test(specifier));
      if (forbidden !== undefined) {
        violations.push(
          violation(file, line, `the binding layer imports "${specifier}" — ${forbidden.reason}`),
        );
      }
    }
  }
  if (!importsTheSdk) {
    violations.push(
      violation(
        join(packageRoot, "src"),
        1,
        `no binding-layer source imports "${SDK_SPECIFIER_NAME}": builder composition must go through the SDK`,
      ),
    );
  }
  return violations;
}

/** Rules the script enforces, in reporting order. */
const RULES = [
  {
    id: "core-framework-free",
    label:
      "ui-core, theme-engine and layout-engine import no React, DOM-only module, React Flow, application or domain",
    run: checkFrameworkFreeCore,
  },
  {
    id: "ui-react-ignores-react-flow",
    label: "ui-react sources and package.json never reference @xyflow",
    run: checkUiReactIgnoresReactFlow,
  },
  {
    id: "ui-react-owns-no-adapter",
    label: "ui-react neither imports nor depends on @nodera/react-flow",
    run: checkUiReactDoesNotOwnTheAdapter,
  },
  {
    id: "react-flow-adapter-only",
    label: "no package outside packages/react-flow imports @xyflow/react",
    run: checkReactFlowIsAdapterOnly,
  },
  {
    id: "sdk-framework-free",
    label: "packages/sdk imports no React, React Flow, ui-react or @nodera/react-flow",
    run: checkSdkIsFrameworkFree,
  },
  {
    id: "react-flow-consumes-the-sdk",
    label: "packages/react-flow declares @nodera/sdk and its binding composes through it",
    run: checkReactFlowConsumesTheSdk,
  },
];

const results = [];
for (const rule of RULES) {
  results.push({ rule, violations: await rule.run() });
}

for (const { rule, violations } of results) {
  console.log(`${violations.length === 0 ? "PASS" : "FAIL"}  ${rule.id} — ${rule.label}`);
}

const failed = results.filter((result) => result.violations.length > 0);
if (failed.length === 0) {
  console.log(
    `\nArchitecture check passed: ${results.length} boundary rules of docs/PROJECT-STRUCTURE.md §7.2-7.3 hold.`,
  );
  process.exit(0);
}

const first = failed[0];
console.log(`\nArchitecture check failed on "${first.rule.id}": ${first.rule.label}`);
for (const entry of first.violations) {
  console.log(`  ${entry.file}:${entry.line}  ${entry.detail}`);
}
if (failed.length > 1) {
  console.log(
    `\n${failed.length - 1} further rule(s) also failed: ${failed
      .slice(1)
      .map((result) => result.rule.id)
      .join(", ")}`,
  );
}
process.exit(1);
