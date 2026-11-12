# @nodera/application

The application core: use cases, commands, events, history, selection and
clipboard for graph editing. Framework-agnostic — no React, React Flow or DOM.

- `EditorEngine` — owns one editing session: the portable `Graph`, the
  `NoderaDomain` facade, a `HistoryEngine` and an `EventBus`, plus the editor
  state that must never reach the portable document (`selectedNodes`,
  `selectedEdges`, clipboard). `EditorEngineOptions` accepts an existing
  `domain` and the initial `graphId` / `graphSettings`.
- Use cases operate on an engine and return `Result` values: graphs
  (`createGraph`, `loadGraph`, `clearGraph`, `deleteGraph`,
  `updateGraphMetadata`), nodes (`addNode`, `removeNode`, `duplicateNode`,
  `moveNode`, `updateNodeProperties`, `updateNodeMetadata`,
  `insertNodeOnEdge`, `removeNodeSplicing`), edges (`createEdge`, `removeEdge`,
  `updateEdge`, `updateEdgeWaypoints`, `reconnectEdge`), selection, clipboard
  (`copySelection`, `cutSelection`, `pasteSelection`), history (`undo`,
  `redo`), validation (`validateGraph`, `validateNode`, `validateConnection`),
  documents (`importDocument`, `exportDocument`, `migrateDocument`) and
  `arrangeGraph`.
- Events — `EDITOR_EVENT_NAMES` and the typed `EditorEvent` payloads
  (`graph.*`, `node.*`, `edge.*`, `property.changed`, `selection.changed`,
  `validation.completed`, `plugin.*`) carried by `EventBus`. Payloads hold only
  ids, primitives and plain data.
- `UseCaseError` / `UseCaseErrorKind` (`node-not-found`, `duplicate-node-id`,
  `cycle-forbidden`, `invalid-input`, …) and `toUseCaseError` map domain and
  graph-model failures into one application-level shape.
