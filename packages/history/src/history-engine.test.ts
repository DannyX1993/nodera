import { describe, expect, it } from "vitest";
import {
  HistoryEngine,
  EngineDisposedError,
  OpenTransactionError,
  createCommand,
} from "./history-engine.js";

interface TestState {
  value: number;
  log: string[];
}

function makeInitialState(): TestState {
  return { value: 0, log: [] };
}

describe("HistoryEngine", () => {
  it("does nothing when undoing or redoing an empty history", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    expect(engine.undo(state)).toBe(false);
    expect(engine.redo(state)).toBe(false);
  });

  it("undoes a pushed command by applying its reverse effect", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    engine.push(state,
      createCommand<TestState>({
        label: "unit",
        apply: (s) => {
          s.value = 10;
          s.log.push("apply");
        },
        reverse: (s) => {
          s.value = 0;
          s.log.push("reverse");
        },
      }),
    );

    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);
    expect(engine.undo(state)).toBe(true);
    expect(state.value).toBe(0);
    expect(state.log).toEqual(["apply", "reverse"]);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(true);
  });

  it("redoes an undone command", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    engine.push(state,
      createCommand<TestState>({
        label: "unit",
        apply: (s) => {
          s.value = 10;
        },
        reverse: (s) => {
          s.value = 0;
        },
      }),
    );
    engine.undo(state);
    expect(engine.redo(state)).toBe(true);
    expect(state.value).toBe(10);
    expect(engine.canRedo()).toBe(false);
  });

  it("discards the redo stack when a new command is pushed", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    engine.push(state,
      createCommand<TestState>({
        label: "unit",
        apply: (s) => {
          s.value = 10;
        },
        reverse: (s) => {
          s.value = 0;
        },
      }),
    );
    engine.undo(state);
    engine.push(state,
      createCommand<TestState>({
        label: "unit",
        apply: (s) => {
          s.value = 20;
        },
        reverse: (s) => {
          s.value = 10;
        },
      }),
    );

    expect(engine.canRedo()).toBe(false);
    expect(engine.redo(state)).toBe(false);
  });

  it("pushing a command executes its apply effect exactly once", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();
    let applyCalls = 0;

    engine.push(state,
      createCommand<TestState>({
        label: "unit",
        apply: () => {
          applyCalls += 1;
        },
        reverse: () => {},
      }),
    );

    expect(applyCalls).toBe(1);
    expect(engine.canRedo()).toBe(false);
  });

  it("reports position metadata: depth, size and labels", () => {
    const engine = new HistoryEngine<TestState>({ limit: 5 });
    const state = makeInitialState();

    expect(engine.size()).toBe(0);
    expect(engine.depth()).toBe(0);

    engine.push(state, labeledCommand("first", 1));
    engine.push(state, labeledCommand("second", 2));
    engine.undo(state);

    expect(engine.size()).toBe(2);
    expect(engine.depth()).toBe(1);
    expect(engine.labels()).toEqual(["first", "second"]);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(true);
  });

  it("rejects pushes while a transaction is open", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    const txn = engine.beginTransaction({ label: "txn" });
    expect(() => engine.push(state, labeledCommand("solo", 1))).toThrow(
      OpenTransactionError,
    );
    txn.push(labeledCommand("queued", 1));

    txn.commit(state);
    expect(engine.size()).toBe(1);
    expect(engine.depth()).toBe(0);
  });

  it("commits a transaction as one undo unit", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    const txn = engine.beginTransaction({ label: "add-with-edges" });
    txn.push(labeledCommand("add-node", 1));
    txn.push(labeledCommand("add-edge", 2));
    expect(engine.size()).toBe(0); // not on the undo stack yet
    expect(engine.depth()).toBe(0);

    txn.commit(state);
    expect(engine.size()).toBe(1);
    expect(engine.labels()).toEqual(["add-with-edges"]);
    expect(engine.depth()).toBe(0);

    expect(engine.undo(state)).toBe(true);
    expect(state.log).toEqual(["add-node", "add-edge", "reverse:add-edge", "reverse:add-node"]);
  });

  it("reverses transaction commands in LIFO order", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    const txn = engine.beginTransaction();
    txn.push(labeledCommand("a", 1));
    txn.push(labeledCommand("b", 2));
    txn.commit(state);

    engine.undo(state);
    expect(state.log).toEqual(["a", "b", "reverse:b", "reverse:a"]);
  });

  it("aborts a transaction and executes nothing", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    const txn = engine.beginTransaction({ label: "doomed" });
    txn.push(labeledCommand("a", 1));
    txn.abort();

    expect(engine.size()).toBe(0);
    expect(engine.depth()).toBe(0);
    expect(state.log).toEqual([]);
  });

  it("undo during an open transaction is refused", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    engine.push(state, labeledCommand("a", 1));
    engine.beginTransaction();

    expect(() => engine.undo(state)).toThrow(OpenTransactionError);
    expect(() => engine.redo(state)).toThrow(OpenTransactionError);
  });

  it("throws when opening two transactions at once", () => {
    const engine = new HistoryEngine<TestState>();
    engine.beginTransaction();
    expect(() => engine.beginTransaction()).toThrow(OpenTransactionError);
  });

  it("clears the history and any open transaction", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    engine.push(state, labeledCommand("a", 1));
    engine.undo(state);
    engine.beginTransaction();

    engine.clear();

    expect(engine.size()).toBe(0);
    expect(engine.depth()).toBe(0);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    expect(() => engine.undo(state)).not.toThrow(OpenTransactionError);
    expect(engine.undo(state)).toBe(false);
  });

  it("caps the undo stack at the configured limit and reports refusal", () => {
    const engine = new HistoryEngine<TestState>({ limit: 2 });
    const state = makeInitialState();

    expect(engine.push(state, labeledCommand("a", 1))).toEqual({ accepted: true });
    expect(engine.push(state, labeledCommand("b", 2))).toEqual({ accepted: true });
    expect(engine.push(state, labeledCommand("c", 3))).toEqual({
      accepted: false,
      reason: "history-limit",
    });
    expect(engine.size()).toBe(2);
    expect(engine.labels()).toEqual(["a", "b"]);
    expect(engine.undo(state)).toBe(true);
  });

  it("refuses pushes when dispose() sealed the engine", () => {
    const engine = new HistoryEngine<TestState>();
    engine.dispose();
    const state = makeInitialState();
    const result = engine.push(state, labeledCommand("a", 1));
    expect(result).toEqual({ accepted: false, reason: "disposed" });
    expect(result.accepted).toBe(false);
  });

  it("refuses undo after dispose() with EngineDisposedError", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();
    engine.push(state, labeledCommand("a", 1));
    engine.dispose();

    expect(() => engine.undo(state)).toThrow(EngineDisposedError);
  });

  it("notifies listeners on push, undo, redo, transaction commit and clear", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();
    const events: string[] = [];
    engine.subscribe((event) => {
      events.push(event.type);
    });

    engine.push(state, labeledCommand("a", 1));
    const txn = engine.beginTransaction();
    txn.push(labeledCommand("b", 2));
    txn.commit(state);
    engine.undo(state);
    engine.redo(state);
    engine.clear();

    expect(events).toEqual([
      "push",
      "transaction-commit",
      "undo",
      "redo",
      "clear",
    ]);
  });

  it("notifies listeners with the undone command", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();
    const undone: string[] = [];
    engine.subscribe((event) => {
      if (event.type === "undo") {
        undone.push(event.command.label);
      }
    });

    engine.push(state, labeledCommand("move-node", 1));
    engine.undo(state);

    expect(undone).toEqual(["move-node"]);
  });

  it("allows unsubscribing a listener", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();
    const events: string[] = [];
    const unsubscribe = engine.subscribe(() => {
      events.push("x");
    });

    unsubscribe();
    engine.push(state, labeledCommand("a", 1));

    expect(events).toEqual([]);
  });

  it("runs a transaction helper that commits on success", () => {
    const engine = new HistoryEngine<TestState>();
    const state = makeInitialState();

    const result = engine.transaction(state, { label: "helper" }, (txn) => {
      txn.push(labeledCommand("a", 1));
      return "done";
    });

    expect(result).toEqual({ ok: true, value: "done" });
    expect(engine.size()).toBe(1);
  });
});

function labeledCommand(label: string, delta: number) {
  return createCommand<TestState>({
    label,
    apply: (s) => {
      s.value += delta;
      s.log.push(label);
    },
    reverse: (s) => {
      s.value -= delta;
      s.log.push(`reverse:${label}`);
    },
  });
}
