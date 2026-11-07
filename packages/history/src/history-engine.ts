/**
 * Framework-agnostic reversible command engine.
 *
 * Owns only the mechanics of undo/redo: a command stack with an undo and a
 * redo cursor, transaction grouping, history limits and change listeners.
 * It knows nothing about graphs, documents or execution engines: callers
 * supply state-mutating `apply`/`reverse` effects over their own state.
 */

/** A reversible unit of change over caller-owned state. */
export interface ReversibleCommand<S> {
  /** Stable human-readable name, e.g. "add-node". */
  readonly label: string;
  /** Applies the forward effect to the state. Runs once at push time. */
  readonly apply: (state: S) => void;
  /** Reverts the effect. Must be the exact inverse of `apply`. */
  readonly reverse: (state: S) => void;
}

/** Creates a command object from an apply/reverse pair. */
export function createCommand<S>(command: ReversibleCommand<S>): ReversibleCommand<S> {
  return command;
}

/** Result of a push attempt. */
export type PushResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: "history-limit" | "disposed" };

/** Events emitted to history listeners. */
export type HistoryEvent<S> =
  | { readonly type: "push"; readonly command: ReversibleCommand<S> }
  | { readonly type: "undo"; readonly command: ReversibleCommand<S> }
  | { readonly type: "redo"; readonly command: ReversibleCommand<S> }
  | { readonly type: "transaction-commit"; readonly commands: readonly ReversibleCommand<S>[] }
  | { readonly type: "clear" };

export type HistoryListener<S> = (event: HistoryEvent<S>) => void;

/** Error thrown when an operation is refused because a transaction is open. */
export class OpenTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenTransactionError";
  }
}

/** Error thrown when undo/redo is refused because the engine was disposed. */
export class EngineDisposedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineDisposedError";
  }
}

interface TransactionOptions {
  /** Label for the committed undo unit. Defaults to "transaction". */
  readonly label?: string;
}

interface TransactionApi<S> {
  /** Queues a command inside the transaction (no effect runs yet). */
  push(command: ReversibleCommand<S>): void;
  /** Commits every queued command as one undo unit. */
  commit(state: S): void;
  /** Discards every queued command without running any reverse effect. */
  abort(): void;
}

interface HistoryEngineOptions {
  /** Maximum number of units kept on the undo stack. Default: unlimited. */
  readonly limit?: number;
}

interface Group<S> {
  readonly label: string;
  readonly commands: ReversibleCommand<S>[];
}

/**
 * Undo/redo engine over caller-owned state.
 *
 * Pushing a command runs its `apply` effect exactly once and places it on the
 * undo stack, discarding the redo stack. `undo`/`redo` run `reverse`/`apply`
 * and move the cursor. Transactions group several commands into one unit.
 */
export class HistoryEngine<S> {
  private readonly limit: number | undefined;
  private readonly undoStack: Group<S>[] = [];
  private redoStack: Group<S>[] = [];
  private open: Group<S> | undefined;
  private disposed = false;
  private readonly listeners = new Set<HistoryListener<S>>();

  constructor(options: HistoryEngineOptions = {}) {
    if (options.limit !== undefined && options.limit < 1) {
      throw new RangeError("history limit must be >= 1");
    }
    this.limit = options.limit;
  }

