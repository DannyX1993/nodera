# feature: fase4-react-canvas-adapter

Phase 4 React Canvas Adapter for Nodera, per docs/ROADMAP.md and docs/FASE4-DEFINITION.md.
Branch: `feature/fase4-react-canvas-adapter` (off master, merge convention like fase1-3).

## Specs

- S1: "Vamos a hacer ahora solo la Fase 4 especificada en @docs/ROADMAP.md" — deliver Phase 4 only, nothing from Phases 5-8.
- S2: "La definición de modulos de esta fase está en @docs/FASE4-DEFINITION.md" — Canvas Engine Module: the adapter translates Domain Node/Edge/Port/Graph to React Flow, and visual interactions back into application commands; the domain never receives React Flow objects; module manages renderizado, DnD, zoom, pan, selección, conexiones, posicionamiento, eventos de interacción, renderizado personalizado, minimapa, controles visuales.
- S3: "debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md" — React Flow only in the canvas adapter; adapters implement contracts defined by the core; presentation is never the source of truth of the graph model.
- S4: "debes tener en cuenta lo que se ha hecho en la fase 1 ... fase 2 ... y fase 3" — build on `EditorEngine` (packages/application), domain model (Node.position, PortInstance.direction, NodeDefinition.visual/renderer, EdgeDefinition.visual), event bus events, use cases as free functions `((editor, input) => Result)`.
- S5: "debes usar TDD estricto" — strict TDD: observe RED before each implementation unit's code; tests assert observable behavior through public interfaces.
- S6: "Haz una investigacion profunda para hacer la planificacion de tareas tambien" — deep research before task planning (done: repo map evidence in this Log and odd log).

Acceptance list from docs/ROADMAP.md Fase 4 (verbatim modules): React Provider, GraphCanvas, Node Renderer Registry, Edge Renderer Registry, Port Renderer, Drag and Drop, Connections, Zoom/Pan, Selection, Custom Nodes. Result: "primer editor funcional".

## Non-goals

- Node Palette, Properties Panel, Toolbar, Context Menu, Validation Panel, Layout Engine, Theme Engine (Phase 5).
- SDK / Plugin API (Phases 6-7): registries here stay package-public, not SDK-contracted.
- Execution/runtime of any kind.
- Vue/Angular adapters.

## Decisions

- D1: Implement in `packages/canvas-react-flow` (already scaffolded by repo convention). Add `react@^19`, `react-dom@^19`, `@xyflow/react@^12` deps; devDeps vite/vitest/jsdom/@testing-library/react/@testing-library/user-event/@types/react(-dom). Justified by ROADMAP Fase 4 + AGENTS.md §3 stack. React Flow stays only in this package.
- D2: Mappers are pure functions (Domain Graph → RF nodes/edges) living in the adapter; no React Flow types leak into domain/application.
- D3: Renderer registries (Node/Edge/Port) are presentation-layer registries keyed by definition renderer ids (`NodeDefinition.renderer`, `EdgeDefinition.renderer`) with default fallback renderers reading `visual` hints.
- D4: Viewport/zoom/pan stays canvas-local React Flow state (never in the document or domain). Canvas surfaces it only via optional RF callbacks/events.
- D5: Interactions translate to application use cases: drag end → `moveNode` (with history transaction grouping), `onConnect` → `validateConnection` then `createEdge`, selection changes → `selectNode/selectMultiple/clearSelection`, delete → `removeNode/removeEdge`.
- D6: React reactivity driven by `editor.events` (`graph.changed`, node/edge/selection events); memoized mapping re-derived from `editor.graph` on each change; selection read via editor state to cover the missing `edge.selected` event (documented gap in fase 3).
- D7: The adapter accepts an `EditorEngine` instance prop (the host owns the engine lifecycle); `ReactFlowProvider` wraps `GraphCanvas` as the public "React Provider" export.

## Verification

- Strict TDD per unit: RED observed before implementation (vitest, jsdom, @testing-library/react).
- `pnpm test`, `pnpm typecheck`, `pnpm build` (turbo) for affected packages.
- AGENTS.md §14 serialization round-trip rules apply to nothing here (no document changes), but domaincontains-no-RF-types must hold: grep checks.
- Functional example: `examples/phase4-demo` runnable demo.

