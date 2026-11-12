/**
 * Application root of the Phase 6 demo.
 *
 * The editor is one component (`<NoderaEditor builder={builder} />`, provided by
 * the SDK's React binding). Everything around it is plain host HTML that drives
 * the public APIs:
 *
 * | Control              | SDK surface                                   |
 * | -------------------- | --------------------------------------------- |
 * | Theme select         | `builder.theme.setDefault(id)` (the host theme is
 *                          registered at boot with `builder.theme.register`) |
 * | Layout select        | `builder.layout.setDefault(id)`                |
 * | Export JSON / YAML   | `builder.document.serialize("json"｜"yaml")`   |
 * | Import exported JSON | `builder.document.import(document)`            |
 * | Validate graph       | `builder.graph.validate()`                     |
 * | Event log            | `builder.events.on(...)`                       |
 *
 * Every call that returns a `Result` is checked here and its diagnostics are
 * shown, so a failing SDK operation is never silently ignored.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { Builder, SdkIssues } from "@nodera/sdk";
import { NoderaEditor } from "@nodera/react";

/** Props accepted by {@link DemoApp}. */
export interface DemoAppProps {
  /** The builder composed in `builder.ts`. */
  readonly builder: Builder;
}

/** One line of the event log. */
interface LogEntry {
  readonly id: number;
  readonly name: string;
  readonly detail: string;
}

/** A document the host serialized, kept so it can be imported back. */
interface ExportedDocument {
  readonly format: "json" | "yaml";
  readonly text: string;
}

/** Result of the last validation run, ready to render. */
interface ValidationResult {
  readonly valid: boolean;
  readonly headline: string;
  readonly issues: readonly string[];
}

/** Lines the log keeps before the oldest entry is dropped. */
const MAX_LOG_ENTRIES = 14;

const INITIAL_STATUS =
  "The graph is seeded through builder.graph; select a node to see the host property renderer.";

/** Joins the diagnostics of a failed SDK call into one readable line. */
function issueSummary(issues: SdkIssues): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
}

