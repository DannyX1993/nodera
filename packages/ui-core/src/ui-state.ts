import { err, ok, type RegistryError, type Result } from "@nodera/contracts";

import type { DialogDefinition } from "./dialog-definition.js";
import type { DialogRegistry } from "./dialog-registry.js";
import type { LayoutState } from "./layout.js";

/** Interaction mode of the editor surface. */
export type InteractionMode = "select" | "pan";

/**
 * What a manual node drag does when the layout owns the node positions.
 *
 * Host configuration, reflected in the UI state so the canvas re-renders when
 * the host changes it — never a control the framework invents, and never a
 * document write by itself:
 *
 * - `"locked"`: the canvas refuses the drag, so the assigned positions stay.
 * - `"snap-back"`: the canvas lets the node follow the pointer and paints the
 *   assigned position again when the drag ends. Nothing is committed.
 * - `"free"`: the host owns placement, so a drag commits the dropped position
 *   as one history unit (today's behaviour).
 *
 * `"free"` is also the state a store starts from when a host seeds no policy,
 * which keeps a canvas without a policy behaving exactly as before.
 */
export type DragPolicy = "free" | "locked" | "snap-back";

/**
 * Whether a node moves to its new position or appears there.
 *
 * Host configuration, reflected in the UI state so the canvas re-renders when
 * the host changes it:
 *
 * - `"instant"` (the default, and today's behaviour): a position change is
 *   painted at once, so a node that returns to its assigned position under
 *   `dragPolicy: "snap-back"` jumps there.
 * - `"animated"`: the node glides to the position the document holds. An active
 *   drag is never animated, so the node still follows the pointer.
 */
export type NodeTransition = "animated" | "instant";

/**
 * Whether a person may draw a new connection on the canvas.
 *
 * Host configuration, reflected in the UI state so the canvas re-renders when
 * the host changes it:
 *
 * - `"editable"` (the default, and today's behaviour): the canvas accepts a
 *   connection and writes it through the `create-edge` use case.
 * - `"fixed"`: the canvas offers no connectable handle and refuses a connection
 *   that arrives anyway, so the graph keeps the edges it was given.
 *
 * Pure presentation policy: it writes no document state, pushes no history
 * entry and emits no event by itself.
 */
export type ConnectionsPolicy = "editable" | "fixed";

/**
 * Whether the node surface paints the port handles of its nodes.
 *
 * Host configuration, reflected in the UI state so the canvas re-renders when
 * the host changes it:
 *
 * - `"visible"` (the default, and today's behaviour): every port is painted as
 *   a React Flow handle, so connections have something to attach to.
 * - `"hidden"`: no port handle is rendered at all — not merely made
 *   invisible — while node renderers keep receiving their port data.
 */
export type PortsPolicy = "visible" | "hidden";

/** Element a context menu was opened for. */
export type MenuTargetKind = "node" | "edge" | "pane" | "canvas";

/**
 * Currently open menu.
 *
 * Menus are presentation state: they are tracked so surfaces can render them,
 * and they are never written into the portable document.
 */
export interface OpenMenuState {
  readonly kind: "context" | "panel";
  readonly targetKind: MenuTargetKind;
  /** Id of the node or edge the menu targets; empty for panes and canvases. */
  readonly targetId: string;
  /** Pointer position in host coordinates. */
  readonly position: { readonly x: number; readonly y: number };
}

/**
 * Editor UI state: everything the presentation layer owns that is *not* graph
 * domain state, editor selection/history (owned by the application layer) or
 * canvas viewport (owned by the canvas adapter).
 */
