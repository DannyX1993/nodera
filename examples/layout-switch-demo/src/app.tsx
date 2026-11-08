/**
 * Host UI of the layout-switch demo.
 *
 * The canvas is one component (`<NoderaEditor builder={builder} />`); every
 * control around it is plain host HTML that drives the public SDK. The controls
 * live **above** the canvas, never inside it: the framework ships no runtime
 * toggle for placement, and this page is what a host writes when it wants one.
 *
 * | Control        | SDK surface                                              |
 * | -------------- | -------------------------------------------------------- |
 * | Strategy       | `builder.graphLayout.setDefault(id)`                      |
 * | Direction      | `builder.graph.arrange({ direction, … })`                  |
 * | Spacing        | `builder.graph.arrange({ spacing, … })`                    |
 * | Rank spacing   | `builder.graph.arrange({ rankSpacing, … })`                |
 * | Arrange        | `builder.graph.arrange({ … })` — one explicit history unit |
 * | "+"            | `CreateNodeButton` → the built-in node-creation dialog,    |
 * |                | whose selection the host adds with `builder.graph.addNode` |
 *
 * Nothing is persisted by those overrides: they win for the one `Arrange` call
 * that carries them, and the next call without them reads `graph.layout` again.
 * Every `Result` is checked here and its diagnostics are shown in the status
 * line, so a refused arrangement is visible without a console.
 */

import { useState, type ReactNode } from "react";

import type { Builder, SdkIssues } from "@nodera/sdk";
import { NoderaEditor } from "@nodera/react-flow";
import {
  CreateNodeButton,
  NodeCreationDialog,
  useDialogActions,
  useUiState,
} from "@nodera/ui-react";

import { DEMO_LAYOUT } from "./builder.js";

/** Props accepted by {@link LayoutSwitchDemo}. */
export interface LayoutSwitchDemoProps {
  /** The builder composed in `builder.ts`. */
  readonly builder: Builder;
}

/** Directions the host offers, in the order it shows them. */
const DIRECTIONS = ["horizontal", "vertical"] as const;

/** One placement direction. */
type Direction = (typeof DIRECTIONS)[number];

/** The values the host's controls hold for one arrangement. */
interface Arrangement {
  readonly direction: Direction;
  readonly spacing: string;
  readonly rankSpacing: string;
  readonly strategyId: string;
}

/** What the status line says before the host arranges anything. */
const INITIAL_STATUS = "Press Arrange to re-place every node in ranks.";

/** Joins the diagnostics of a refused SDK call into one readable line. */
function issueSummary(issues: SdkIssues): string {
  return issues
    .map((issue) => {
      const where = issue.path === undefined ? "" : ` at ${issue.path.join(".")}`;
      return `${issue.code}${where}: ${issue.message}`;
    })
    .join(" | ");
}

/** Number of nodes an arrange moved, in words. */
function movedLabel(count: number): string {
  return `${String(count)} node${count === 1 ? "" : "s"}`;
}

/** A position as the host prints it. */
function positionLabel(position: { readonly x: number; readonly y: number } | undefined): string {
  return position === undefined ? "no position" : `(${String(position.x)}, ${String(position.y)})`;
}

