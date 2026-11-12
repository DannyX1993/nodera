# @nodera/graph-model

The domain entities of the graph: `Graph`, `Node`, `Edge`, `Connection` and the
port model.

- `Graph` is the aggregate that owns node and edge instances by id, with
  `addNode` / `addEdge` and metadata. It only guarantees **structural**
  integrity: identifiers, references and the declared policies.
- `GraphSettings` holds the policies — `SelfLoopPolicy`, `MultiEdgePolicy`,
  `CyclePolicy` (`"allow" | "forbid"`, defaulted by `DEFAULT_GRAPH_SETTINGS`) —
  so acyclic or single-edge graphs are a configuration, not an assumption.
- `Node` carries `NodePosition`, `PortInstance[]`, properties and a definition
  id; the declaration itself is never embedded. `PortDeclaration`,
  `PortDirection`, `PortPlacement`, `PortMultiplicity` and `PortVisual` describe
  ports declaratively.
- `Edge` wraps a `Connection` of two `ConnectionEndpoint`s plus definition id,
  label and metadata; `GraphMetadata` carries graph-level data.
- `GraphError` / `GraphErrorKind` report violations as structured values:
  `duplicate-node-id`, `duplicate-edge-id`, `node-not-found`,
  `edge-not-found`, `self-loop-forbidden`, `multi-edge-forbidden`,
  `cycle-forbidden`.

Semantic correctness (port types, cardinality, definition rules) is not checked
here — that is [`@nodera/validation`](../validation/README.md).
