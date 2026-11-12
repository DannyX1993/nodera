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
 * | Surface | Node transition       | `builder.graphLayout.setNodeTransition(policy)`                |
 * | Surface | Connections           | `builder.graphLayout.setConnectionsPolicy(policy)`             |
 * | Surface | Ports                 | `builder.graphLayout.setPortsPolicy(policy)`                   |
 * | Surface | Edge "+"              | `builder.features.setEdgeInsertion(enabled)` — runtime toggle  |
 * | Camera  | Start framing         | `builder.setViewport({ start })` — remounts the canvas        |
 * | Camera  | Start zoom ceiling    | `builder.setViewport({ start: { maxZoom } })` — remounts       |
 * | Camera  | Follow selection      | `builder.setViewport({ selection })` — next selection change   |
 * | Camera  | Selection zoom ceiling | `builder.setViewport({ selection: { maxZoom } })`               |
 * | Camera  | Camera duration       | `builder.setViewport({ start, selection })` — ms, `0` instant   |
 * | Edge style | Geometry, width, arrows, line style, color, animation | `registries.edges.unregister(type)` + `builder.registerEdge` — an explicit replace of the demo edge definition, which all edges of that type re-render from |
 * | Actions | Arrange               | `builder.graph.arrange({ … })` — one explicit history unit     |
 * | Actions | Arrange from a node   | `builder.graph.arrange({ from, … })` — the scoped call         |
 * | Actions | Add node              | `CreateNodeButton` → `builder.graph.addNode({ after })`        |
 * | Actions | Remove selected node  | `builder.graph.removeNode(id)` — obeys `onRemove`              |
 * | Actions | Reset graph           | `resetDemoGraph` — wipe, then seed again                       |
 * | canvas  | "+" on an edge        | the canvas affordance → the node-creation dialog, whose        |
 * |         |                       | selection the host inserts with `builder.graph.insertNode`      |
 * | canvas  | "+" on the phantom    | the same affordance on the phantom empty state and on every    |
 * |         |                       | leaf's successor placeholder: the host appends with            |
 * |         |                       | `addNode({ after })` + `connect` (two units)                   |
 * | canvas  | Drag an edge path     | the adapter adds or moves a waypoint; the bend persists in the |
 * |         |                       | document (one undo restores the previous shape).               |
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

import type { Builder, EdgeStyleInput, SdkIssues, ViewportConfiguration } from "@nodera/sdk";
import {
  CreateNodeButton,
  NoderaEditor,
  NodeCreationDialog,
  useDialogActions,
  useEditorSnapshot,
  useUiState,
} from "@nodera/react";

import {
  DEMO_EDGE_LABEL,
  DEMO_EDGE_STYLE,
  DEMO_EDGE_TYPE,
  DEMO_LAYOUT,
  DEMO_START_NODE_ID,
  resetDemoGraph,
} from "./builder.js";

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

/** Whether a node moves to its new position or appears there. */
type NodeTransition = ReturnType<Builder["graphLayout"]["nodeTransition"]>;

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

/** Node transitions the host offers, in the order it shows them. */
const NODE_TRANSITIONS = ["instant", "animated"] as const satisfies readonly NodeTransition[];

