/**
 * Host UI of the layout-switch demo.
 *
 * The canvas is one component (`<NoderaEditor builder={builder} />`); every
 * control around it is plain host HTML that drives the public SDK. The controls
 * live in one collapsible **Options** panel **above** the canvas, never inside
 * it: the framework ships no runtime toggle for placement, and this page is what
 * a host writes when it wants one (S20).
 *
 * | Group   | Control               | SDK surface                                                  |
 * | ------- | --------------------- | ------------------------------------------------------------ |
 * | Layout  | Strategy              | `builder.graphLayout.setDefault(id)`                          |
 * | Layout  | Direction             | `builder.graph.arrange({ direction, … })`                      |
 * | Layout  | Spacing               | `builder.graph.arrange({ spacing, … })`                        |
 * | Layout  | Rank spacing          | `builder.graph.arrange({ rankSpacing, … })`                    |
 * | Layout  | Arrange on change     | `builder.graphLayout.setArrangeOnChange(policy)`               |
 * | Layout  | On remove             | `builder.graphLayout.setRemovalPolicy(policy)`                 |
 * | Surface | Manual drag           | `builder.graphLayout.setDragPolicy(policy)`                    |
 * | Surface | Connections           | `builder.graphLayout.setConnectionsPolicy(policy)`             |
 * | Surface | Ports                 | `builder.graphLayout.setPortsPolicy(policy)`                   |
 * | Surface | Edge "+"              | `builder.features.edgeInsertion` — construction-time, reported |
 * | Actions | Arrange               | `builder.graph.arrange({ … })` — one explicit history unit     |
 * | Actions | Arrange from a node   | `builder.graph.arrange({ from, … })` — the scoped call         |
 * | Actions | Add node              | `CreateNodeButton` → `builder.graph.addNode({ after })`        |
 * | Actions | Remove selected node  | `builder.graph.removeNode(id)` — obeys `onRemove`              |
 * | Actions | Reset graph           | `resetDemoGraph` — wipe, then seed again                       |
 * | canvas  | "+" on an edge        | `features.edgeInsertion` → the canvas affordance → the dialog,  |
 * |         |                       | whose selection the host inserts with `builder.graph.insertNode` |
 * | canvas  | "+" on the phantom    | the same affordance on the phantom empty state and on every    |
 * |         |                       | leaf's successor placeholder: the host appends with            |
 * |         |                       | `addNode({ after })` + `connect` (two units)                   |
 *
 * Nothing is persisted by the per-call overrides: they win for the one `Arrange`
 * call that carries them, and the next call without them reads `graph.layout`
 * again. Every `Result` is checked here and its diagnostics are shown in the
 * status line, so a refused arrangement, insertion or policy change is visible
 * without a console.
 *
 * Accessibility (AGENTS.md §15): the header's disclosure is a native button
 * carrying `aria-expanded` / `aria-controls`, the three groups are `fieldset`s
 * with `legend`s, and every control is a native element named by its own visible
 * label — nothing is conveyed by colour alone.
 */

import { useState, type ReactNode } from "react";

import type { Builder, SdkIssues } from "@nodera/sdk";
import { NoderaEditor } from "@nodera/react-flow";
import {
  CreateNodeButton,
  NodeCreationDialog,
  useDialogActions,
  useEditorSnapshot,
  useUiState,
} from "@nodera/ui-react";

import { DEMO_LAYOUT, resetDemoGraph } from "./builder.js";

/** Props accepted by {@link LayoutSwitchDemo}. */
export interface LayoutSwitchDemoProps {
  /** The builder composed in `builder.ts`. */
  readonly builder: Builder;
}

/** Id the disclosure button controls, so `aria-controls` has a target. */
const OPTIONS_PANEL_ID = "demo-options-panel";

/** Directions the host offers, in the order it shows them. */
const DIRECTIONS = ["horizontal", "vertical"] as const;

/** One placement direction. */
type Direction = (typeof DIRECTIONS)[number];

/** What a manual drag does with the positions the layout assigned. */
type DragPolicy = ReturnType<Builder["graphLayout"]["dragPolicy"]>;