export interface UiState {
  /** Id of the theme applied to the UI root. */
  readonly themeId: string;
  /** Id of the applied layout. */
  readonly layoutId: string;
  /** Current panel state of the applied layout. */
  readonly layout: LayoutState | undefined;
  /** Open menu, if any. */
  readonly menu: OpenMenuState | undefined;
  /** Search query of search surfaces. */
  readonly searchQuery: string;
  readonly interactionMode: InteractionMode;
  /** Panel that currently has focus, if any. */
  readonly activePanelId: string | undefined;
  /**
   * Id of the open dialog, if any.
   *
   * Dialogs are presentation state: the id is enough to render one, and it
   * never enters the portable document. Only an id registered in the store's
   * `DialogRegistry` can be set (see {@link UiStateStore.openDialog}).
   */
  readonly activeDialogId: string | undefined;
  /**
   * Edge a node-creation dialog will insert into, if one was opened from the
   * edge "+" affordance.
   *
   * Presentation state only: it tells the dialog which edge the chosen
   * definition belongs to, so it never enters the portable document, and it is
   * cleared when the dialog closes (see {@link UiStateStore.closeDialog}) or
   * when the insertion completes.
   */
  readonly pendingEdgeInsertId: string | undefined;
  /**
   * Node a phantom append places the chosen definition after, if one was opened
   * from a placeholder of the canvas: the phantom empty state (one node or none)
   * or the successor placeholder of a leaf (S21).
   *
   * Presentation state only: it tells the host which node the new node follows
   * (`addNode({ after })`), so it never enters the portable document, and it is
   * cleared when the dialog closes (see {@link UiStateStore.closeDialog}) or when
   * the selection completes.
   *
   * An empty graph records `undefined`, exactly like "no session": the anchor
   * is then simply absent and the host adds the first node. Nothing needs the two
   * cases apart, because the value *is* the anchor and the store clears it with
   * the dialog either way.
   */
  readonly pendingAppendAnchorId: string | undefined;
  /**
   * Node whose split a node-creation dialog will insert before, if one was
   * opened from the branching "+" affordance (S23).
   *
   * Presentation state only: it tells the host which parent the chosen
   * definition branches from — the new node points the parent at it and every
   * former successor edge leaves from it — so it never enters the portable
   * document, and it is cleared when the dialog closes
   * (see {@link UiStateStore.closeDialog}) or when the insertion completes.
   */
  readonly pendingBranchInsertId: string | undefined;
  /**
   * What a manual drag does with the positions the layout assigned.
   *
   * The canvas adapter reads it reactively (a policy change re-renders without
   * a rebuild); the builder seeds it from `graph.layout` and changes it through
   * `builder.graphLayout.setDragPolicy`. It never rewrites a document position
   * on its own.
   */
  readonly dragPolicy: DragPolicy;
  /**
   * Whether a node moves to its new position or appears there.
   *
   * The canvas adapter reads it reactively (a policy change re-renders without
   * a rebuild); the builder seeds it from `graph.layout.nodeTransition` and
   * changes it through `builder.graphLayout.setNodeTransition`. It never
   * rewrites a document position on its own.
   */
  readonly nodeTransition: NodeTransition;
  /**
   * Whether a person may draw a new connection on the canvas.
   *
   * The canvas adapter reads it reactively (a policy change re-renders without
   * a rebuild); the builder seeds it from `graph.layout.connections` and changes
   * it through `builder.graphLayout.setConnectionsPolicy`. It never writes an
   * edge by itself.
   */
  readonly connections: ConnectionsPolicy;
  /**
   * Whether the node surface paints its port handles.
   *
   * The canvas adapter reads it reactively (a policy change re-renders without
   * a rebuild); the builder seeds it from `graph.layout.ports` and changes it
   * through `builder.graphLayout.setPortsPolicy`. Hiding the handles writes
   * nothing: the port data still reaches every node renderer.
   */
  readonly ports: PortsPolicy;
}

/** Initial values accepted by {@link UiStateStore}. */
export interface UiStateStoreOptions {
  /** Theme applied to the UI root. Required: the registry resolves ids. */
  readonly themeId: string;
  /** Layout applied to the shell. Required: the registry resolves ids. */
  readonly layoutId: string;
  readonly layout?: LayoutState;
  readonly interactionMode?: InteractionMode;
  readonly searchQuery?: string;
  /**
   * Dialogs the store can open. Without it the store opens no dialog at all:
   * an id that is not registered is refused instead of rendered.
   */
  readonly dialogRegistry?: DialogRegistry;
  /**
   * Drag policy of the canvas. Defaults to `"free"`, the behaviour of a canvas
   * whose host owns placement.
   */
  readonly dragPolicy?: DragPolicy;
  /**
   * Node transition of the canvas. Defaults to `"instant"`, the behaviour of a
   * canvas that paints every position change at once.
   */
  readonly nodeTransition?: NodeTransition;
  /**
   * Connections policy of the canvas. Defaults to `"editable"`, today's
   * behaviour.
   */
  readonly connections?: ConnectionsPolicy;
  /**
   * Ports policy of the node surface. Defaults to `"visible"`, today's
   * behaviour.
   */
  readonly ports?: PortsPolicy;
}

/** Listener notified after every state change. */
export type UiStateListener = (state: UiState) => void;

