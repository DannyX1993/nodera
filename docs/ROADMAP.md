# Roadmap de implementación

No recomiendo construir todos los módulos simultáneamente.

El desarrollo debe avanzar por capas, manteniendo un producto funcional en cada etapa.

## Fase 1. Domain Foundation

Implementar:

- Graph Model.
- Node Model.
- Edge Model.
- Port Model.
- Node Definitions.
- Edge Definitions.
- Property Definitions.
- Registries.
- Graph Validation.

**Resultado:** core capaz de crear y gestionar grafos sin interfaz gráfica.

## Fase 2. Document Foundation

Implementar:

- Graph Document.
- JSON Serializer.
- YAML Serializer.
- Document Validation.
- Document Versioning.
- Import/Export.
- Unknown Node Preservation.

**Resultado:** el core puede generar documentos portables y reconstruir grafos a partir de ellos.

## Fase 3. Application Core

Implementar:

- Use Cases.
- Commands.
- Events.
- History.
- Undo/Redo.
- Selection Model.
- Clipboard.
- Validation Pipeline.

**Resultado:** motor de edición independiente del framework visual.

## Fase 4. React Canvas Adapter

Implementar:

- React Provider.
- GraphCanvas.
- Node Renderer Registry.
- Edge Renderer Registry.
- Port Renderer.
- Drag and Drop.
- Connections.
- Zoom/Pan.
- Selection.
- Custom Nodes.

**Resultado:** primer editor funcional.

## Fase 5. UI Composition

Implementar:

- Node Palette.
- Properties Panel.
- Toolbar.
- Context Menu.
- Validation Panel.
- Layout Engine.
- Theme Engine.
- Component Replacement.

**Resultado:** interfaz configurable y completamente personalizable.

## Fase 6. SDK

Implementar:

- Public API.
- Builder Factory.
- Node API.
- Edge API.
- Property API.
- Plugin API.
- Theme API.
- Layout API.
- Event API.

**Resultado:** terceros pueden integrar el builder sin acceder a sus módulos internos.

## Fase 7. Plugin Ecosystem

Implementar:

- Plugin Manifest.
- Plugin Registry.
- Dependency Resolution.
- Lifecycle.
- Conflict Detection.
- Example Plugins.
- Plugin Documentation.

**Resultado:** ecosistema extensible y distribuible.

## Fase 8. Production Readiness

Implementar:

- Performance.
- Accessibility.
- Internationalization.
- Testing.
- Documentation.
- Compatibility.
- Release Automation.
- npm Publishing.

**Resultado:** producto listo para ser consumido por aplicaciones externas.

## Estado de implementación

- **Fase 1. Domain Foundation** — implementada (`packages/domain`, `graph-model`,
  `node-registry`, `edge-registry`, `property-system`, `contracts`, `validation`).
- **Fase 2. Document Foundation** — implementada (`packages/document`,
  `serialization-json`, `serialization-yaml`).
- **Fase 3. Application Core** — implementada (`packages/application`,
  `packages/history`).
- **Fase 4. React Canvas Adapter** — implementada (la capa de canvas de
  `packages/react-flow`, ejemplo `examples/phase4-demo`).
- **Fase 5. UI Composition** — implementada (`packages/ui-core`, `ui-react`,
  `theme-engine`, `layout-engine`, más las extensiones del adaptador para
  renderizadores de puertos y drop desde la paleta; ejemplo `examples/phase5-demo`).
  Node Palette, Properties Panel, Toolbar, Context Menu, Validation Panel,
  Layout Engine, Theme Engine y Component Replacement quedan cubiertos, y la
  interfaz es configurable y personalizable en los tres niveles descritos en
  `docs/PRODUCT-DESCRIPTION.md` (tema, sustitución de renderizadores y composición
  propia por parte del host).
- **Fase 6. SDK** — implementada (`packages/sdk`, `packages/react-flow`, ejemplo
  `examples/phase6-demo`). El SDK agnóstico de framework y de motor expone
  `createBuilder`, el vocabulario de autoría de nodos, edges y propiedades, las
  APIs de documento, registro, evento, plugin, tema y layout, y el puerto
  `BuilderAdapter`; `@nodera/react-flow` aporta el binding React
  (`NoderaBuilderProvider`, `<NoderaEditor>`, `createReactFlowAdapter()`) sobre el
  adaptador de canvas que el mismo paquete ya contenía desde la Fase 4. La fase
  está terminada cuando un host compone, edita, valida, exporta e instala un
  plugin importando solo `@nodera/sdk` y `@nodera/react-flow`, sin acceder a
  ningún módulo interno.
- **Fase 7. Plugin Ecosystem** — implementada (`packages/plugin-api`,
  `packages/plugin-manager`, la superficie de plugins del SDK, los cinco plugins
  de ejemplo de `plugins/*` y `docs/PLUGINS.md`). `@nodera/plugin-api` publica
  los contratos puros — `PluginManifest` (id, name, version, description, author,
  dependencies, compatibility, contributions y permissions), las trece clases de
  contribución, `PluginDefinition` con sus hooks, `PluginState` y el vocabulario
  cerrado de diagnósticos `plugin.*` — sin React ni motor, dependiendo solo de
  `@nodera/contracts`; `@nodera/plugin-manager` aporta la infraestructura sobre
  el SDK: validación de manifests no confiables, resolución de dependencias en
  el conjunto descubierto con la gramática semver de la fase, detección de
  conflictos de id de plugin y de par `(type, id)` antes de ejecutar código, y
  el ciclo de vida `discover → resolve → validate → register → activate →
  deactivate → unregister` con propiedad de las contribuciones para retirarlas.
  El SDK gana los slots de contribución que faltaban (validadores, importadores,
  exportadores, diálogos y estrategias de colocación) y los eventos
  `plugin.activated`/`plugin.deactivated`/`plugin.unregistered`, manteniendo
  `BuilderPlugin`/`installPlugin`/`builder.use` de la Fase 6 sin cambios. La fase
  está terminada cuando un host instala, activa, desactiva y desinstala plugins
  declarados por manifest importando solo `@nodera/sdk`, `@nodera/plugin-api` y
  `@nodera/plugin-manager`, y un plugin se escribe importando solo las dos
  primeras, sin acceder a ningún módulo interno.