  /** Registers a listener; returns an unsubscribe function. */
  subscribe(listener: HistoryListener<S>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** True while a transaction is open. */
  get transactionOpen(): boolean {
    return this.open !== undefined;
  }

  /** Creates a transaction. Only one may be open at a time. */
  beginTransaction(options: TransactionOptions = {}): TransactionApi<S> {
    if (this.open !== undefined) {
      throw new OpenTransactionError("a transaction is already open");
    }
    const group: Group<S> = { label: options.label ?? "transaction", commands: [] };
    this.open = group;
    return {
      push: (command) => {
        if (this.open !== group) {
          throw new OpenTransactionError("the transaction is no longer open");
        }
        group.commands.push(command);
      },
      commit: (state) => {
        if (this.open !== group) {
          throw new OpenTransactionError("the transaction is no longer open");
        }
        this.open = undefined;
        if (group.commands.length === 0) {
          return;
        }
        this.runAll(state, group.commands);
        this.redoStack = [];
        this.pushGroup(group);
        this.emit({ type: "transaction-commit", commands: group.commands });
      },
      abort: () => {
        if (this.open === group) {
          this.open = undefined;
        }
      },
    };
  }

  /**
   * Runs a helper as a transaction: commits on return, aborts on throw.
   */
  transaction<R>(
    state: S,
    options: TransactionOptions,
    run: (transaction: TransactionApi<S>) => R,
  ): { ok: true; value: R } | { ok: false; error: unknown } {
    const txn = this.beginTransaction(options);
    try {
      const value = run(txn);
      txn.commit(state);
      return { ok: true, value };
    } catch (error) {
      txn.abort();
      return { ok: false, error };
    }
  }

  /**
   * Pushes a command: runs its apply effect once, discards the redo stack and
   * places the command on the undo stack (subject to the configured limit).
   */
  push(state: S, command: ReversibleCommand<S>): PushResult {
    if (this.disposed) {
      return { accepted: false, reason: "disposed" };
    }
    if (this.open !== undefined) {
      throw new OpenTransactionError("push is refused while a transaction is open; use the transaction");
    }
    if (this.limit !== undefined && this.undoStack.length >= this.limit) {
      return { accepted: false, reason: "history-limit" };
    }
    command.apply(state);
    this.redoStack = [];
    this.pushGroup({ label: command.label, commands: [command] });
    this.emit({ type: "push", command });
    return { accepted: true };
  }

  /** Reverts the top undo unit. Returns false when nothing to undo. */
  undo(state: S): boolean {
    if (this.disposed) {
      throw new EngineDisposedError("the history engine is disposed");
    }
    if (this.open !== undefined) {
      throw new OpenTransactionError("undo is refused while a transaction is open");
    }
    const group = this.undoStack.pop();
    if (group === undefined) {
      return false;
    }
    this.runAllReverse(state, group.commands);
    this.redoStack.push(group);
    this.emit({ type: "undo", command: group.commands[group.commands.length - 1]! });
    return true;
  }

  /** Re-applies the top redo unit. Returns false when nothing to redo. */
  redo(state: S): boolean {
    if (this.disposed) {
      throw new EngineDisposedError("the history engine is disposed");
    }
    if (this.open !== undefined) {
      throw new OpenTransactionError("redo is refused while a transaction is open");
    }
    const group = this.redoStack.pop();
    if (group === undefined) {
      return false;
    }
    this.runAll(state, group.commands);
    this.undoStack.push(group);
    this.emit({ type: "redo", command: group.commands[group.commands.length - 1]! });
    return true;
  }

  /** Seals the engine: further pushes are refused and undo/redo throw. */
  dispose(): void {
    this.disposed = true;
    this.open = undefined;
  }

  /** Clears the whole history and any open transaction. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack = [];
    this.open = undefined;
    this.emit({ type: "clear" });
  }

  /** Number of units retained (undo stack + redo stack). */
  size(): number {
    return this.undoStack.length + this.redoStack.length;
  }

  /** Number of units on the redo stack. */
  redoSize(): number {
    return this.redoStack.length;
  }

  /** Undo cursor position (units ahead). */
  depth(): number {
    return this.redoStack.length;
  }

  /** Labels of the retained units, oldest first (undo stack then redo stack). */
  labels(): string[] {
    return [...this.undoStack, ...this.redoStack].map((group) => group.label);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private pushGroup(group: Group<S>): void {
    this.undoStack.push(group);
    if (this.limit !== undefined) {
      while (this.undoStack.length > this.limit) {
        this.undoStack.shift();
      }
    }
  }

  private runAll(state: S, commands: readonly ReversibleCommand<S>[]): void {
    for (const command of commands) {
      command.apply(state);
    }
  }

  private runAllReverse(state: S, commands: readonly ReversibleCommand<S>[]): void {
    for (let i = commands.length - 1; i >= 0; i -= 1) {
      commands[i]!.reverse(state);
    }
  }

  private emit(event: HistoryEvent<S>): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