/** Whether a person may draw a new connection on the canvas. */
type ConnectionsPolicy = ReturnType<Builder["graphLayout"]["connectionsPolicy"]>;

/** Whether the node surface paints its port handles. */
type PortsPolicy = ReturnType<Builder["graphLayout"]["portsPolicy"]>;

/** What a structural change arranges by itself. */
type ArrangeOnChange = ReturnType<Builder["graphLayout"]["arrangeOnChange"]>;

/** What removing a node does with the relations it carried. */
type RemovalPolicy = ReturnType<Builder["graphLayout"]["removalPolicy"]>;

/**
 * The built-in strategy id that does not own the positions.
 *
 * A strategy that owns the positions owns the surface around them: with
 * `nodera.graph-layout.layered` the host fixes the connections and hides the port
 * handles, so nobody adds an edge or a handle the arrangement does not know
 * about. `nodera.graph-layout.free` places nothing, so the surface is the host's
 * again — editable connections and visible ports. The id is the SDK's own
 * built-in, not a private convention.
 */
const FREE_STRATEGY_ID = "nodera.graph-layout.free";

/** Drag policies the host offers, in the order it shows them. */
const DRAG_POLICIES = ["free", "locked", "snap-back"] as const satisfies readonly DragPolicy[];

/** What each policy does, in the host's own words. */
const DRAG_POLICY_LABEL: Readonly<Record<DragPolicy, string>> = {
  free: "a manual drag moves the node and commits one position",
  locked: "the canvas refuses a manual drag, so the placed positions stay",
  "snap-back": "the node follows the pointer and returns to its assigned position",
};

/** Connection policies the host offers, in the order it shows them. */
const CONNECTION_POLICIES = ["editable", "fixed"] as const satisfies readonly ConnectionsPolicy[];

/** What each connection policy does, in the host's own words. */
const CONNECTION_POLICY_LABEL: Readonly<Record<ConnectionsPolicy, string>> = {
  editable: "a person may draw a valid connection; it is one history unit",
  fixed: "no handle accepts a connection, so the arrangement cannot be contradicted",
};

/** Port policies the host offers, in the order it shows them. */
const PORTS_POLICIES = ["visible", "hidden"] as const satisfies readonly PortsPolicy[];

/** What each port policy does, in the host's own words. */
const PORTS_POLICY_LABEL: Readonly<Record<PortsPolicy, string>> = {
  visible: "every port is painted as a handle a connection can attach to",
  hidden: "no handle is painted; node renderers still receive their ports",
};

/** Automatic arrangement policies the host offers. */
const ARRANGE_ON_CHANGE_POLICIES = [
  "never",
  "downstream",
] as const satisfies readonly ArrangeOnChange[];

/** What each automatic arrangement policy does, in the host's own words. */
const ARRANGE_ON_CHANGE_LABEL: Readonly<Record<ArrangeOnChange, string>> = {
  never: "only an explicit Arrange moves a node",
  downstream:
    "an insertion or a connection arranges the changed node and its descendants, as a second history unit",
};

/** Removal policies the host offers. */
const REMOVAL_POLICIES = ["detach", "splice"] as const satisfies readonly RemovalPolicy[];

/** What each removal policy does, in the host's own words. */
const REMOVAL_POLICY_LABEL: Readonly<Record<RemovalPolicy, string>> = {
  detach: "a removed node takes its edges with it and leaves the hierarchy apart",
  splice: "a removed node joins each predecessor to each successor, in the same history unit",
};

/** The values the host's controls hold for one arrangement. */
interface Arrangement {
  readonly direction: Direction;
  readonly spacing: string;
  readonly rankSpacing: string;
  readonly strategyId: string;
}

/** The per-call overrides `arrange` receives, already parsed. */
interface ArrangeOverrides {
  readonly direction: Direction;
  readonly spacing: number;
  readonly rankSpacing: number;
}

/** What the status line says before the host arranges anything. */
const INITIAL_STATUS = "Open Options and press Arrange to re-place every node in ranks.";

/** The offered value a select reported, or `undefined` when it is not one. */
function offered<Value extends string>(
  values: readonly Value[],
  reported: string,
): Value | undefined {
  return values.find((candidate) => candidate === reported);
}

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