## Tasks

- T1 (S2,S3,S5): bootstrap package — package.json deps, tsconfig (DOM lib, jsx react-jsx), vitest.config.ts (jsdom), src/index.ts. Route: inline (2 trivial files + configs). Commit: yes.
- T2 (S2,S3,S5): domain↔React Flow mappers — graph/nodes/edges/ports mapping, pure and total; ports mapped by direction to Handle positions. Route: writer A. Commit: yes.
- T3 (S2,S3,S5): Node/Edge/Port renderer registries + default renderers reading `visual` hints. Route: writer B (parallel with A, disjoint surface). Commit: yes.
- T4 (S1,S2,S3,S5): `GraphCanvas` + ReactFlowProvider + event-bus-driven state sync + interaction translation (dnd/move, connections, selection, delete) + minimap/controls. Route: writer C (after A+B merge). Commit: yes (high-risk unit gets isolated slice).
- T5 (S1,S4): custom nodes wiring — NodeDefinition.renderer id lookup into registry, custom node rendering with ports + visual data. Route: writer C continuation or inline. Commit: yes.
- T6 (S1,S4): examples/phase4-demo runnable demo + docs update (PROJECT-STRUCTURE, ROADMAP checkoff note). Route: inline. Commit: yes.

## Log

- L1 (user, verbatim): "Vamos a hacer ahora solo la Fase 4 especificada en docs/ROADMAP.md . La definición de modulos de esta fase está en docs/FASE4-DEFINITION.md (y si ves que falta algo comprueba docs/PRODUCT-DESCRIPTION.md) y debes respetar la arquitectura global presente en docs/GLOBAL-ARCHITECTURE.md. Además debes tener en cuenta lo que se ha hecho en la fase 1 definida en el documento docs/FASE1-DEFINITION.md y en la fase 2 definida en docs/FASE2-DEFINITION.md y fase 3 docs/FASE3-DEFINITION.md . Recuerda que debes usar TDD estricto. Haz una investigacion profunda para hacer la planificacion de tareas tambien."
- L2 (evidence): repo map by explorer — packages/application exposes EditorEngine(editor-engine.ts:50) with domain/events/history; use cases are free functions in use-cases/*.ts; EVENTS: 16 names (events.ts:13-70); Node.position lives on node (graph-model/src/node.ts:49); PortInstance.direction input|output|bidirectional (port.ts:65-73); NodeDefinition.renderer + visual (node-definition.ts:24); EdgeDefinition.visual geometry lineStyle arrows (edge-definition.ts:51); no RF deps anywhere; no DOM testing setup; tsconfig.base has no jsx/DOM lib; branch convention feature/faseN-* merged via merge commits; docs/FASE4-DEFINITION.md is the module definition; PRODUCT-DESCRIPTION.md:1622-1646 duplicates module list; PROJECT-STRUCTURE.md:90-95 bans RF outside adapter.
- L3 (decision): work-unit commits on the feature branch are part of authorized ODD implementation (phases 1-3 followed the same convention). Merge to master stays the user's decision.
- L4 (slice boundary 1): T1 bootstrap + T3 registries/default renderers committed (866 authored lines > ~400 slice): ready as review slice 1 for a chained-PR strategy at delivery time. T2 mappers (writer A) still in progress; T4/T5 canvas will be slice 2; T6 demo+docs slice 3.
- L5 (defect fix): T1 package.json lacked "type": "module"; verbatimModuleSyntax NodeNext flooded TS1287/1295 across the package. Fixed and typecheck-clean for registries/renderers surface.
- L6 (T2 accepted): writer A delivered src/map/react-flow-mapper.ts (31 tests; toReactFlowNodes/Edges, nodePositionFromReactFlow, connectionFromReactFlow null-handle rejection, removedIdsFromReactFlowChanges; geometry straight/bezier/step/smooth → straight/default/step/smoothstep; handle id = portId). Parent verified: full package tsc clean after adding .js extensions to T3 relative imports (TS2835), full suite 74/74. Committed 656e3a8.
- L7 (continuation authorization): user said "continuia hasta T7 a no ser que haya algo grave que tenga que decidir" — proceed through T7 without intermediate approvals; merge to master remains the user's decision.
