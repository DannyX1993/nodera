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
- S8: "Haz una opcion que permita activar o desactivar esto. Solo deberia ser posible en modo free y si las conexiones son editables. Puedes limitarlo tambien en el SDK?" — a runtime toggle exists; it can only be enabled while the active strategy is free AND connections are editable (the SDK setter refuses otherwise), and the adapter additionally gates the gestures on the live conditions.
- S9: "parece que el waypoint solo funciona cuando la geometria del edge es blezer, en el resto no me funciona" — waypoint editing must work for every declared geometry (straight, bezier, step, smooth); the rendered shape must keep honouring the declared geometry, with and without waypoints.

## Tasks

- T1 (S3): `Edge` gains waypoints in graph-model (state + setter + validation). Route: inline. Commit: 456e6f3.
- T2 (S5): document layer: `DocumentEdgeInstance.waypoints`, export/import mapping, schema, round-trip tests. Route: worker. Commit: 340ca8e.
- T3 (S4): application use case `updateEdgeWaypoints` (one history unit, events), tests. Route: worker. Commit: 2ecc4d6.
- T4 (S6): SDK `builder.graph.setEdgeWaypoints` with diagnostics, tests. Route: worker. Commit: 2ecc4d6.
- T5 (S2, S7): React Flow adapter: mapper carries waypoints, default edge renderer paths through them, waypoint handles (add by dragging the edge, move by dragging a handle, remove by double-click/Delete), wired to the application use case; tests. Route: worker. Commit: b36d164.
- T6 (S7): demo integration + docs (GGD-CONTRACT.md, SDK-GUIDE.md, demo README). Route: worker. Commit: a0457ad.
- T7 (S8): `edgeWaypointEditing` feature flag: ui-core UI state + SDK features API with set-time condition enforcement (free + editable). Route: worker. Commit: ddff0c0.
- T8 (S8): adapter gesture gating on the live flag + demo checkbox + docs. Route: worker. Commit: ddff0c0.
- T9 (S9): every geometry renders through the Nodera edge renderer (which draws the declared geometry) so the waypoint gestures exist for all of them. Route: worker. Commit: e022cc7.

Slice boundary: width work unit (1db23a2) + T1–T3 (456e6f3, 340ca8e, 2ecc4d6) = first ~400-line slice; T4–T6 = second slice (b36d164, a0457ad). Branch feat/edge-waypoints; push/PR is the user's decision.

## Log

- L1: "El SDK deberia tener una opcion para poder editar los edges en el sentido de editar la forma y grosor (a lo mejor ya existe en el SDK y no lo sé)." / "como podemos diseñar esto? Añadelo al ejemplo de layout-switch" — resolved the thickness half as declared `width` (separate work unit, delivered).
- L2: "quiero probarlo, levanta el ejemplo" — demo server started (localhost:5177).
- L3: "no veo lo de cambiar la forma. Cambiar la forma me refiero a que puedas modificarla arrastrando el edge desde un punto, no se si me explico" — this feature: waypoint editing, per-edge instance state in the document. User chose "arrancá con el diseño completo".
- L4: Design decisions: waypoints = optional absolute-flow `Position[]` on the edge instance (node-position precedent); arrange/drag of nodes does NOT translate existing waypoints in v1 (documented limitation); no ADR mechanism exists in the repo (docs/PROJECT-STRUCTURE.md:166), so the contract decision is documented in GGD-CONTRACT.md instead.
- L5: Delivered T1–T6 on branch feat/edge-waypoints (6 commits). Verified: graph-model 29, document 62, application 141, sdk 432, react-flow 311 tests green; demo typecheck clean. Known limitation recorded: node arrange/drag does not translate existing waypoints (v1).
- L6: "no consigo añadir un waypoint en el ejemplo" — reproduced: the demo declares `geometry: "bezier"`, and the mapper sent those edges to the built-in React Flow type, where no waypoint UI exists. First fix (2359234) routed only waypoint-carrying edges; second fix (30aae98) routes ALL bezier/geometry-less edges to the Nodera default renderer, which now also applies the mapped style (color, lineStyle) over token fallbacks — this is what finally makes both gestures work in the demo. RED tests first; 315/315 green.
- L7: v1 geometry note: a straight/step/smooth edge carrying waypoints renders smooth bezier segments (the Nodera renderer routes one way); per-segment geometry is a possible refinement.
- L8: "Sigue sin hacerlo… hay que activar alguna opcion?" — root cause: RF paints a 20px transparent interaction band ABOVE the visible path, so handlers on the path never fire in a browser (jsdom tests dispatched directly on the path and passed — false green); plus drag-to-create early-returned with no prior waypoints, coords ignored zoom/pan, handles were divs inside SVG (never painted), and dblclick-add was never wired. Fixed all in 0f2c050 with browser-style gesture tests against a real EditorEngine (322/322 green).
- L9: "ya funciona. Haz una opcion que permita activar o desactivar esto…" — S8/T7–T8: edgeWaypointEditing feature flag; SDK setter refuses outside free+editable; adapter gates gestures on the live flag. Delivered in ddff0c0. Verified: ui-core 75, sdk 443, react-flow 327, demo typecheck clean. Note: the demo boots layered+fixed, so the checkbox refuses until the host selects free and editable.
- L10: "parece que el waypoint solo funciona cuando la geometria del edge es blezer, en el resto no me funciona" — confirmed in the mapper: straight/step/smooth still resolved to React Flow built-in edge types, which offer no gesture, so the first waypoint could never be created. T9 (e022cc7) routes every geometry to the Nodera renderer and teaches it to draw straight/step/smooth itself (per-pair segments with waypoints); bezier output pinned byte-identical. @xyflow/react exports no getStepPath, so step is drawn as getSmoothStepPath({ borderRadius: 0 }) — the same shape React Flow's own StepEdge uses.
