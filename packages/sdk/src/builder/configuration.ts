/**
 * The declarative configuration a host hands to `createBuilder`.
 *
 * Every field is optional and grouped by concern, so a host can start from the
 * framework defaults and add exactly what it needs. Nothing here is a
 * behaviour: the configuration is data, validated by the builder composition
 * root before a single registry is mutated.
 */

import type { GraphSettings } from "@nodera/graph-model";
import type { CreateThemeInput } from "@nodera/theme-engine";
import type { DialogDefinition, LayoutDefinition } from "@nodera/ui-core";
import type { BuilderAdapterInput } from "../adapter/adapter.js";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { BuilderPlugin } from "../plugin/plugin.js";
import type { BuilderFeaturesInput } from "./features.js";

/** Definitions the builder registers before the host touches it. */
export interface BuilderRegistryConfiguration {
  readonly nodes?: readonly NodeDefinitionInput[];
  readonly edges?: readonly EdgeDefinitionInput[];
  readonly properties?: readonly PropertyInput[];
  readonly themes?: readonly CreateThemeInput[];
  readonly layouts?: readonly LayoutDefinition[];
  /**
   * Dialogs the UI state may open, e.g. the node-creation dialog behind a “+”
   * affordance.
   *
   * The list *replaces* the framework's built-in dialogs — `DialogRegistry`'s
   * own seeding rule, the same one layouts follow — so a host that wants its own
   * dialog set passes exactly those definitions. Without the field the built-ins
   * are seeded, which is what makes the framework's “+” affordances work out of
   * the box. A duplicate id or a malformed definition refuses the builder with
   * its path; nothing is half-registered.
   */
  readonly dialogs?: readonly DialogDefinition[];
}

/** Portable document format the builder produces and consumes. */
export interface BuilderDocumentConfiguration {
  /** Only the canonical Generic Graph Document format is supported. */
  readonly format?: "ggd";
  /** Format version, semver-shaped. Defaults to the document package default. */
  readonly version?: string;
}

/** Format and version the builder resolved from the configuration. */
export interface BuilderDocumentFormat {
  readonly format: string;
  readonly version: string;
}

/** Theme and layout the builder applies to the UI state it owns. */
export interface BuilderUiConfiguration {
  /** Theme id registered in the builder theme registry. */
  readonly theme?: string;
  /** Layout id registered in the builder layout registry. */
  readonly layout?: string;
}

/**
 * What a structural change does with the positions the layout owns.
 *
 * `"never"` keeps today's rule: only an explicit `Arrange` moves a node.
 * `"downstream"` arranges the changed node and its descendants after the change,
 * as its own history unit. Host configuration, never a user toggle.
 */
export type ArrangeOnChange = "never" | "downstream";

/**
 * What removing a node does with the relations it carried.
 *
 * `"detach"` — today's behaviour — removes the node and its edges and leaves the
 * hierarchy above and below apart. `"splice"` joins every predecessor to every
 * successor, so the graph stays connected through one hop. Host configuration,
 * never a user toggle.
 */
export type RemovalPolicy = "detach" | "splice";

/**
 * How the builder places nodes: on add, and on an explicit `Arrange`.
 *
 * Configuration only, never a behaviour on its own and never a runtime toggle
 * the framework invents: the host declares the policy. `mode` decides what an
 * add does with a node that carries no position; `strategy` decides which
 * placement implementation an explicit `builder.graph.arrange()` runs. Neither
 * moves a node on its own, and no add, edge change or read re-lays out an
 * existing graph — unless the host asks for exactly that with
 * `arrangeOnChange: "downstream"`.
 */