export function LayoutSwitchDemo(props: LayoutSwitchDemoProps): ReactNode {
  const builder = props.builder;
  const ui = useUiState();
  const dialogs = useDialogActions();

  // The selection and the numbers the host's own controls hold. They are the
  // host's state, not the builder's configuration: `arrange()` receives them
  // per call and writes nothing back.
  const [strategyId, setStrategyId] = useState(() => builder.graphLayout.active());
  const [direction, setDirection] = useState<Direction>(DEMO_LAYOUT.direction);
  const [spacing, setSpacing] = useState(String(DEMO_LAYOUT.spacing));
  const [rankSpacing, setRankSpacing] = useState(String(DEMO_LAYOUT.rankSpacing));
  const [status, setStatus] = useState(INITIAL_STATUS);

  /**
   * Selects the strategy the next `arrange()` runs.
   *
   * The registry owns the id: an unknown one is refused with a diagnostic and
   * the selection stays where it was.
   */
  const selectStrategy = (id: string): void => {
    const selected = builder.graphLayout.setDefault(id);
    if (!selected.ok) {
      setStatus(`Strategy "${id}" was not selected — ${issueSummary(selected.error)}`);
      return;
    }
    setStrategyId(selected.value.id);
    // Selecting a strategy changes the geometry, so the host applies it at once
    // instead of leaving the canvas showing an arrangement of another strategy.
    applyArrangement({ direction, spacing, rankSpacing, strategyId: selected.value.id });
  };

  /**
   * Runs one arrangement with the values the controls hold.
   *
   * The numbers are passed through a parse on purpose: an emptied field becomes
   * `NaN`, which the SDK refuses at `spacing` / `rankSpacing` and moves nothing —
   * the refusal is the behaviour to see, so the demo never hides it.
   */
  const applyArrangement = (values: Arrangement): void => {
    const result = builder.graph.arrange({
      direction: values.direction,
      spacing: Number.parseFloat(values.spacing),
      rankSpacing: Number.parseFloat(values.rankSpacing),
    });
    if (!result.ok) {
      setStatus(`Arrange was refused — ${issueSummary(result.error)}`);
      return;
    }
    setStatus(
      `Arranged ${movedLabel(result.value.length)} with "${values.strategyId}", ` +
        `${values.direction}, spacing ${values.spacing}, rank spacing ${values.rankSpacing}.`,
    );
  };

  const arrange = (): void => {
    applyArrangement({ direction, spacing, rankSpacing, strategyId });
  };

  /**
   * Adds the definition the dialog offered.
   *
   * The dialog hands the selection back instead of dispatching the command, so
   * the addition goes through the SDK: `mode: "auto"` is what gives the new node
   * a free slot, and the host reports where it landed.
   */
  const addNode = (definitionId: string): void => {
    const added = builder.graph.addNode({ type: definitionId });
    if (!added.ok) {
      setStatus(`Node "${definitionId}" was not added — ${issueSummary(added.error)}`);
      return;
    }
    setStatus(
      `Node "${added.value.id}" added at ${positionLabel(added.value.position)}. ` +
        "Press Arrange to rank it with the rest.",
    );
  };

  // The node-creation dialog is the only dialog this host registers, so "a
  // dialog is open" is exactly "the create-node dialog is open".
  const dialogOpen = ui.activeDialogId !== undefined;
  const strategies = builder.graphLayout.all();

  return (
    <div className="demo-host">
      <header className="demo-bar">
        <h1>Nodera layout-switch demo</h1>

        <label className="demo-control">
          Strategy
          <select
            className="demo-select"
            aria-label="Placement strategy"
            value={strategyId}
            onChange={(event) => {
              selectStrategy(event.target.value);
            }}
          >
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.id}
              </option>
            ))}
          </select>
        </label>

        <label className="demo-control">
          Direction
          <select
            className="demo-select"
            aria-label="Arrange direction"
            value={direction}
            onChange={(event) => {
              const next = event.target.value;
              if (DIRECTIONS.some((candidate) => candidate === next)) {
                setDirection(next as Direction);
                applyArrangement({
                  direction: next as Direction,
                  spacing,
                  rankSpacing,
                  strategyId,
                });
              }
            }}
          >
            {DIRECTIONS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>

        <label className="demo-control">
          Spacing
          <input
            className="demo-number"
            type="number"
            min={1}
            step={20}
            aria-label="Spacing"
            value={spacing}
            onChange={(event) => {
              setSpacing(event.target.value);
              applyArrangement({
                direction,
                spacing: event.target.value,
                rankSpacing,
                strategyId,
              });
            }}
          />
        </label>

        <label className="demo-control">
          Rank spacing
          <input
            className="demo-number"
            type="number"
            min={1}
            step={20}
            aria-label="Rank spacing"
            value={rankSpacing}
            onChange={(event) => {
              setRankSpacing(event.target.value);
              applyArrangement({
                direction,
                spacing,
                rankSpacing: event.target.value,
                strategyId,
              });
            }}
          />
        </label>

        <button type="button" className="demo-button" onClick={arrange}>
          Arrange
        </button>

        <CreateNodeButton className="demo-button" />
      </header>

      <p className="demo-status" role="status" aria-live="polite">
        {`Strategy: ${strategyId} · ${status}`}
      </p>

      <div className="demo-canvas">
        <NoderaEditor builder={builder} />
      </div>

      <NodeCreationDialog open={dialogOpen} onClose={dialogs.close} onAddNode={addNode} />
    </div>
  );
}
