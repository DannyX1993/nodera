# @nodera/history

A framework-agnostic reversible command engine: undo/redo mechanics only.

- `ReversibleCommand<S>` — `{ label, apply(state), reverse(state) }` over
  caller-owned state; `createCommand` builds one.
- `HistoryEngine<S>` — `push(state, command)` (returns a `PushResult`:
  accepted, `history-limit` or `disposed`), `undo(state)` / `redo(state)`,
  `canUndo` / `canRedo`, `labels`, `depth`, `size` / `redoSize`, `clear` and
  `dispose`.
- Transactions — `beginTransaction` / `transaction` group related commands so
  they undo as one user action; `OpenTransactionError` refuses nested or
  conflicting operations and `EngineDisposedError` guards use after disposal.
- `subscribe` — `HistoryListener`s receive `HistoryEvent`s (`push`, `undo`,
  `redo`, `transaction-commit`, `clear`).

It knows nothing about graphs, documents, React or execution engines: the
caller supplies the state and the `apply` / `reverse` pair.
