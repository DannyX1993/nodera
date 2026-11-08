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
 * 3. `packages/ui-react/package.json` never depends on
 *    `@nodera/canvas-react-flow`: the React UI layer composes the adapter from
 *    the host's side, it does not own it.
 * 4. No package outside `packages/canvas-react-flow` imports `@xyflow/react`.
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
const CANVAS_ADAPTER = "canvas-react-flow";

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
  { pattern: /^@xyflow(\/|$)/, reason: "React Flow lives in packages/canvas-react-flow" },
  {
    pattern: /^@nodera\/(application|domain)(\/|$)/,
    reason: "the core sits below application/domain and cannot depend on them",
  },
  {
    pattern: /^@nodera\/canvas-react-flow(\/|$)/,
    reason: "the canvas adapter is a presentation sibling, never a core dependency",
  },
];

const REACT_FLOW_SPECIFIER = /^@xyflow(\/|$)/;
const XYFLOW_SUBSTRING = "@xyflow";
const CANVAS_ADAPTER_SPECIFIER = "@nodera/canvas-react-flow";

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
          `packages/ui-react mentions "${XYFLOW_SUBSTRING}" — React Flow stays in packages/${CANVAS_ADAPTER}`,
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

/** Rule 3: ui-react does not depend on the canvas adapter. */
async function checkUiReactDoesNotOwnTheAdapter() {
  const manifest = join(PACKAGES_ROOT, "ui-react", "package.json");
  const text = await readFile(manifest, "utf8");
  const index = text.indexOf(CANVAS_ADAPTER_SPECIFIER);
  if (index === -1) {
    return [];
  }
  return [
    violation(
      manifest,
      lineAt(text, index),
      `packages/ui-react/package.json declares "${CANVAS_ADAPTER_SPECIFIER}" — the adapter is a presentation sibling, not a ui-react dependency`,
    ),
  ];
}

/** Rule 4: React Flow is imported by the canvas adapter only. */
async function checkReactFlowIsAdapterOnly() {
  const entries = await readdir(PACKAGES_ROOT, { withFileTypes: true });
  const violations = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === CANVAS_ADAPTER) {
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
              `packages/${entry.name} imports "${specifier}" — only packages/${CANVAS_ADAPTER} may`,
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
          `packages/${entry.name}/package.json declares "${XYFLOW_SUBSTRING}" — only packages/${CANVAS_ADAPTER} may`,
        ),
      );
    }
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
    label: "ui-react does not depend on @nodera/canvas-react-flow",
    run: checkUiReactDoesNotOwnTheAdapter,
  },
  {
    id: "react-flow-adapter-only",
    label: "no package outside packages/canvas-react-flow imports @xyflow/react",
    run: checkReactFlowIsAdapterOnly,
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
    `\nArchitecture check passed: ${results.length} boundary rules of docs/PROJECT-STRUCTURE.md §7.2 hold.`,
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
