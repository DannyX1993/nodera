/**
 * The SDK Event API: one subscription surface over the editor event bus.
 *
 * Events are composed above the application `EventBus`, which stays unchanged
 * (D10). Every application event is delegated verbatim — the same names, the
 * same payloads, the same delivery order — so a host never needs to know where
 * an event was produced. On top of them the SDK owns five plugin events,
 * `plugin.registered`, `plugin.error` and the Phase 7 lifecycle
 * (`plugin.activated`, `plugin.deactivated`, `plugin.unregistered`), because
 * they describe *builder composition* rather than graph editing: they carry the
 * richer SDK payloads (plugin version and contribution ids) and are emitted
 * only by the SDK.
 *
 * Subscriptions are tracked so `dispose()` can release every listener the API
 * created while the unsubscribe functions already handed to the host stay safe
 * to call. Nothing here throws for data: `emitSdk` ignores a payload that does
 * not belong to the name it was given, and handler failures are isolated by the
 * bus itself.
 */

import { EventBus, type EditorEventName, type EditorEventPayloads } from "@nodera/application";
import type { SdkIssueCode } from "../errors.js";

/** Event names the SDK produces itself, in addition to the application events. */
export const SDK_EVENT_NAMES = [
  "plugin.registered",
  "plugin.error",
  "plugin.activated",
  "plugin.deactivated",
  "plugin.unregistered",
] as const;

/** Name of an SDK-owned event. */
export type SdkEventName = (typeof SDK_EVENT_NAMES)[number];

/** Payload of `plugin.registered`: one accepted plugin and what it added. */
export interface PluginRegisteredEvent {
  readonly pluginId: string;
  readonly version: string;
  /** Contribution ids in registration order, as the plugin registered them. */
  readonly contributionIds: readonly string[];
}

/** Payload of `plugin.error`: one contribution of a plugin that was rejected. */
export interface PluginErrorEvent {
  readonly pluginId: string;
  /** Combined messages of the diagnostics the failed contribution produced. */
  readonly message: string;
  /** Code of the first diagnostic, so a listener can branch without parsing. */
  readonly code: SdkIssueCode;
}

/** Payload of `plugin.activated`: one plugin that is now active. */
export interface PluginActivatedEvent {
  readonly pluginId: string;
  /** Contribution ids the plugin registered, in registration order. */
  readonly contributionIds: readonly string[];
}

/** Payload of `plugin.deactivated`: one plugin that stopped being active. */
export interface PluginDeactivatedEvent {
  readonly pluginId: string;
}

/** Payload of `plugin.unregistered`: one plugin whose contributions were removed. */
export interface PluginUnregisteredEvent {
  readonly pluginId: string;
}

/** Typed payloads of the SDK-owned events. */
export interface SdkEventPayloads {
  readonly "plugin.registered": PluginRegisteredEvent;
  readonly "plugin.error": PluginErrorEvent;
  readonly "plugin.activated": PluginActivatedEvent;
  readonly "plugin.deactivated": PluginDeactivatedEvent;
  readonly "plugin.unregistered": PluginUnregisteredEvent;
}

/** Every payload an SDK-owned event carries. */
export type SdkEventPayload = SdkEventPayloads[SdkEventName];

/** Every event name the builder can deliver. */
export type BuilderEventName = EditorEventName | SdkEventName;

/**
 * Payload delivered for one event name.
 *
 * The SDK-owned names win over their application namesakes: a host subscribing
 * to `plugin.registered` receives the SDK payload, which is what the SDK emits.
 */
export type BuilderEventPayload<E extends BuilderEventName> = E extends SdkEventName
  ? SdkEventPayloads[E]
  : EditorEventPayloads[E];

/** Handler signature of one event name. */
export type BuilderEventHandler<E extends BuilderEventName> = (
  payload: BuilderEventPayload<E>,
) => void;

/**
 * Subscription surface of the builder.
 *
 * Application events resolve to the editor bus of the builder's editing
 * session, so they are neither renamed, re-emitted nor filtered.
 */
export interface BuilderEventApi {
  /** Subscribes to one event name; returns an idempotent unsubscribe function. */
  on<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): () => void;
  /** Subscribes to the next occurrence only. */
  once<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): () => void;
  /** Removes the handler registered for that name, if any. */
  off<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): void;
  /** Delivers one SDK-owned event. Application events are never emitted here. */
  emitSdk(name: SdkEventName, payload: SdkEventPayload): void;
  /** Removes every listener this API registered, including the SDK-owned ones. */
  dispose(): void;
}

/** A stored subscription: what to deliver, and how to stop delivering it. */
interface Subscription {
  readonly name: BuilderEventName;
  /** The handler the host passed, so `off` can match it by identity. */
  readonly handler: AnyHandler;
  /** False once the subscription was removed, so a stale bus handle is inert. */
  active: boolean;
  /** Releases the bus subscription; idempotent. */
  detach: () => void;
}

/** Any handler: every handler type is assignable to one that takes no payload. */
type AnyHandler = (payload: never) => void;