/**
 * Framework-agnostic UI state container.
 *
 * Immutable snapshots plus `subscribe` are enough for any binding: React uses
 * `useSyncExternalStore`, other frameworks subscribe directly. There is no
 * hidden global state and no state library dependency.
 */
export class UiStateStore {
  private state: UiState;
  private readonly listeners = new Set<UiStateListener>();
  private readonly dialogRegistry: DialogRegistry | undefined;

  constructor(options: UiStateStoreOptions) {
    this.dialogRegistry = options.dialogRegistry;
    this.state = {
      themeId: options.themeId,
      layoutId: options.layoutId,
      layout: options.layout,
      menu: undefined,
      searchQuery: options.searchQuery ?? "",
      interactionMode: options.interactionMode ?? "select",
      activePanelId: undefined,
      activeDialogId: undefined,
      pendingEdgeInsertId: undefined,
      pendingAppendAnchorId: undefined,
      pendingBranchInsertId: undefined,
      dragPolicy: options.dragPolicy ?? "free",
      nodeTransition: options.nodeTransition ?? "instant",
      connections: options.connections ?? "editable",
      ports: options.ports ?? "visible",
    };
  }

  /** Current immutable snapshot. Its identity changes only on a real change. */
  getState(): UiState {
    return this.state;
  }