/** A strategy id as the header prints it: everything after the framework prefix. */
function shortStrategy(strategyId: string): string {
  const parts = strategyId.split(".");
  return parts[parts.length - 1] ?? strategyId;
}

export function LayoutSwitchDemo(props: LayoutSwitchDemoProps): ReactNode {
  const builder = props.builder;
  const ui = useUiState();
  const dialogs = useDialogActions();
  // The selection is application state, so it reaches React through the
  // documented editor snapshot rather than a read during render.
  const snapshot = useEditorSnapshot(builder.editor);
  const singleSelectedId =
    snapshot.selectedNodes.length === 1 ? snapshot.selectedNodes[0] : undefined;

  // The selection and the numbers the host's own controls hold. They are the
  // host's state, not the builder's configuration: `arrange()` receives them
  // per call and writes nothing back.
  const [strategyId, setStrategyId] = useState(() => builder.graphLayout.active());
  const [direction, setDirection] = useState<Direction>(() => DEMO_LAYOUT.direction);
  const [spacing, setSpacing] = useState(String(DEMO_LAYOUT.spacing));
  const [rankSpacing, setRankSpacing] = useState(String(DEMO_LAYOUT.rankSpacing));
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [optionsOpen, setOptionsOpen] = useState(true);
  // Seeded from the builder's configuration, so every control always shows the
  // policy the canvas is really applying.
  const [drag, setDrag] = useState<DragPolicy>(() => builder.graphLayout.dragPolicy());
  const [connections, setConnections] = useState<ConnectionsPolicy>(() =>
    builder.graphLayout.connectionsPolicy(),
  );
  const [ports, setPorts] = useState<PortsPolicy>(() => builder.graphLayout.portsPolicy());
  const [arrangeOnChange, setArrangeOnChange] = useState<ArrangeOnChange>(() =>
    builder.graphLayout.arrangeOnChange(),
  );
  const [removal, setRemoval] = useState<RemovalPolicy>(() => builder.graphLayout.removalPolicy());

  // A construction-time flag, reported instead of switched: the panel has no
  // way to change it, so it says what the canvas is really doing.
  const edgeInsertion = builder.features.edgeInsertion;

  /** The per-call overrides the control values describe, parsed on purpose. */
  const overrides = (values: Arrangement): ArrangeOverrides => ({
    direction: values.direction,
    spacing: Number.parseFloat(values.spacing),
    rankSpacing: Number.parseFloat(values.rankSpacing),
  });

  /**
   * Runs one whole-graph arrangement and answers the status line it produced.
   *
   * The numbers are passed through a parse on purpose: an emptied field becomes
   * `NaN`, which the SDK refuses at `spacing` / `rankSpacing` and moves nothing —
   * the refusal is the behaviour to see, so the demo never hides it.
   */
  const arrangementStatus = (values: Arrangement): string => {
    const result = builder.graph.arrange(overrides(values));
    if (!result.ok) {
      return `Arrange was refused — ${issueSummary(result.error)}`;
    }
    return (
      `Arranged ${movedLabel(result.value.length)} with "${values.strategyId}", ` +
      `${values.direction}, spacing ${values.spacing}, rank spacing ${values.rankSpacing}.`
    );
  };

  const applyArrangement = (values: Arrangement): void => {
    setStatus(arrangementStatus(values));
  };

  const arrange = (): void => {
    applyArrangement({ direction, spacing, rankSpacing, strategyId });
  };

  /**
   * Selects the strategy the next `arrange()` runs.
   *
   * The registry owns the id: an unknown one is refused with a diagnostic and
   * the selection stays where it was. Selecting a strategy also selects the
   * surface it implies — a layout-owned graph fixes its connections and hides its
   * port handles, `nodera.graph-layout.free` hands both back to the host — because
   * that is the host's own configuration decision, not a framework toggle.
   */
  const selectStrategy = (id: string): void => {
    const selected = builder.graphLayout.setDefault(id);
    if (!selected.ok) {
      setStatus(`Strategy "${id}" was not selected — ${issueSummary(selected.error)}`);
      return;
    }
    setStrategyId(selected.value.id);
    const surface = applySurface(selected.value.id !== FREE_STRATEGY_ID);
    // Selecting a strategy changes the geometry, so the host applies it at once
    // instead of leaving the canvas showing an arrangement of another strategy.
    applyArrangement({ direction, spacing, rankSpacing, strategyId: selected.value.id });
    if (!surface.ok) {
      setStatus(`Surface of "${selected.value.id}" was not applied — ${surface.status}`);
    }
  };

  /**
   * Applies the surface a strategy implies: fixed connections and hidden ports
   * when the layout owns the positions, editable connections and visible ports
   * when it does not.
   *
   * Both are presentation policies: they write no document state, push no history
   * entry and emit no event, so a refused value simply leaves the previous one in
   * place and the panel keeps reporting it.
   */
  const applySurface = (
    layoutOwned: boolean,
  ): { readonly ok: boolean; readonly status: string } => {
    const changedConnections = builder.graphLayout.setConnectionsPolicy(
      layoutOwned ? "fixed" : "editable",
    );
    if (!changedConnections.ok) {
      return { ok: false, status: issueSummary(changedConnections.error) };
    }
    setConnections(changedConnections.value);

    const changedPorts = builder.graphLayout.setPortsPolicy(layoutOwned ? "hidden" : "visible");
    if (!changedPorts.ok) {
      return { ok: false, status: issueSummary(changedPorts.error) };
    }
    setPorts(changedPorts.value);

    return {
      ok: true,
      status: `Connections ${changedConnections.value}, ports ${changedPorts.value}.`,
    };
  };

  /**
   * Changes what a manual drag does.
   *
   * The policy is host configuration, so this is a configuration change and not
   * a placement: the canvas re-renders from the UI state the SDK wrote, nothing
   * in the document moves, and a refused value leaves the previous policy in
   * place (the select keeps showing it).
   */
  const selectDragPolicy = (reported: string): void => {
    const policy = offered(DRAG_POLICIES, reported);
    if (policy === undefined) {
      return;
    }
    const changed = builder.graphLayout.setDragPolicy(policy);
    if (!changed.ok) {
      setStatus(`Drag policy "${reported}" was not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setDrag(changed.value);
    setStatus(`Drag policy "${changed.value}": ${DRAG_POLICY_LABEL[changed.value]}.`);
  };

  /** Changes whether a person may draw a new connection on the canvas. */
  const selectConnections = (reported: string): void => {
    const policy = offered(CONNECTION_POLICIES, reported);
    if (policy === undefined) {
      return;
    }
    const changed = builder.graphLayout.setConnectionsPolicy(policy);
    if (!changed.ok) {
      setStatus(`Connections "${reported}" were not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setConnections(changed.value);
    setStatus(`Connections "${changed.value}": ${CONNECTION_POLICY_LABEL[changed.value]}.`);
  };

  /** Changes whether the node surface paints its port handles. */
  const selectPorts = (reported: string): void => {
    const policy = offered(PORTS_POLICIES, reported);
    if (policy === undefined) {
      return;
    }
    const changed = builder.graphLayout.setPortsPolicy(policy);
    if (!changed.ok) {
      setStatus(`Ports "${reported}" were not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setPorts(changed.value);
    setStatus(`Ports "${changed.value}": ${PORTS_POLICY_LABEL[changed.value]}.`);
  };

  /** Changes what a structural change arranges by itself. */
  const selectArrangeOnChange = (reported: string): void => {
    const policy = offered(ARRANGE_ON_CHANGE_POLICIES, reported);
    if (policy === undefined) {
      return;
    }
    const changed = builder.graphLayout.setArrangeOnChange(policy);
    if (!changed.ok) {
      setStatus(`Arrange on change "${reported}" was not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setArrangeOnChange(changed.value);
    setStatus(`Arrange on change "${changed.value}": ${ARRANGE_ON_CHANGE_LABEL[changed.value]}.`);
  };

  /** Changes what removing a node does with the relations it carried. */
  const selectRemovalPolicy = (reported: string): void => {
    const policy = offered(REMOVAL_POLICIES, reported);
    if (policy === undefined) {
      return;
    }
    const changed = builder.graphLayout.setRemovalPolicy(policy);
    if (!changed.ok) {
      setStatus(`On remove "${reported}" was not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setRemoval(changed.value);
    setStatus(`On remove "${changed.value}": ${REMOVAL_POLICY_LABEL[changed.value]}.`);
  };

  /**
   * Arranges the selected node and its descendants only.
   *
   * The scoped call is the SDK's own: the strategy still ranks the whole graph,
   * but only `from` and what is reachable from it outward receive a position, in
   * one history unit. Every other node keeps the place it had.
   */
  const arrangeFromSelection = (): void => {
    if (singleSelectedId === undefined) {
      setStatus("Select exactly one node to arrange from it.");
      return;
    }
    const result = builder.graph.arrange({
      ...overrides({ direction, spacing, rankSpacing, strategyId }),
      from: singleSelectedId,
    });
    if (!result.ok) {
      setStatus(`Arrange from "${singleSelectedId}" was refused — ${issueSummary(result.error)}`);
      return;
    }
    setStatus(
      `Arranged ${movedLabel(result.value.length)} from "${singleSelectedId}" with ` +
        `"${strategyId}": only that node and its descendants moved, in one history unit.`,
    );
  };

  /**
   * Removes the selected node through the SDK, so the removal policy applies.
   *
   * `builder.graph.removeNode` is the only path `graph.layout.onRemove` governs:
   * with `"splice"` the node leaves and each predecessor is joined to each
   * successor inside the same history unit, with `"detach"` its edges leave with
   * it. The canvas' own Delete key goes through the application use case directly
   * and is not policy-aware — a framework gap this demo reports instead of
   * hiding.
   */
  const removeSelected = (): void => {
    if (singleSelectedId === undefined) {
      setStatus("Select exactly one node to remove it.");
      return;
    }
    const removed = builder.graph.removeNode(singleSelectedId);
    if (!removed.ok) {
      setStatus(`Node "${singleSelectedId}" was not removed — ${issueSummary(removed.error)}`);
      return;
    }
    const relations =
      removal === "splice"
        ? "and each predecessor was joined to each successor"
        : "with every edge it carried";
    setStatus(
      `Removed "${removed.value.id}" onRemove "${removal}", ${relations}; ` +
        "one undo restores it.",
    );
  };

  /**
   * Re-creates the seeded graph in place.
   *
   * The seeding lives in `builder.ts`, next to the boot sequence, so a reset is
   * the same graph the demo starts with instead of a second copy that could
   * drift. Every removal and every creation is its own history unit, and the
   * edges are dropped first so the result does not depend on `onRemove`.
   */
  const resetGraph = (): void => {
    const issues = resetDemoGraph(builder);
    if (issues.length > 0) {
      setStatus(`Reset was refused — ${issueSummary(issues)}`);
      return;
    }
    setStatus(
      `Reset to the seeded graph. ${arrangementStatus({ direction, spacing, rankSpacing, strategyId })}`,
    );
  };

  /**
   * Creates the node the dialog offered.
   *
   * One dialog, three creation paths, each identified by the presentation state
   * the affordance that opened it recorded:
   *
   * - an edge "+" (`pendingEdgeInsertId`): the definition is inserted **into**
   *   that edge with `builder.graph.insertNode`, one history unit, so one undo
   *   restores the original edge;
   * - the phantom "+" (`pendingAppendAnchorId`, see `docs/GRAPH-LAYOUT.md`): the
   *   node is appended with `builder.graph.addNode({ type, after })` — the anchor
   *   is the node the placeholder followed, or absent on an empty graph — and
   *   then connected to it with `builder.graph.connect`;
   * - the palette button (neither): `addNode({ type })`, anchored on the single
   *   selected node when there is one, so `mode: "auto"` gives it a free slot.
   *
   * The phantom path is **two history units**, not one: create, then connect,
   * because both are separate SDK calls. One `undo()` removes the connecting edge
   * and a second removes the node. A single-unit append-and-connect needs its own
   * application use case, which does not exist yet, so this demo says so instead
   * of pretending.
   *
   * Both calls are reported: a refused `addNode` leaves the graph untouched, and
   * a refused `connect` is printed together with the node that did land, because
   * there is no transaction here that could roll it back.
   */
  const addNode = (definitionId: string): void => {
    const edgeId = ui.pendingEdgeInsertId;
    if (edgeId !== undefined) {
      const inserted = builder.graph.insertNode({ edgeId, type: definitionId });
      if (!inserted.ok) {
        setStatus(
          `Node "${definitionId}" was not inserted on "${edgeId}" — ` +
            issueSummary(inserted.error),
        );
        return;
      }
      setStatus(
        `Node "${inserted.value.node.id}" inserted on "${edgeId}" at ` +
          `${positionLabel(inserted.value.node.position)}; one undo restores the edge.`,
      );
      return;
    }

    // The palette anchors on the node the host has selected: with exactly one
    // selection the new node follows it, with none it goes to the end of the
    // graph. The phantom "+" already carries its own anchor.
    const selected = builder.graph.selectedNodes();
    const anchorId =
      ui.pendingAppendAnchorId ?? (selected.length === 1 ? selected[0] : undefined);
    const added = builder.graph.addNode(
      anchorId === undefined
        ? { type: definitionId }
        : { type: definitionId, after: anchorId },
    );
    if (!added.ok) {
      setStatus(`Node "${definitionId}" was not added — ${issueSummary(added.error)}`);
      return;
    }

    if (anchorId === undefined) {
      setStatus(
        `Node "${added.value.id}" added at ${positionLabel(added.value.position)}. ` +
          "Press Arrange to rank it with the rest.",
      );
      return;
    }

    const connected = builder.graph.connect({
      source: anchorId,
      target: added.value.id,
    });
    if (!connected.ok) {
      setStatus(
        `Node "${added.value.id}" was added after "${anchorId}" at ` +
          `${positionLabel(added.value.position)} but could not be connected — ` +
          `${issueSummary(connected.error)}. Two history units: the node stays, ` +
          "and undo removes it without an edge.",
      );
      return;
    }
    setStatus(
      `Node "${added.value.id}" added after "${anchorId}" and connected to it at ` +
        `${positionLabel(added.value.position)}. Two history units: undo removes ` +
        "the edge first, then the node. Press Arrange to rank it with the rest.",
    );
  };

  // The node-creation dialog is the only dialog this host registers, so "a
  // dialog is open" is exactly "the create-node dialog is open".
  const dialogOpen = ui.activeDialogId !== undefined;
  const strategies = builder.graphLayout.all();

  // The header reports every option the panel holds, so the state is readable
  // with the panel collapsed.
  const summary = [
    `${shortStrategy(strategyId)} ${direction}`,
    `spacing ${spacing}/${rankSpacing}`,
    `drag ${drag}`,
    `connections ${connections}`,
    `ports ${ports}`,
    `arrange on ${arrangeOnChange}`,
    `remove ${removal}`,
    `edge "+" ${edgeInsertion ? "on" : "off"}`,
  ].join(" · ");

  return (
    <div className="demo-host">
      <header className="demo-header">
        <h1>Nodera layout-switch demo</h1>
        <p className="demo-summary" data-demo-summary="">
          {summary}
        </p>
        <button
          type="button"
          className="demo-disclosure"
          data-demo-control="options"
          aria-expanded={optionsOpen}
          aria-controls={OPTIONS_PANEL_ID}
          onClick={() => {
            setOptionsOpen(!optionsOpen);
          }}
        >
          <span aria-hidden="true">{optionsOpen ? "▾" : "▸"}</span>
          {" Options"}
        </button>
      </header>

      <section
        id={OPTIONS_PANEL_ID}
        className="demo-options"
        aria-label="Layout options"
        hidden={!optionsOpen}
      >
        <div className="demo-options-body">
          <fieldset className="demo-group">
            <legend>Layout</legend>
            <div className="demo-group-body">
              <label className="demo-control">
                Strategy
                <select
                  className="demo-select"
                  data-demo-control="strategy"
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
                  data-demo-control="direction"
                  value={direction}
                  onChange={(event) => {
                    const next = offered(DIRECTIONS, event.target.value);
                    if (next === undefined) {
                      return;
                    }
                    setDirection(next);
                    applyArrangement({ direction: next, spacing, rankSpacing, strategyId });
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
                  data-demo-control="spacing"
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
                  data-demo-control="rank-spacing"
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

              <label className="demo-control">
                Arrange on change
                <select
                  className="demo-select"
                  data-demo-control="arrange-on-change"
                  value={arrangeOnChange}
                  onChange={(event) => {
                    selectArrangeOnChange(event.target.value);
                  }}
                >
                  {ARRANGE_ON_CHANGE_POLICIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                On remove
                <select
                  className="demo-select"
                  data-demo-control="on-remove"
                  value={removal}
                  onChange={(event) => {
                    selectRemovalPolicy(event.target.value);
                  }}
                >
                  {REMOVAL_POLICIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="demo-group">
            <legend>Surface</legend>
            <div className="demo-group-body">
              <label className="demo-control">
                Manual drag
                <select
                  className="demo-select"
                  data-demo-control="drag"
                  value={drag}
                  onChange={(event) => {
                    selectDragPolicy(event.target.value);
                  }}
                >
                  {DRAG_POLICIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Connections
                <select
                  className="demo-select"
                  data-demo-control="connections"
                  value={connections}
                  onChange={(event) => {
                    selectConnections(event.target.value);
                  }}
                >
                  {CONNECTION_POLICIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Ports
                <select
                  className="demo-select"
                  data-demo-control="ports"
                  value={ports}
                  onChange={(event) => {
                    selectPorts(event.target.value);
                  }}
                >
                  {PORTS_POLICIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <p className="demo-state" data-demo-state="edge-insertion">
                {`edge "+" ${edgeInsertion ? "on" : "off"}`}
              </p>
              <p className="demo-note">
                {"Edge insertion is a construction-time flag: "}
                <code>{"features: { edgeInsertion: true }"}</code>
                {" in builder.ts is what makes every edge paint the framework's "}
                <code>{'"+"'}</code>
                {". A host decides it when it composes the builder, so this panel "}
                {"reports it instead of pretending to switch it."}
              </p>
            </div>
          </fieldset>

          <fieldset className="demo-group">
            <legend>Actions</legend>
            <div className="demo-group-body">
              <button
                type="button"
                className="demo-button"
                data-demo-control="arrange"
                onClick={arrange}
              >
                Arrange
              </button>

              <button
                type="button"
                className="demo-button"
                data-demo-control="arrange-from-selection"
                disabled={singleSelectedId === undefined}
                onClick={arrangeFromSelection}
              >
                {singleSelectedId === undefined
                  ? "Arrange from selection (select one node)"
                  : `Arrange from "${singleSelectedId}"`}
              </button>

              <CreateNodeButton className="demo-button" label="Add node">
                Add node…
              </CreateNodeButton>

              <button
                type="button"
                className="demo-button"
                data-demo-control="remove-selection"
                disabled={singleSelectedId === undefined}
                onClick={removeSelected}
              >
                {singleSelectedId === undefined
                  ? "Remove node (select one node)"
                  : `Remove "${singleSelectedId}"`}
              </button>

              <button
                type="button"
                className="demo-button"
                data-demo-control="reset"
                onClick={resetGraph}
              >
                Reset graph
              </button>

              <p className="demo-note">
                {"Removing goes through "}
                <code>builder.graph.removeNode</code>
                {", the only path the removal policy applies to; the canvas' own "}
                {"Delete key goes through the application use case."}
              </p>
            </div>
          </fieldset>
        </div>
      </section>

      <p className="demo-status" role="status" aria-live="polite">
        {`Strategy: ${strategyId} · ${status}`}
      </p>

      <div className="demo-canvas">
        <NoderaEditor builder={builder} layoutDirection={direction} />
      </div>

      <NodeCreationDialog open={dialogOpen} onClose={dialogs.close} onAddNode={addNode} />
    </div>
  );
}