/** What each transition does, in the host's own words. */
const NODE_TRANSITION_LABEL: Readonly<Record<NodeTransition, string>> = {
  instant: "the node appears at its new position, so a snap-back is a jump",
  animated: "the node glides to its new position, so the return is visible",
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

/** What the camera frames when the canvas mounts, in the order the host offers it. */
const START_FRAMINGS = ["graph", "node"] as const;

/** One start framing rule. */
type StartFraming = (typeof START_FRAMINGS)[number];

/**
 * The raw text the camera controls hold.
 *
 * The three numbers are kept as text on purpose, exactly like the spacing fields:
 * an emptied field means "not configured", while a value the SDK cannot hold
 * (`-1`, `abc`) reaches `setViewport` and is refused there with a diagnostic
 * instead of being swallowed by the host.
 */
interface CameraControls {
  readonly framing: StartFraming;
  readonly startMaxZoom: string;
  readonly selectionMaxZoom: string;
  readonly duration: string;
  readonly followSelection: boolean;
}

/** Values the "Edge style" controls hold: the visual of one edge definition. */
interface DemoEdgeStyle {
  readonly geometry: EdgeStyleInput["geometry"];
  readonly lineStyle: EdgeStyleInput["lineStyle"];
  readonly arrowStart: boolean;
  readonly arrowEnd: boolean;
  readonly color: string;
  readonly animation: EdgeStyleInput["animation"];
  readonly width: number;
}

/** Edge geometries the host offers, in the order it shows them. */
const EDGE_GEOMETRIES = [
  "straight",
  "bezier",
  "step",
  "smooth",
] as const satisfies readonly EdgeStyleInput["geometry"][];

/** Edge line styles the host offers. */
const EDGE_LINE_STYLES = [
  "solid",
  "dashed",
  "dotted",
] as const satisfies readonly EdgeStyleInput["lineStyle"][];

/** Edge animations the host offers. */
const EDGE_ANIMATIONS = [
  "none",
  "flow",
  "dash",
  "pulse",
] as const satisfies readonly EdgeStyleInput["animation"][];

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

/**
 * One spacing value as the canvas placeholder geometry receives it.
 *
 * The spacing fields are text on purpose (an emptied one means "not
 * configured"), so the placeholders get a number only when the text really
 * parses. An emptied field therefore declares nothing and the phantom keeps its
 * own default pitch, instead of painting a `NaN` transform — the refusal the SDK
 * reports for the arrangement is the behaviour to see, not a broken overlay.
 */
function declaredSpacing(text: string): number | undefined {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
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

/**
 * Parses one optional camera number.
 *
 * An emptied field is `undefined` — "not configured", so the documented default
 * applies — and anything else is passed through as the number it says, so a
 * negative or unparsable value is refused by the SDK with its own diagnostic.
 */
function optionalNumber(raw: string): number | undefined {
  return raw.trim() === "" ? undefined : Number(raw);
}

/** The camera configuration the controls describe. */
function cameraConfiguration(values: CameraControls): ViewportConfiguration {
  const duration = optionalNumber(values.duration);
  const startMaxZoom = optionalNumber(values.startMaxZoom);
  const selectionMaxZoom = optionalNumber(values.selectionMaxZoom);
  return {
    start: {
      ...(values.framing === "node" ? { node: DEMO_START_NODE_ID } : {}),
      ...(startMaxZoom === undefined ? {} : { maxZoom: startMaxZoom }),
      ...(duration === undefined ? {} : { duration }),
    },
    ...(values.followSelection
      ? {
          selection: {
            ...(selectionMaxZoom === undefined ? {} : { maxZoom: selectionMaxZoom }),
            ...(duration === undefined ? {} : { duration }),
          },
        }
      : {}),
  };
}

/** The status line one applied camera configuration produces. */
function cameraStatus(configuration: ViewportConfiguration): string {
  const start = configuration.start;
  const framing = start?.node === undefined ? "the whole graph" : `node "${start.node}"`;
  const followed =
    configuration.selection === undefined
      ? "the selection does not move the camera"
      : `the selection is followed up to ${String(configuration.selection.maxZoom)}x`;
  return (
    `Camera applied: start frames ${framing} at up to ${String(start?.maxZoom)}x ` +
    `in ${String(start?.duration)} ms; ${followed}.`
  );
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
  const [nodeTransition, setNodeTransition] = useState<NodeTransition>(() =>
    builder.graphLayout.nodeTransition(),
  );
  const [connections, setConnections] = useState<ConnectionsPolicy>(() =>
    builder.graphLayout.connectionsPolicy(),
  );
  const [ports, setPorts] = useState<PortsPolicy>(() => builder.graphLayout.portsPolicy());
  // The affordance is runtime state now: the panel seeds from the builder and
  // flips it through `builder.features.setEdgeInsertion`, one toggle call.
  const [edgeInsertion, setEdgeInsertion] = useState<boolean>(() =>
    builder.features.edgeInsertion,
  );
  // Waypoint editing is a gated feature flag: the SDK refuses enabling outside
  // free+editable; the canvas additionally gates on the live conditions.
  const [edgeWaypointEditing, setEdgeWaypointEditing] = useState<boolean>(() =>
    builder.features.edgeWaypointEditing,
  );
  const [arrangeOnChange, setArrangeOnChange] = useState<ArrangeOnChange>(() =>
    builder.graphLayout.arrangeOnChange(),
  );
  const [removal, setRemoval] = useState<RemovalPolicy>(() => builder.graphLayout.removalPolicy());
  // The visual of the demo's one edge definition, seeded from the style the
  // builder registered. The canvas only re-derives on editor events, and a
  // definition replace emits none, so a style change also bumps a revision
  // counter that remounts the canvas — the host's own workaround for a
  // framework gap, reported rather than hidden.
  const [edgeStyle, setEdgeStyle] = useState<DemoEdgeStyle>(() => ({ ...DEMO_EDGE_STYLE }));
  // The same counter also covers the camera: the `start` framing is resolved
  // once at mount, so a runtime `setViewport` that changes it only lands on a new
  // mount. One counter, one remount mechanism, for both gaps.
  const [remountRevision, setRemountRevision] = useState(0);
  // The camera is configuration too, so the controls seed from the stored value
  // (`DEMO_VIEWPORT`, resolved) and every change goes through `setViewport`.
  const [camera, setCamera] = useState<CameraControls>(() => {
    const declared = builder.viewport();
    return {
      framing: declared?.start?.node === undefined ? "graph" : "node",
      startMaxZoom:
        declared?.start?.maxZoom === undefined ? "" : String(declared.start.maxZoom),
      followSelection: declared?.selection !== undefined,
      selectionMaxZoom:
        declared?.selection?.maxZoom === undefined ? "" : String(declared.selection.maxZoom),
      duration: declared?.start?.duration === undefined ? "" : String(declared.start.duration),
    };
  });

  /** Remounts the canvas: the host's way of re-applying what it resolves on mount. */
  const remountCanvas = (): void => {
    setRemountRevision((revision) => revision + 1);
  };

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

  /** Changes whether a node moves to its new position or appears there. */
  const selectNodeTransition = (reported: string): void => {
    const transition = offered(NODE_TRANSITIONS, reported);
    if (transition === undefined) {
      return;
    }
    const changed = builder.graphLayout.setNodeTransition(transition);
    if (!changed.ok) {
      setStatus(`Node transition "${reported}" was not applied — ${issueSummary(changed.error)}`);
      return;
    }
    setNodeTransition(changed.value);
    setStatus(`Node transition "${changed.value}": ${NODE_TRANSITION_LABEL[changed.value]}.`);
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

  /** Flips the per-edge "+" affordance at runtime. */
  const toggleEdgeInsertion = (enabled: boolean): void => {
    const changed = builder.features.setEdgeInsertion(enabled);
    if (!changed.ok) {
      setStatus(
        `Edge "+" ${enabled ? "on" : "off"} was not applied — ${issueSummary(changed.error)}`,
      );
      return;
    }
    setEdgeInsertion(changed.value);
    setStatus(`Edge "+" ${changed.value ? "on" : "off"}.`);
  };

  /** Flips the per-edge waypoint editing affordance at runtime. */
  const toggleEdgeWaypointEditing = (enabled: boolean): void => {
    const changed = builder.features.setEdgeWaypointEditing(enabled);
    if (!changed.ok) {
      setStatus(
        `Waypoint editing ${enabled ? "on" : "off"} was not applied — ${issueSummary(changed.error)}`,
      );
      return;
    }
    setEdgeWaypointEditing(changed.value);
    setStatus(`Waypoint editing ${changed.value ? "on" : "off"}.`);
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
   * Applies the camera configuration the controls describe.
   *
   * The SDK validates it exactly as it validates the creation-time group, so a
   * refused value — a negative ceiling, an unparsable field — is reported in the
   * status line and the previous camera stays in force, which is what the canvas
   * keeps reading.
   *
   * `selection` is read live on every selection change, so it needs no remount.
   * `start` is resolved once at mount, so a change to it remounts the canvas
   * through the same revision counter the edge style uses.
   */
  const applyCameraChange = (next: CameraControls, reapplyStart: boolean): void => {
    setCamera(next);
    const changed = builder.setViewport(cameraConfiguration(next));
    if (!changed.ok) {
      setStatus(`Camera was not applied — ${issueSummary(changed.error)}`);
      return;
    }
    if (reapplyStart) {
      remountCanvas();
    }
    const applied = changed.value;
    setStatus(applied === undefined ? "Camera cleared." : cameraStatus(applied));
  };

  /** Changes what the camera frames when the canvas mounts. */
  const selectStartFraming = (reported: string): void => {
    const framing = offered(START_FRAMINGS, reported);
    if (framing === undefined) {
      return;
    }
    applyCameraChange({ ...camera, framing }, true);
  };

  /** Changes the zoom ceiling the start framing fits under; empty = no ceiling. */
  const changeStartZoom = (reported: string): void => {
    applyCameraChange({ ...camera, startMaxZoom: reported }, true);
  };

  /** Turns the follow-the-selection rule on or off; it applies on the next selection change. */
  const toggleFollowSelection = (enabled: boolean): void => {
    applyCameraChange({ ...camera, followSelection: enabled }, false);
  };

  /** Changes the zoom ceiling a followed selection fits under; empty = no ceiling. */
  const changeSelectionZoom = (reported: string): void => {
    applyCameraChange({ ...camera, selectionMaxZoom: reported }, false);
  };

  /** Changes the animation length both rules use; `0` is instant. */
  const changeCameraDuration = (reported: string): void => {
    applyCameraChange({ ...camera, duration: reported }, true);
  };

  /**
   * Rewrites the visual of the demo's one edge definition.
   *
   * The style of an edge type is renderer configuration on its definition, so
   * the change is an explicit replace through the public API: unregister, then
   * register again with the same id and the new visual. A refused replace is
   * reported and leaves the previous style in place; a successful one remounts
   * the canvas, because a definition replace emits no editor event and the
   * canvas would otherwise keep the old style until the next graph change.
   */
  const applyEdgeStyle = (next: DemoEdgeStyle): void => {
    const removed = builder.registries.edges.unregister(DEMO_EDGE_TYPE);
    if (!removed.ok) {
      setStatus(`Edge style was not applied — ${issueSummary(removed.error)}`);
      return;
    }
    const registered = builder.registerEdge({
      type: DEMO_EDGE_TYPE,
      label: DEMO_EDGE_LABEL,
      style: { ...next },
    });
    if (!registered.ok) {
      setStatus(`Edge style was not applied — ${issueSummary(registered.error)}`);
      return;
    }
    setEdgeStyle(next);
    remountCanvas();
    setStatus(
      `Edge style applied: ${next.geometry}, ${next.lineStyle}, ` +
        `arrows ${next.arrowStart ? "start" : "–"}/${next.arrowEnd ? "end" : "–"}, ` +
        `${next.color}, animation ${next.animation}, width ${String(next.width)}. ` +
        `Every edge of "${DEMO_EDGE_TYPE}" re-rendered with it.`,
    );
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
      type: DEMO_EDGE_TYPE,
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
    `camera ${camera.framing}${camera.followSelection ? " + follow" : ""}`,
    `arrange on ${arrangeOnChange}`,
    `remove ${removal}`,
    `edge "+" ${edgeInsertion ? "on" : "off"}`,
    `waypoint editing ${edgeWaypointEditing ? "on" : "off"}`,
    `edge style ${edgeStyle.geometry}/${edgeStyle.lineStyle} w${String(edgeStyle.width)}`,
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
                Node transition
                <select
                  className="demo-select"
                  data-demo-control="node-transition"
                  value={nodeTransition}
                  onChange={(event) => {
                    selectNodeTransition(event.target.value);
                  }}
                >
                  {NODE_TRANSITIONS.map((candidate) => (
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

              <label className="demo-control">
                Edge "+"
                <input
                  type="checkbox"
                  className="demo-checkbox"
                  data-demo-control="edge-insertion"
                  checked={edgeInsertion}
                  onChange={(event) => {
                    toggleEdgeInsertion(event.target.checked);
                  }}
                />
              </label>

              <label className="demo-control">
                Waypoint editing
                <input
                  type="checkbox"
                  className="demo-checkbox"
                  data-demo-control="edge-waypoint-editing"
                  checked={edgeWaypointEditing}
                  onChange={(event) => {
                    toggleEdgeWaypointEditing(event.target.checked);
                  }}
                />
              </label>

              <p className="demo-note">
                {"The per-edge "}
                <code>{'"+"'}</code>
                {" is runtime state: this toggle calls "}
                <code>{"builder.features.setEdgeInsertion(enabled)"}</code>
                {", the canvas re-renders without a rebuild, and the boot value "}
                {"still comes from "}
                <code>{"features: { edgeInsertion: true }"}</code>
                {" in builder.ts."}
              </p>

              <p className="demo-note">
                {"Waypoint editing is gated on free layout and editable connections; "}
                {"the SDK setter refuses outside those conditions with "}
                <code>{"sdk.feature-unavailable"}</code>
                {", and the canvas additionally gates gesture handling on the live values. "}
                {"This demo boots on the layered strategy with fixed connections, so the "}
                {"checkbox refuses until you switch to the free strategy and set "}
                {"connections to editable."}
              </p>
            </div>
          </fieldset>

          <fieldset className="demo-group">
            <legend>Camera</legend>
            <div className="demo-group-body">
              <label className="demo-control">
                Start framing
                <select
                  className="demo-select"
                  data-demo-control="start-framing"
                  value={camera.framing}
                  onChange={(event) => {
                    selectStartFraming(event.target.value);
                  }}
                >
                  {START_FRAMINGS.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Start zoom ceiling
                <input
                  className="demo-number"
                  type="number"
                  min={0.1}
                  step={0.1}
                  data-demo-control="start-zoom"
                  value={camera.startMaxZoom}
                  onChange={(event) => {
                    changeStartZoom(event.target.value);
                  }}
                />
              </label>

              <label className="demo-control">
                Follow selection
                <input
                  type="checkbox"
                  className="demo-checkbox"
                  data-demo-control="follow-selection"
                  checked={camera.followSelection}
                  onChange={(event) => {
                    toggleFollowSelection(event.target.checked);
                  }}
                />
              </label>

              <label className="demo-control">
                Selection zoom ceiling
                <input
                  className="demo-number"
                  type="number"
                  min={0.1}
                  step={0.1}
                  data-demo-control="selection-zoom"
                  value={camera.selectionMaxZoom}
                  onChange={(event) => {
                    changeSelectionZoom(event.target.value);
                  }}
                />
              </label>

              <label className="demo-control">
                Camera duration (ms)
                <input
                  className="demo-number"
                  type="number"
                  min={0}
                  step={50}
                  data-demo-control="camera-duration"
                  value={camera.duration}
                  onChange={(event) => {
                    changeCameraDuration(event.target.value);
                  }}
                />
              </label>

              <p className="demo-note">
                {"Every control calls "}
                <code>{"builder.setViewport(...)"}</code>
                {"; a refused value keeps the previous camera and is reported above. "}
                {"An emptied number means not configured, so the documented default applies. "}
                {"The selection rule takes effect on the next selection change; a start "}
                {"change re-applies the start framing at once by remounting the canvas."}
              </p>
            </div>
          </fieldset>

          <fieldset className="demo-group">
            <legend>Edge style</legend>
            <div className="demo-group-body">
              <label className="demo-control">
                Geometry
                <select
                  className="demo-select"
                  data-demo-control="edge-geometry"
                  value={edgeStyle.geometry}
                  onChange={(event) => {
                    const geometry = offered(EDGE_GEOMETRIES, event.target.value);
                    if (geometry !== undefined) {
                      applyEdgeStyle({ ...edgeStyle, geometry });
                    }
                  }}
                >
                  {EDGE_GEOMETRIES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Line style
                <select
                  className="demo-select"
                  data-demo-control="edge-line-style"
                  value={edgeStyle.lineStyle}
                  onChange={(event) => {
                    const lineStyle = offered(EDGE_LINE_STYLES, event.target.value);
                    if (lineStyle !== undefined) {
                      applyEdgeStyle({ ...edgeStyle, lineStyle });
                    }
                  }}
                >
                  {EDGE_LINE_STYLES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Width
                <input
                  className="demo-number"
                  type="number"
                  min={0.5}
                  step={0.5}
                  data-demo-control="edge-width"
                  value={edgeStyle.width}
                  onChange={(event) => {
                    const width = Number.parseFloat(event.target.value);
                    if (Number.isFinite(width) && width > 0) {
                      applyEdgeStyle({ ...edgeStyle, width });
                    }
                  }}
                />
              </label>

              <label className="demo-control">
                Animation
                <select
                  className="demo-select"
                  data-demo-control="edge-animation"
                  value={edgeStyle.animation}
                  onChange={(event) => {
                    const animation = offered(EDGE_ANIMATIONS, event.target.value);
                    if (animation !== undefined) {
                      applyEdgeStyle({ ...edgeStyle, animation });
                    }
                  }}
                >
                  {EDGE_ANIMATIONS.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              <label className="demo-control">
                Arrow start
                <input
                  type="checkbox"
                  className="demo-checkbox"
                  data-demo-control="edge-arrow-start"
                  checked={edgeStyle.arrowStart}
                  onChange={(event) => {
                    applyEdgeStyle({ ...edgeStyle, arrowStart: event.target.checked });
                  }}
                />
              </label>

              <label className="demo-control">
                Arrow end
                <input
                  type="checkbox"
                  className="demo-checkbox"
                  data-demo-control="edge-arrow-end"
                  checked={edgeStyle.arrowEnd}
                  onChange={(event) => {
                    applyEdgeStyle({ ...edgeStyle, arrowEnd: event.target.checked });
                  }}
                />
              </label>

              <label className="demo-control">
                Color
                <input
                  type="color"
                  className="demo-color"
                  data-demo-control="edge-color"
                  value={edgeStyle.color}
                  onChange={(event) => {
                    applyEdgeStyle({ ...edgeStyle, color: event.target.value });
                  }}
                />
              </label>

              <p className="demo-note">
                {"The style is the visual of the one edge definition this demo uses. "}
                {"Applying it replaces the definition through "}
                <code>{"registries.edges.unregister"}</code>
                {" + "}
                <code>{"builder.registerEdge"}</code>
                {", and the host remounts the canvas (viewport resets), because a "}
                {"definition replace emits no editor event for the canvas to re-derive from."}
              </p>

              <p className="demo-note">
                {"Drag an edge from an intermediate point to bend it: the gesture adds or moves a waypoint and stores the result in the document (one undo restores the previous shape)."}
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
        <NoderaEditor
          builder={builder}
          layoutDirection={direction}
          // The placeholder geometry follows the host's own controls: the phantom
          // of a leaf steps by the rank pitch and lane gap the controls hold, so
          // it lands on the rank line of the sibling branch's real node instead
          // of a fixed default step above it.
          layoutRankSpacing={declaredSpacing(rankSpacing)}
          layoutNodeSpacing={declaredSpacing(spacing)}
          key={`canvas-${String(remountRevision)}`}
        />
      </div>

      <NodeCreationDialog open={dialogOpen} onClose={dialogs.close} onAddNode={addNode} />
    </div>
  );
}