/** Message of a thrown value, for the one place the demo parses text. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DemoApp(props: DemoAppProps): ReactNode {
  const builder = props.builder;

  const [status, setStatus] = useState(INITIAL_STATUS);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [exported, setExported] = useState<ExportedDocument | undefined>(undefined);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);
  const [themeId, setThemeId] = useState(() => builder.theme.active().id);
  const [layoutId, setLayoutId] = useState(() => builder.layout.active().id);
  const nextLogId = useRef(0);

  const append = useCallback((name: string, detail: string): void => {
    const id = nextLogId.current;
    nextLogId.current = id + 1;
    setLog((previous) => [...previous, { id, name, detail }].slice(-MAX_LOG_ENTRIES));
  }, []);

  useEffect(() => {
    const unsubscribe = [
      builder.events.on("node.created", (payload) => {
        append("node.created", `${payload.definitionId} → ${payload.nodeId}`);
      }),
      builder.events.on("edge.created", (payload) => {
        append("edge.created", payload.edgeId);
      }),
      builder.events.on("graph.exported", (payload) => {
        append("graph.exported", `${payload.format} · ${payload.graphId}`);
      }),
    ];
    return () => {
      for (const off of unsubscribe) {
        off();
      }
    };
  }, [builder, append]);

  const applyTheme = (id: string): void => {
    const applied = builder.theme.setDefault(id);
    if (!applied.ok) {
      setStatus(`Theme "${id}" was not applied — ${issueSummary(applied.error)}`);
      return;
    }
    setThemeId(applied.value.id);
    setStatus(`builder.theme.setDefault("${applied.value.id}") applied "${applied.value.name}".`);
  };

  const applyLayout = (id: string): void => {
    const applied = builder.layout.setDefault(id);
    if (!applied.ok) {
      setStatus(`Layout "${id}" was not applied — ${issueSummary(applied.error)}`);
      return;
    }
    setLayoutId(applied.value.id);
    setStatus(`builder.layout.setDefault("${applied.value.id}") applied the shell geometry.`);
  };

  const exportDocument = (format: "json" | "yaml"): void => {
    const serialized = builder.document.serialize(format);
    if (!serialized.ok) {
      setStatus(`Export as ${format.toUpperCase()} failed — ${issueSummary(serialized.error)}`);
      return;
    }
    setExported({ format, text: serialized.value });
    setStatus(
      `builder.document.serialize("${format}") returned ${serialized.value.length} characters.`,
    );
  };

  const importExportedJson = (): void => {
    if (exported === undefined || exported.format !== "json") {
      setStatus("Export the graph as JSON first: this button re-imports the exported JSON document.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(exported.text);
    } catch (error) {
      setStatus(`The exported text is not valid JSON — ${errorMessage(error)}`);
      return;
    }
    const imported = builder.document.import(parsed);
    if (!imported.ok) {
      setStatus(`builder.document.import() failed — ${issueSummary(imported.error)}`);
      return;
    }
    setStatus(
      `builder.document.import() loaded the document: ${imported.value.nodeCount} nodes, ${imported.value.edgeCount} edges.`,
    );
  };

  const validateGraph = (): void => {
    const report = builder.graph.validate();
    setValidation({
      valid: report.isValid,
      headline: report.isValid
        ? `Valid: ${builder.graph.nodeCount()} nodes, ${builder.graph.edgeCount()} edges, no issues.`
        : `Invalid: ${report.issues.length} issue${report.issues.length === 1 ? "" : "s"} found.`,
      issues: report.issues.map(
        (issue) => `${issue.severity.toUpperCase()} ${issue.code} — ${issue.message}`,
      ),
    });
    setStatus(`builder.graph.validate() ran (structural ${report.structurallyValid ? "ok" : "failed"}, configuration ${report.configurationValid ? "ok" : "failed"}).`);
  };

  const themes = builder.theme.all();
  const layouts = builder.layout.all();
  const canImport = exported !== undefined && exported.format === "json";

  return (
    <div className="demo-host">
      <header className="demo-bar">
        <h1>Nodera Phase 6 demo — host built on the public SDK</h1>

        <label className="demo-control">
          Theme
          <select
            className="demo-select"
            aria-label="Editor theme"
            value={themeId}
            onChange={(event) => {
              applyTheme(event.target.value);
            }}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>

        <label className="demo-control">
          Layout
          <select
            className="demo-select"
            aria-label="Editor layout"
            value={layoutId}
            onChange={(event) => {
              applyLayout(event.target.value);
            }}
          >
            {layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name ?? layout.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="demo-button"
          onClick={() => {
            exportDocument("json");
          }}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={() => {
            exportDocument("yaml");
          }}
        >
          Export YAML
        </button>
        <button
          type="button"
          className="demo-button"
          disabled={!canImport}
          title="Export the graph as JSON, then reload that exact document through builder.document.import()"
          onClick={importExportedJson}
        >
          Import exported JSON
        </button>
        <button
          type="button"
          className="demo-button"
          onClick={validateGraph}
        >
          Validate graph
        </button>
      </header>

      <p className="demo-status" role="status" aria-live="polite">
        {status}
      </p>

      <div className="demo-editor">
        <NoderaEditor builder={builder} />
      </div>

      <section className="demo-output">
        <div className="demo-output-column">
          <h2>Event log (builder.events)</h2>
          <ul className="demo-log">
            {log.length === 0 ? (
              <li>
                <span className="demo-log-detail">
                  Listening to node.created, edge.created and graph.exported. Add a node
                  from the palette, connect two nodes, or export the document.
                </span>
              </li>
            ) : (
              log.map((entry) => (
                <li key={entry.id}>
                  <span className="demo-log-name">{entry.name}</span>
                  <span className="demo-log-detail" title={entry.detail}>
                    {entry.detail}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="demo-output-column">
          <h2>Validation (builder.graph.validate)</h2>
          {validation === undefined ? (
            <p>Not run yet. Select “Validate graph”.</p>
          ) : (
            <>
              <p style={{ color: validation.valid ? "#8fd694" : "#f27a72" }}>
                {validation.headline}
              </p>
              <ul className="demo-issues">
                {validation.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="demo-output-column">
          <h2>
            Exported document
            {exported === undefined ? "" : ` (${exported.format.toUpperCase()})`}
          </h2>
          <pre className="demo-document">
            {exported === undefined
              ? "Export the graph as JSON or YAML to inspect the portable document here."
              : exported.text}
          </pre>
        </div>
      </section>
    </div>
  );
}