  /** Subscribes to state changes. Returns the unsubscribe function. */
  subscribe(listener: UiStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Applies the theme with the given id. */
  setTheme(themeId: string): void {
    if (themeId === this.state.themeId) {
      return;
    }
    this.commit({ ...this.state, themeId });
  }

  /** Applies a layout together with the panel state it produces. */
  setLayout(layoutId: string, layout: LayoutState): void {
    if (layoutId === this.state.layoutId && layout === this.state.layout) {
      return;
    }
    this.commit({ ...this.state, layoutId, layout });
  }

  /**
   * Applies a layout updater, typically a layout-engine reducer.
   *
   * Does nothing until a layout is applied. The updater must return the same
   * reference when nothing changes; the store
   * then keeps the previous snapshot and notifies nobody, which prevents render
   * churn in panels that re-derive on every notification.
   */
  updateLayout(updater: (layout: LayoutState) => LayoutState): void {
    const current = this.state.layout;
    if (current === undefined) {
      return;
    }
    const next = updater(current);
    if (next === current) {
      return;
    }
    this.commit({ ...this.state, layout: next });
  }

  /** Opens a menu. Re-opening the exact same menu is a no-op. */
  openMenu(menu: OpenMenuState): void {
    const current = this.state.menu;
    if (
      current !== undefined &&
      current.kind === menu.kind &&
      current.targetKind === menu.targetKind &&
      current.targetId === menu.targetId &&
      current.position.x === menu.position.x &&
      current.position.y === menu.position.y
    ) {
      return;
    }
    this.commit({ ...this.state, menu });
  }

  /** Closes the open menu, if any. */
  closeMenu(): void {
    if (this.state.menu === undefined) {
      return;
    }
    this.commit({ ...this.state, menu: undefined });
  }

  /** Replaces the search query. */
  setSearchQuery(searchQuery: string): void {
    if (searchQuery === this.state.searchQuery) {
      return;
    }
    this.commit({ ...this.state, searchQuery });
  }

  /** Switches the editor interaction mode. */
  setInteractionMode(interactionMode: InteractionMode): void {
    if (interactionMode === this.state.interactionMode) {
      return;
    }
    this.commit({ ...this.state, interactionMode });
  }

  /** Marks a panel as focused, or clears the focus with `undefined`. */
  setActivePanel(activePanelId: string | undefined): void {
    if (activePanelId === this.state.activePanelId) {
      return;
    }
    this.commit({ ...this.state, activePanelId });
  }

  /**
   * Opens the registered dialog with the given id.
   *
   * The id is validated against the `DialogRegistry` before it reaches the
   * state, so an unknown id is refused with its `not-found` diagnostic and the
   * previous state (and its subscribers) stay untouched. A store without a
   * registry therefore opens nothing, which keeps the invariant "the open id is
   * always a registered one" true by construction.
   */
  openDialog(dialogId: string): Result<DialogDefinition, RegistryError> {
    const registry = this.dialogRegistry;
    if (registry === undefined) {
      return err({
        kind: "not-found",
        id: dialogId,
        message: `no dialog registry is configured, so dialog "${dialogId}" cannot be opened`,
      });
    }
    const resolved = registry.require(dialogId);
    if (!resolved.ok) {
      return resolved;
    }
    if (this.state.activeDialogId !== dialogId) {
      this.commit({ ...this.state, activeDialogId: dialogId });
    }
    return ok(resolved.value);
  }

  /**
   * Records (or clears, with `undefined`) the edge an insertion is pending for.
   *
   * The edge id is opaque here: the store is framework-agnostic and does not
   * check it against a graph. Setting the value already stored notifies nobody.
   */
  setPendingEdgeInsertId(pendingEdgeInsertId: string | undefined): void {
    if (pendingEdgeInsertId === this.state.pendingEdgeInsertId) {
      return;
    }
    this.commit({ ...this.state, pendingEdgeInsertId });
  }

  /**
   * Records (or clears, with `undefined`) the node a phantom append follows.
   *
   * The anchor is the node the placeholder followed, so the same call serves the
   * near-empty phantom (one node or none) and the successor placeholder of a leaf
   * (S21): in both cases the host appends after it with `addNode({ after })`. The
   * node id is opaque here: the store is framework-agnostic and does not check it
   * against a graph. Setting the value already stored notifies nobody.
   */
  setPendingAppendAnchorId(pendingAppendAnchorId: string | undefined): void {
    if (pendingAppendAnchorId === this.state.pendingAppendAnchorId) {
      return;
    }
    this.commit({ ...this.state, pendingAppendAnchorId });
  }

  /**
   * Records (or clears, with `undefined`) the node a branching insertion starts
   * from.
   *
   * The node is the parent whose successors the new node replaces, so the host
   * inserts before its split instead of appending after it. The node id is
   * opaque here: the store is framework-agnostic and does not check it against a
   * graph. Setting the value already stored notifies nobody.
   */
  setPendingBranchInsertId(pendingBranchInsertId: string | undefined): void {
    if (pendingBranchInsertId === this.state.pendingBranchInsertId) {
      return;
    }
    this.commit({ ...this.state, pendingBranchInsertId });
  }

  /**
   * Closes the open dialog, if any, and ends its insertion session.
   *
   * The pending edge, the pending append anchor and the pending branch parent
   * live exactly as long as the dialog they were opened for, so every field is
   * cleared in one commit: a closed dialog can never leave a later `add-node`
   * guessing that it has to insert into an edge, follow an anchor or branch from
   * a node nobody selected anymore.
   */
  closeDialog(): void {
    if (
      this.state.activeDialogId === undefined &&
      this.state.pendingEdgeInsertId === undefined &&
      this.state.pendingAppendAnchorId === undefined &&
      this.state.pendingBranchInsertId === undefined
    ) {
      return;
    }
    this.commit({
      ...this.state,
      activeDialogId: undefined,
      pendingEdgeInsertId: undefined,
      pendingAppendAnchorId: undefined,
      pendingBranchInsertId: undefined,
    });
  }

  /**
   * Applies the drag policy of the canvas.
   *
   * The builder is what validates the value (`builder.graphLayout
   * .setDragPolicy`), so an invalid policy never reaches the store; setting the
   * policy already applied notifies nobody.
   */
  setDragPolicy(dragPolicy: DragPolicy): void {
    if (dragPolicy === this.state.dragPolicy) {
      return;
    }
    this.commit({ ...this.state, dragPolicy });
  }

  /**
   * Applies the node transition of the canvas.
   *
   * The builder is what validates the value (`builder.graphLayout
   * .setNodeTransition`), so an invalid policy never reaches the store; setting
   * the transition already applied notifies nobody.
   */
  setNodeTransition(nodeTransition: NodeTransition): void {
    if (nodeTransition === this.state.nodeTransition) {
      return;
    }
    this.commit({ ...this.state, nodeTransition });
  }

  /**
   * Applies the connections policy of the canvas.
   *
   * The builder is what validates the value (`builder.graphLayout
   * .setConnectionsPolicy`), so an invalid policy never reaches the store;
   * setting the policy already applied notifies nobody.
   */
  setConnections(connections: ConnectionsPolicy): void {
    if (connections === this.state.connections) {
      return;
    }
    this.commit({ ...this.state, connections });
  }

  /**
   * Applies the ports policy of the node surface.
   *
   * The builder is what validates the value (`builder.graphLayout
   * .setPortsPolicy`), so an invalid policy never reaches the store; setting the
   * policy already applied notifies nobody.
   */
  setPorts(ports: PortsPolicy): void {
    if (ports === this.state.ports) {
      return;
    }
    this.commit({ ...this.state, ports });
  }

  private commit(next: UiState): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }
}
