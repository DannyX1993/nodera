/**
 * Guard for the demo's import rule.
 *
 * The Phase 6 demo exists to prove one claim: a host application can be built
 * on the public SDK alone. That claim is a property of the imports, so it is
 * checked instead of trusted.
 *
 * Two rules:
 *
 * - a specifier of an internal `@nodera/*` package is allowed only for
 *   `@nodera/sdk` and `@nodera/react`, the two published packages;
 * - an `@xyflow/react` import is allowed only for its stylesheet, because the
 *   engine is a host concern the React binding owns (D21).
 *
 * The specifiers come from TypeScript's own preprocessor, so a path quoted
 * inside a comment or a string is never mistaken for an import. The script is a
 * plain Node script (`node src/imports.test.ts`, wired as this package's `test`
 * script) because the demo has no test runner: `typescript` is already a
 * devDependency here, and `ts.sys` reads the sources with the same parser the
 * build uses.
 */

import ts from "typescript";

/** Prefix of the internal workspace packages. */
const WORKSPACE_PREFIX = "@nodera/";

/** The only internal packages a host application may import. */
const ALLOWED_WORKSPACE_PACKAGES: readonly string[] = ["@nodera/sdk", "@nodera/react"];

/** Prefix of the canvas engine packages. */
const ENGINE_PREFIX = "@xyflow/";

/** The only engine import the demo may make: the stylesheet the host loads. */
const ALLOWED_ENGINE_SPECIFIER = "@xyflow/react/dist/style.css";

/** One import the demo may not make. */
interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: string;
}

/** Every import specifier of one source, parsed and never substring-matched. */
function importSpecifiers(source: string): readonly string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
}

/** The import-rule violations of one source file. */
function violationsIn(file: string, source: string): readonly Violation[] {
  const violations: Violation[] = [];
  for (const specifier of importSpecifiers(source)) {
    if (
      specifier.startsWith(WORKSPACE_PREFIX) &&
      !ALLOWED_WORKSPACE_PACKAGES.includes(specifier)
    ) {
      violations.push({ file, specifier, reason: "internal workspace package" });
      continue;
    }
    if (specifier.startsWith(ENGINE_PREFIX) && specifier !== ALLOWED_ENGINE_SPECIFIER) {
      violations.push({ file, specifier, reason: "engine import other than its stylesheet" });
    }
  }
  return violations;
}

/** Absolute path of the directory this script lives in (`.../src/`). */
const SCRIPT_DIRECTORY = decodeURIComponent(new URL(".", import.meta.url).pathname);

/** Every source file of the demo. */
function sourceFiles(): readonly string[] {
  return ts.sys.readDirectory(SCRIPT_DIRECTORY, [".ts", ".tsx"]);
}

/** Every violation found in the demo sources. */
function scan(): readonly Violation[] {
  const violations: Violation[] = [];
  for (const file of sourceFiles()) {
    const source = ts.sys.readFile(file);
    if (source === undefined) {
      violations.push({ file, specifier: "", reason: "unreadable source file" });
      continue;
    }
    violations.push(...violationsIn(file, source));
  }
  return violations;
}

/**
 * Proof that the rules above still accept and reject what they must.
 *
 * The allowed fixture quotes a forbidden package in a comment and in a string,
 * neither of which may count as an import. The forbidden fixture is what the
 * rules have to catch, so a guard that silently stopped detecting a violation
 * fails here before the demo ever gathers one.
 */
const ALLOWED_FIXTURE = `
// import "@nodera/domain" — a comment is not an import.
const quoted = 'import "@nodera/application" in a string';
import { assertValid } from "@nodera/sdk";
import { NoderaEditor } from "@nodera/react";
import "@xyflow/react/dist/style.css";
`;

/** Specifiers the forbidden fixture must report. */
const FORBIDDEN_FIXTURE = `
import "@nodera/domain";
import "@xyflow/react";
`;

/** Both fixtures, checked before the demo sources are read. */
function selfCheck(): void {
  const allowed = violationsIn("allowed-fixture.ts", ALLOWED_FIXTURE);
  if (allowed.length > 0) {
    throw new Error(
      `imports.test.ts: the allowed fixture was reported ` +
        `(${allowed.map((violation) => violation.specifier).join(", ")})`,
    );
  }

  const reported = violationsIn("forbidden-fixture.ts", FORBIDDEN_FIXTURE).map(
    (violation) => violation.specifier,
  );
  const expected = ["@nodera/domain", "@xyflow/react"];
  if (reported.join(",") !== expected.join(",")) {
    throw new Error(
      `imports.test.ts: the import rules no longer reject ` +
        `${expected.join(", ")}; reported ${reported.join(", ") || "nothing"}`,
    );
  }
}

selfCheck();

const files = sourceFiles();
const violations = scan();

if (violations.length > 0) {
  const details = violations
    .map((violation) => `  ${violation.file}: "${violation.specifier}" (${violation.reason})`)
    .join("\n");
  throw new Error(
    `imports.test.ts: the demo imports more than the public SDK:\n${details}`,
  );
}

console.log(
  `imports.test.ts: ${String(files.length)} files import only ${ALLOWED_WORKSPACE_PACKAGES.join(", ")} and the engine stylesheet`,
);