export interface GraphLayoutConfiguration {
  /** `"free"` (default): the host positions every node. `"auto"`: the builder places the ones left unpositioned. */
  readonly mode?: "free" | "auto";
  /** Direction the automatic placement grows in, and the axis `Arrange` advances the ranks along. Defaults to `"horizontal"`. */
  readonly direction?: "horizontal" | "vertical";
  /**
   * Distance between adjacent automatic slots, in document units, and the
   * `Arrange` in-rank spacing. Defaults to 240.
   */
  readonly spacing?: number;
  /**
   * Globally qualified id of the strategy `Arrange` runs, e.g.
   * `nodera.graph-layout.layered` (the default) or an adapter the host
   * registered with `builder.graphLayout.register`.
   */
  readonly strategy?: string;
  /**
   * Distance between consecutive ranks of an `Arrange`, in document units.
   * Defaults to the declared `spacing`.
   */
  readonly rankSpacing?: number;
  /**
   * What a manual drag does with the positions the layout assigned.
   *
   * Only meaningful when the layout owns placement (`mode: "auto"`): `"locked"`
   * (the default) makes the canvas refuse the drag, `"snap-back"` lets the node
   * follow the pointer and paints the assigned position again when the drag
   * ends. Neither ever rewrites a document position. In `"free"` mode the host
   * owns placement, so the effective policy is `"free"` and this field places
   * nothing. The policy can be changed at runtime with
   * `builder.graphLayout.setDragPolicy`.
   */
  readonly drag?: "locked" | "snap-back";
  /**
   * Whether a node moves to its new position or appears there.
   *
   * `"instant"` (the default, and today's behaviour) paints a position change
   * at once: under `drag: "snap-back"` the node jumps back to the position the
   * layout assigned when the drag ends. `"animated"` makes the node glide there
   * instead, so the return is visible. An active drag is never animated, so the
   * node still follows the pointer with no lag.
   *
   * It is presentation policy: A transition never writes the document, pushes no
   * history entry and emits no event. It applies whatever owns the positions, and
   * the transition can be changed at runtime with
   * `builder.graphLayout.setNodeTransition`. The duration comes from the
   * `--ndr-node-transition-duration` and `--ndr-node-transition-easing` theme
   * tokens when the host's theme defines them, and is skipped entirely under
   * `prefers-reduced-motion: reduce`.
   */
  readonly nodeTransition?: "animated" | "instant";
  /**
   * What a structural change does with the positions the layout owns.
   *
   * `"never"` (the default) is today's rule: only an explicit
   * `builder.graph.arrange()` moves a node. `"downstream"` arranges the node a
   * successful `insertNode` created — and the target of a successful `connect` —
   * together with its descendants, **after** the mutation and as its own history
   * unit, so one undo steps the arrangement back and a second undo steps the
   * mutation back. An arrangement the strategy refuses never fails the mutation
   * that triggered it: it is reported on `builder.graph.lastAutoArrangement()`.
   *
   * It only takes effect while the layout owns the positions (`mode: "auto"`):
   * in `"free"` mode the host places every node, so nothing is arranged
   * automatically. The policy is host configuration, never a user toggle, and can
   * be changed at runtime with `builder.graphLayout.setArrangeOnChange`.
   */
  readonly arrangeOnChange?: ArrangeOnChange;
  /**
   * What removing a node does with the relations it carried.
   *
   * `"detach"` (the default) is today's behaviour: the node and every edge it
   * carried leave the graph together and the hierarchy above and below is left
   * apart. `"splice"` removes the node **and** joins each predecessor to each
   * successor, so the graph stays connected through one hop: the spliced edges
   * keep the ports of the edges that went away (the predecessor's from its
   * incoming edge, the successor's from its outgoing one), take the removed
   * node's incoming edge definition type, and a pair that would duplicate an
   * existing edge is skipped instead of written twice.
   *
   * The removal, the edge removals and the spliced edges are **one** history
   * unit: one undo restores the node with its original edges. A node with no
   * predecessor or no successor degrades to a plain removal, in the same unit.
   * When `arrangeOnChange` is `"downstream"` and the layout owns the positions,
   * the spliced predecessors are arranged afterwards as a unit of their own, and
   * a refused arrangement never fails the removal — it is reported on
   * `builder.graph.lastAutoArrangement()`.
   *
   * The policy can be changed at runtime with
   * `builder.graphLayout.setRemovalPolicy`.
   */
  readonly onRemove?: RemovalPolicy;
  /**
   * Whether a person may draw a new connection on the canvas.
   *
   * `"editable"` (the default) is today's behaviour: a connection the canvas
   * validates becomes one `create-edge` history unit. `"fixed"` is what a graph
   * whose edges the layout owns declares — the canvas offers no connectable
   * handle and refuses a connection that arrives anyway, so nobody can add an
   * edge the arrangement does not know about. It is presentation policy: no
   * document write, no history entry and no event on its own, and existing edges
   * stay editable in the document. The policy can be changed at runtime with
   * `builder.graphLayout.setConnectionsPolicy`.
   */
  readonly connections?: "editable" | "fixed";
  /**
   * Whether the node surface paints the port handles of its nodes.
   *
   * `"visible"` (the default) is today's behaviour. `"hidden"` renders no port
   * handle at all — not merely an invisible one — which is what a layout-owned
   * graph with fixed connections declares: there is nothing to drag a connection
   * from, while node renderers keep receiving their port data. It is presentation
   * policy: no document write, no history entry and no event on its own. The
   * policy can be changed at runtime with `builder.graphLayout.setPortsPolicy`.
   */
  readonly ports?: "visible" | "hidden";
}

/** Initial graph of the builder's own editing session. */
export interface BuilderGraphConfiguration {
  readonly graphId?: string;
  readonly settings?: GraphSettings;
  readonly layout?: GraphLayoutConfiguration;
}

/** Everything a host may configure on the builder. */
export interface BuilderConfiguration {
  /** Globally qualified builder id. Defaults to `nodera.builder`. */
  readonly id?: string;
  readonly adapter?: BuilderAdapterInput;
  readonly registry?: BuilderRegistryConfiguration;
  readonly features?: BuilderFeaturesInput;
  readonly document?: BuilderDocumentConfiguration;
  readonly ui?: BuilderUiConfiguration;
  readonly graph?: BuilderGraphConfiguration;
  /** Plugins installed while composing the builder, after the declarative registries. */
  readonly plugins?: readonly BuilderPlugin[];
}
