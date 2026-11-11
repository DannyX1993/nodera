/**
 * Application root of the Phase 7 demo.
 *
 * The editor is one component (`<NoderaEditor builder={builder} />`, from the
 * public React binding). Everything around it is plain host HTML that drives
 * the public APIs:
 *
 * | Control                     | Surface                                       |
 * | --------------------------- | --------------------------------------------- |
 * | Theme select                | `builder.theme.setDefault(id)`                  |
 * | Layout select               | `builder.layout.setDefault(id)`                 |
 * | Uninstall developer-tools   | `manager.uninstall(id)` + `builder.layout.setDefault` |
 * | Plugin table                | `manager.list()` — manifest, state, contributions |
 * | Event log                   | `builder.events.on("plugin.activated" ｜ …)`   |
 *
 * Every call that returns a `Result` is checked and its diagnostics are shown,
 * so a failing lifecycle operation is never silently ignored.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { PluginManager, PluginRecord } from "@nodera/plugin-manager";
import type { Builder, SdkIssues } from "@nodera/sdk";
import { NoderaEditor } from "@nodera/react-flow";

import { PLUGIN_IDS } from "./builder.js";

/** Props accepted by {@link DemoApp}. */
export interface DemoAppProps {
  /** The builder composed in `builder.ts`. */
  readonly builder: Builder;
  /** The manager that installed the builder's plugins, with their records. */
  readonly manager: PluginManager;
}

/** One line of the event log. */
interface LogEntry {
  readonly id: number;
  readonly name: string;
  readonly detail: string;
}

/** Lines the log keeps before the oldest entry is dropped. */
const MAX_LOG_ENTRIES = 12;

/** Status line the demo boots with. */
const INITIAL_STATUS =
  "Five plugins installed and active through createPluginManager(builder).install([...]).";

/** Joins SDK diagnostics into one readable line. */
function sdkSummary(issues: SdkIssues): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
}

/** Joins plugin-lifecycle diagnostics into one readable line. */
function pluginSummary(
  issues: readonly { readonly code: string; readonly message: string }[],
): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
}

export function DemoApp(props: DemoAppProps): ReactNode {
  const builder = props.builder;
  const manager = props.manager;

  const [status, setStatus] = useState(INITIAL_STATUS);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [records, setRecords] = useState<readonly PluginRecord[]>(() => manager.list());
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
      builder.events.on("plugin.activated", (payload) => {
        append("plugin.activated", `${payload.pluginId} · ${payload.contributionIds.length} contributions`);
      }),
      builder.events.on("plugin.deactivated", (payload) => {
        append("plugin.deactivated", payload.pluginId);
      }),
      builder.events.on("plugin.unregistered", (payload) => {
        append("plugin.unregistered", payload.pluginId);
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
      setStatus(`Theme "${id}" was not applied — ${sdkSummary(applied.error)}`);
      return;
    }
    setThemeId(applied.value.id);
    setStatus(`builder.theme.setDefault("${applied.value.id}") applied "${applied.value.name}".`);
  };

  const applyLayout = (id: string): void => {
    const applied = builder.layout.setDefault(id);
    if (!applied.ok) {
      setStatus(`Layout "${id}" was not applied — ${sdkSummary(applied.error)}`);
      return;
    }
    setLayoutId(applied.value.id);
    setStatus(`builder.layout.setDefault("${applied.value.id}") applied the shell geometry.`);
  };

  /**
   * Withdraws the developer-tools plugin and recomposes the panels.
   *
   * `uninstall` removes the contributions the manifest declares, so the two
   * panels and the two tools leave the registries. The applied layout still
   * names those panels — it is a declaration, not a reference — and the editor
   * only composes the panels the registry still has; re-applying the layout is
   * what asks it to recompose right now instead of on the next mount.
   */
  const uninstallDeveloperTools = (): void => {
    const removed = manager.uninstall(PLUGIN_IDS.developerTools);
    if (!removed.ok) {
      setStatus(
        `manager.uninstall("${PLUGIN_IDS.developerTools}") failed — ${pluginSummary(removed.error)}`,
      );
      return;
    }

    const record = removed.value;
    if (record.issues.length > 0) {
      // A withdrawal failure is reported, never hidden: the record lists it.
      append("uninstall issues", pluginSummary(record.issues));
    }

    const recomposed = builder.layout.setDefault(builder.layout.active().id);
    setRecords(manager.list());
    if (!recomposed.ok) {
      setStatus(
        `Uninstalled ${record.manifest.id}, but the layout was not recomposed — ${sdkSummary(recomposed.error)}`,
      );
      return;
    }
    setStatus(
      `manager.uninstall("${record.manifest.id}") withdrew ${record.contributionIds.length} contributions: the two panels and the two tools are gone from the editor.`,
    );
  };

  const themes = builder.theme.all();
  const layouts = builder.layout.all();
  const devToolsInstalled = manager.get(PLUGIN_IDS.developerTools) !== undefined;

  return (
    <div className="demo-host">
      <header className="demo-bar">
        <h1>Nodera Phase 7 demo — plugin ecosystem</h1>

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
                {theme.name ?? theme.id}
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
          disabled={!devToolsInstalled}
          title="manager.uninstall removes every contribution the plugin's manifest declares"
          onClick={uninstallDeveloperTools}
        >
          Uninstall developer-tools
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
          <h2>Plugins (manager.list)</h2>
          <ul className="demo-plugins">
            {records.map((record) => (
              <li key={record.manifest.id} data-plugin-state={record.state}>
                <span className="demo-plugin-id">{record.manifest.id}</span>
                <span className="demo-plugin-state">{record.state}</span>
                <span className="demo-plugin-detail" title={record.manifest.description}>
                  {record.manifest.version} · {record.contributionIds.length} contributions ·{" "}
                  {[
                    ...new Set((record.manifest.contributions ?? []).map((entry) => entry.type)),
                  ].join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {devToolsInstalled ? null : (
            <p className="demo-note">
              Uninstall is final on one builder: the SDK never forgets an installed plugin id, so
              reinstalling needs a fresh builder (docs/PLUGINS.md, known limitations).
            </p>
          )}
        </div>

        <div className="demo-output-column">
          <h2>Event log (builder.events)</h2>
          <ul className="demo-log">
            {log.length === 0 ? (
              <li>
                <span className="demo-log-detail">
                  Listening to plugin.activated, plugin.deactivated and plugin.unregistered. The
                  five initial activations happened before this log mounted; uninstall a plugin to
                  see the lifecycle events here.
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
      </section>
    </div>
  );
}
