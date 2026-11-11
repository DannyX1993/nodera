/**
 * Camera framing: what the canvas frames, with which zoom, and how fast.
 *
 * Pure decision logic, sitting between the host's `viewport` configuration and
 * React Flow's `fitView`. It imports no React and no React Flow value — a type
 * import is all this file needs — so the rules below are testable without a
 * DOM, which matters because jsdom measures a 0×0 canvas and no assertion there
 * can see the resulting transform.
 *
 * Document discipline (AGENTS.md §5.3): a plan is presentation state for one
 * call. Nothing here writes the document, the UI state, a node's data or a
 * history entry, and no application event is emitted by applying one.
 */

import type { FitViewOptions } from "@xyflow/react";
import type { ViewportConfiguration } from "@nodera/sdk";

/** React Flow padding a framing uses when the host declares none. */
const DEFAULT_PADDING = 0.1;

/** Animation length, in milliseconds, a framing uses when the host declares none. */
const DEFAULT_DURATION = 200;

/** Zoom ceiling a framing fits under when the host declares none. */
const DEFAULT_MAX_ZOOM = 1.5;

/** One camera framing the canvas applies through `fitView`. */
export interface ViewportFitPlan {
  /** Node ids to frame; absent means the whole graph. */
  readonly nodes?: readonly string[];
  /** Exact level, when the config pins one. */
  readonly zoom?: number;
  readonly maxZoom?: number;
  readonly padding: number;
  readonly duration: number;
}

/** The zoom rule of one group: absolute level, ceiling, padding and length. */
interface ZoomRule {
  readonly zoom?: number;
  readonly maxZoom?: number;
  readonly padding?: number;
  readonly duration?: number;
}

/**
 * Builds one plan from a zoom rule.
 *
 * `absoluteZoom` decides whether the rule's `zoom` may pin the level: it does
 * for the framing the host configured, never for a framed set that contains an
 * edge (framing one edge at an absolute level zooms violently, so that set
 * follows the graph-fit rule) nor for the whole-graph restore when the selection
 * is cleared with no `start` rule to return to.
 *
 * An absolute `zoom` drops `maxZoom` from the plan: React Flow's clamp
 * (`minZoom === maxZoom === zoom`) already decides the level, so a ceiling
 * alongside it would only suggest a second, conflicting rule.
 */
function planFor(
  nodes: readonly string[] | undefined,
  rule: ZoomRule | undefined,
  absoluteZoom: boolean,
): ViewportFitPlan {
  const zoom = absoluteZoom ? rule?.zoom : undefined;

  return {
    ...(nodes === undefined || nodes.length === 0 ? {} : { nodes }),
    ...(zoom === undefined ? {} : { zoom }),
    ...(zoom === undefined ? { maxZoom: rule?.maxZoom ?? DEFAULT_MAX_ZOOM } : {}),
    padding: rule?.padding ?? DEFAULT_PADDING,
    duration: rule?.duration ?? DEFAULT_DURATION,
  };
}

/**
 * What the camera should frame on mount, or `undefined` for today's `fitView`.
 *
 * With no configuration at all the canvas keeps the plain React Flow `fitView`
 * it always had — a host that never configures a camera sees no change. A
 * declared `start` group frames the graph (or the one node it names) with the
 * documented defaults, and a declared group without a `start` rule frames the
 * whole graph, which is the same framing under the same defaults.
 */
export function startViewportPlan(
  config: ViewportConfiguration | undefined,
): ViewportFitPlan | undefined {
  if (config === undefined) {
    return undefined;
  }
  const start = config.start;
  const nodes = start?.node === undefined ? undefined : [start.node];
  return planFor(nodes, start, true);
}

/** The selection the camera may follow: node ids and edge ids, in engine order. */
export interface SelectionForViewport {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
}

/**
 * What the camera should frame after a selection change, or `undefined` for
 * "leave the camera alone".
 *
 * Three cases, one rule each:
 *
 * - no `selection` group: nothing moves, whatever is selected (today's
 *   behaviour);
 * - the selection is empty: the camera returns to the `start` framing, or — when
 *   the host declared no `start` rule — to the whole graph with the selection's
 *   own padding, ceiling and length, so clearing a selection always restores a
 *   view instead of leaving the camera wherever it stopped;
 * - something is selected: the camera frames the selected nodes, plus the
 *   selected edges when `edges` is on. Only the nodes are followed while `edges`
 *   is off. A framed set that contains an edge always uses the graph-fit rule,
 *   never the absolute `zoom`, because pinning a level around a single edge
 *   zooms violently. A selection of edges alone with `edges` off is not followed
 *   at all: nothing in the followed set changed, so the camera stays put rather
 *   than jumping back to the start framing.
 */
export function selectionViewportPlan(
  config: ViewportConfiguration | undefined,
  selection: SelectionForViewport,
): ViewportFitPlan | undefined {
  const rule = config?.selection;
  if (config === undefined || rule === undefined) {
    return undefined;
  }

  if (selection.nodes.length === 0 && selection.edges.length === 0) {
    return startViewportPlan(config) ?? planFor(undefined, rule, false);
  }

  const followsEdges = rule.edges === true;
  const framed =
    followsEdges ? [...selection.nodes, ...selection.edges] : [...selection.nodes];
  if (framed.length === 0) {
    return undefined;
  }

  const includesEdge = followsEdges && selection.edges.length > 0;
  return planFor(framed, rule, !includesEdge);
}

/**
 * Translates a plan into React Flow's `fitView` options.
 *
 * An absolute level is enforced through React Flow's own clamp rather than
 * coordinate maths: `minZoom === maxZoom === zoom` leaves it no other level to
 * choose, so the camera lands exactly there. Without an absolute level the
 * camera fits the framed set with `padding` and stops at `maxZoom`.
 */
export function viewportFitOptions(plan: ViewportFitPlan): FitViewOptions {
  return {
    ...(plan.nodes === undefined ? {} : { nodes: plan.nodes.map((id) => ({ id })) }),
    ...(plan.zoom === undefined ? {} : { minZoom: plan.zoom, maxZoom: plan.zoom }),
    ...(plan.zoom === undefined && plan.maxZoom !== undefined
      ? { maxZoom: plan.maxZoom }
      : {}),
    padding: plan.padding,
    duration: plan.duration,
  };
}