/** Whether a name is one the SDK emits itself. */
function isSdkEventName(name: EditorEventName): name is SdkEventName {
  return (SDK_EVENT_NAMES as readonly string[]).includes(name);
}

/**
 * Payload guards, one per SDK-owned name.
 *
 * The name decides the shape, so the two payloads that carry contribution ids
 * are told apart by the plugin version only a registration announces, and the
 * id-only lifecycle payloads are told apart from the failure payload by the
 * fields only `plugin.error` declares. A payload that does not belong is
 * dropped, so a listener never receives a value whose type the SDK could not
 * state.
 */
function isRegistrationPayload(payload: SdkEventPayload): payload is PluginRegisteredEvent {
  return "version" in payload && "contributionIds" in payload;
}

function isErrorPayload(payload: SdkEventPayload): payload is PluginErrorEvent {
  return "message" in payload && "code" in payload;
}

function isActivationPayload(payload: SdkEventPayload): payload is PluginActivatedEvent {
  return "contributionIds" in payload && !("version" in payload);
}

function isIdOnlyPayload(
  payload: SdkEventPayload,
): payload is PluginDeactivatedEvent | PluginUnregisteredEvent {
  return !("contributionIds" in payload) && !("message" in payload);
}

/** Concrete event API. Hosts only ever see the {@link BuilderEventApi} contract. */
class SdkEventApi implements BuilderEventApi {
  private readonly applicationEvents: EventBus;
  private readonly sdkEvents: EventBus;
  private readonly subscriptions: Subscription[] = [];

  constructor(applicationEvents: EventBus, sdkEvents: EventBus) {
    this.applicationEvents = applicationEvents;
    this.sdkEvents = sdkEvents;
  }

  on<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): () => void {
    return this.subscribe(name, handler, false);
  }

  once<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): () => void {
    return this.subscribe(name, handler, true);
  }

  off<E extends BuilderEventName>(name: E, handler: BuilderEventHandler<E>): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.name === name && subscription.handler === handler) {
        this.remove(subscription);
      }
    }
  }

  emitSdk(name: SdkEventName, payload: SdkEventPayload): void {
    // One case per name: the guard narrows the payload, which is what lets the
    // private bus hold the richer SDK payload under the application event name.
    switch (name) {
      case "plugin.registered":
        if (isRegistrationPayload(payload)) {
          this.sdkEvents.emit({ name, payload });
        }
        return;
      case "plugin.error":
        if (isErrorPayload(payload)) {
          this.sdkEvents.emit({ name, payload });
        }
        return;
      case "plugin.activated":
        if (isActivationPayload(payload)) {
          this.sdkEvents.emit({ name, payload });
        }
        return;
      case "plugin.deactivated":
        if (isIdOnlyPayload(payload)) {
          this.sdkEvents.emit({ name, payload });
        }
        return;
      case "plugin.unregistered":
        if (isIdOnlyPayload(payload)) {
          this.sdkEvents.emit({ name, payload });
        }
        return;
    }
  }

  dispose(): void {
    for (const subscription of [...this.subscriptions]) {
      this.remove(subscription);
    }
  }

  private subscribe<E extends BuilderEventName>(
    name: E,
    handler: BuilderEventHandler<E>,
    once: boolean,
  ): () => void {
    const subscription: Subscription = {
      name,
      handler,
      active: true,
      detach: () => {},
    };
    const deliver = (payload: unknown): void => {
      if (!subscription.active) {
        return;
      }
      // A `once` listener is released before delivery, so a handler that emits
      // the same event again cannot re-enter it.
      if (once) {
        this.remove(subscription);
      }
      // The only narrowing the bus cannot express: an SDK event name is typed
      // with the application payload, but the private SDK bus only ever
      // receives the richer SDK payloads emitted through `emitSdk`.
      handler(payload as BuilderEventPayload<E>);
    };
    subscription.detach = this.bind(name, deliver);
    this.subscriptions.push(subscription);
    return () => {
      this.remove(subscription);
    };
  }

  /** Routes one delivery to the bus that owns the name. */
  private bind(name: BuilderEventName, deliver: (payload: unknown) => void): () => void {
    if (isSdkEventName(name)) {
      return this.sdkEvents.subscribe(name, (event) => deliver(event.payload));
    }
    return this.applicationEvents.subscribe(name, (event) => deliver(event.payload));
  }

  private remove(subscription: Subscription): void {
    if (!subscription.active) {
      return;
    }
    subscription.active = false;
    subscription.detach();
    const index = this.subscriptions.indexOf(subscription);
    if (index >= 0) {
      this.subscriptions.splice(index, 1);
    }
  }
}

/**
 * Builds the event API of a builder over the event bus of its editing session.
 *
 * The SDK-owned bus is private to the API instance, so two builders never share
 * plugin events and disposing one never silences another.
 */
export function createBuilderEvents(applicationEvents: EventBus): BuilderEventApi {
  return new SdkEventApi(applicationEvents, new EventBus());
}
