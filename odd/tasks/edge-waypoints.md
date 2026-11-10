# Edge waypoint editing

Drag an edge from an intermediate point to reshape it; the shape is per-edge
instance state, portable in the GGD document.

## Specs

- S1: "El SDK deberia tener una opcion para poder editar los edges en el sentido de editar la forma y grosor" — the SDK exposes edge reshaping; thickness (`width`) is already delivered in a prior work unit.
- S2: "Cambiar la forma me refiero a que puedas modificarla arrastrando el edge desde un punto" — a person drags an edge from an intermediate point to bend it; the dragged shape persists in the document as per-edge waypoints.
- S3: Waypoints are optional `Position[]` on the edge instance, in the same flow coordinate space as node positions; an edge without waypoints renders exactly as before.
- S4: Changing waypoints is one history unit (undo/redo restores the previous shape) and emits `edge.updated` plus `graph.changed`.
- S5: The GGD document carries waypoints on the edge instance as an optional field; round-trip `deserialize(serialize(document))` preserves them; documents without them are untouched; documents with them import into the domain graph.
- S6: The public SDK exposes the operation on `builder.graph` with `Result`-returning refusal diagnostics (unknown edge, non-finite coordinate), never throwing.
- S7: The demo (layout-switch) lets a person add, drag and remove waypoints on canvas edges.

## Tasks

- T1 (S3): `Edge` gains waypoints in graph-model (state + setter + validation). Route: inline. Commit: edge-waypoints-1.
- T2 (S5): document layer: `DocumentEdgeInstance.waypoints`, export/import mapping, schema, round-trip tests. Route: worker. Commit: edge-waypoints-2.
- T3 (S4): application use case `updateEdgeWaypoints` (one history unit, events), tests. Route: worker. Commit: edge-waypoints-3.
- T4 (S6): SDK `builder.graph.setEdgeWaypoints` with diagnostics, tests. Route: worker. Commit: edge-waypoints-4.
- T5 (S2, S7): React Flow adapter: mapper carries waypoints, default edge renderer paths through them, waypoint handles (add by dragging the edge, move by dragging a handle, remove by double-click), wired to the application use case; tests. Route: worker. Commit: edge-waypoints-5.
- T6 (S7): demo integration + docs (GGD-CONTRACT.md, SDK-GUIDE.md). Route: worker. Commit: edge-waypoints-6.

## Log

- L1: "El SDK deberia tener una opcion para poder editar los edges en el sentido de editar la forma y grosor (a lo mejor ya existe en el SDK y no lo sé)." / "como podemos diseñar esto? Añadelo al ejemplo de layout-switch" — resolved the thickness half as declared `width` (separate work unit, delivered).
- L2: "quiero probarlo, levanta el ejemplo" — demo server started (localhost:5177).
- L3: "no veo lo de cambiar la forma. Cambiar la forma me refiero a que puedas modificarla arrastrando el edge desde un punto, no se si me explico" — this feature: waypoint editing, per-edge instance state in the document. User chose "arrancá con el diseño completo".
- L4: Design decisions: waypoints = optional absolute-flow `Position[]` on the edge instance (node-position precedent); arrange/drag of nodes does NOT translate existing waypoints in v1 (documented limitation); no ADR mechanism exists in the repo (docs/PROJECT-STRUCTURE.md:166), so the contract decision is documented in GGD-CONTRACT.md instead.
