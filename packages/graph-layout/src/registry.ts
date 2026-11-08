/**
 * Registry of the placement strategies a host can choose from.
 *
 * The strategies are code, not declarative data, so this is the composition
 * point where the host — and later a plugin — adds an implementation: the
 * in-house layered strategy that ships today, a `@dagrejs/dagre` adapter or any
 * other algorithm tomorrow. The port stays the same, the registry never
 * overwrites silently, and the builder selects one strategy by id from
 * configuration, so swapping an algorithm never touches the SDK, the
 * application layer or the canvas.
 */

import {
  RegistryStore,
  notFoundError,
  ok,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

import { LAYERED_STRATEGY_ID, createLayeredStrategy } from "./layered.js";
import { FREE_STRATEGY_ID, createFreeStrategy } from "./free.js";
import type { GraphLayoutStrategy } from "./strategy.js";

/** Strategies available without the host registering anything. */
export const BUILT_IN_STRATEGIES: readonly GraphLayoutStrategy[] = [
  createFreeStrategy(),
  createLayeredStrategy(),
];

/** Strategy selected when the host declares none. */
export const DEFAULT_STRATEGY_ID = LAYERED_STRATEGY_ID;

/** Ids of the strategies that ship with the framework. */
export const BUILT_IN_STRATEGY_IDS: readonly string[] = [FREE_STRATEGY_ID, LAYERED_STRATEGY_ID];

/** Options accepted by {@link LayoutStrategyRegistry}. */
export interface LayoutStrategyRegistryOptions {
  /** Strategies the host makes available. Defaults to {@link BUILT_IN_STRATEGIES}. */
  readonly strategies?: readonly GraphLayoutStrategy[];
  /** Strategy selected when the host names none. Defaults to the first available. */
  readonly defaultStrategyId?: string;
}

/**
 * Registry of the strategies a builder can arrange with.
 *
 * Same conflict rules as every other registry in the framework: registering a
 * used id is a `duplicate-id` error and removing an unknown id is `not-found`,
 * so a plugin can never shadow the strategy a host already selected.
 */
export class LayoutStrategyRegistry implements DefinitionRegistry<GraphLayoutStrategy> {
  private readonly store = new RegistryStore<GraphLayoutStrategy>("layout-strategy-registry");
  private currentDefaultId: string;

  constructor(options: LayoutStrategyRegistryOptions = {}) {
    for (const strategy of options.strategies ?? BUILT_IN_STRATEGIES) {
      const registered = this.store.register(strategy);
      if (!registered.ok) {
        throw new Error(registered.error.message);
      }
    }

    if (this.store.size === 0) {
      throw new Error("layout-strategy-registry needs at least one strategy to arrange a graph");
    }

    const initialDefault =
      options.defaultStrategyId ?? options.strategies?.[0]?.id ?? DEFAULT_STRATEGY_ID;
    this.currentDefaultId = initialDefault;
    if (!this.store.has(this.currentDefaultId)) {
      throw new Error(notFoundError(this.currentDefaultId, "layout-strategy-registry").message);
    }
  }

  register(strategy: GraphLayoutStrategy): Result<GraphLayoutStrategy, RegistryError> {
    return this.store.register(strategy);
  }

  unregister(id: string): Result<GraphLayoutStrategy, RegistryError> {
    const removed = this.store.unregister(id);
    if (removed.ok && id === this.currentDefaultId) {
      // A default cannot outlive its entry: the selection moves to the first
      // strategy that remains, and an emptied registry has no default at all.
      const remaining = this.store.all();
      this.currentDefaultId = remaining[0]?.id ?? "";
    }
    return removed;
  }

  get(id: string): GraphLayoutStrategy | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<GraphLayoutStrategy, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly GraphLayoutStrategy[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }

  /** Id of the strategy selected when the host names none. */
  get defaultStrategyId(): string {
    return this.currentDefaultId;
  }

  /** Strategy selected when the host names none. */
  getDefault(): GraphLayoutStrategy {
    if (this.currentDefaultId === "") {
      throw new Error("layout-strategy-registry has no strategies, so no default can be selected");
    }
    const strategy = this.store.get(this.currentDefaultId);
    if (strategy === undefined) {
      // Unreachable: construction, setDefault and unregister all keep the id registered.
      throw new Error(notFoundError(this.currentDefaultId, "layout-strategy-registry").message);
    }
    return strategy;
  }

  /** Selects the default strategy. Rejects ids that are not registered. */
  setDefault(id: string): Result<GraphLayoutStrategy, RegistryError> {
    const strategy = this.store.require(id);
    if (!strategy.ok) {
      return strategy;
    }
    this.currentDefaultId = id;
    return ok(strategy.value);
  }
}
