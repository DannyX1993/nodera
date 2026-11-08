# Arquitectura de paquetes y monorepo

Se recomienda utilizar un monorepo TypeScript con pnpm y Turborepo.

Estructura propuesta:

```text
generic-graph-builder/
│
├── apps/
│   ├── playground/
│   ├── documentation/
│   └── dev-tools/
│
├── packages/
│   │
│   ├── core/
│   ├── domain/
│   ├── application/
│   ├── contracts/
│   ├── sdk/
│   │
│   ├── graph-model/
│   ├── node-registry/
│   ├── edge-registry/
│   ├── property-system/
│   ├── validation/
│   ├── history/
│   ├── document/
│   ├── serialization-json/
│   ├── serialization-yaml/
│   │
│   ├── ui-core/
│   ├── ui-react/
│   ├── canvas-react-flow/
│   ├── theme-engine/
│   ├── layout-engine/
│   │
│   ├── plugin-api/
│   ├── plugin-manager/
│   │
│   ├── adapter-storage-local/
│   ├── adapter-storage-http/
│   │
│   └── testing/
│
├── plugins/
│   ├── basic-nodes/
│   ├── developer-tools/
│   ├── data-nodes/
│   ├── ai-nodes/
│   └── example-plugin/
│
├── examples/
│   ├── workflow-builder/
│   ├── data-pipeline-builder/
│   └── agent-builder/
│
├── docs/
│
├── tooling/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

No es obligatorio publicar cada directorio como paquete npm independiente. La estructura física puede agrupar módulos internos, mientras que la API pública mantiene límites claros.

## 7.1. Dependencias

Las dependencias deben seguir esta dirección:

```text
Presentation
     |
     v
Application
     |
     v
Domain

Infrastructure ---> Application / Domain contracts
Plugins ----------> Public SDK contracts
Host Application -> Public SDK
```

Nunca debe ocurrir:

```text
Domain -> React
Domain -> React Flow
Domain -> Browser DOM
Domain -> Storage implementation
```

## 7.2. Capa de presentación implementada (Fase 5)

La UI Composition se implementa en cuatro paquetes de UI más el adaptador de
canvas, con límites explícitos:

```text
@nodera/ui-react  (componentes React, providers, bindings)
        |
        +--> @nodera/ui-core         contratos: paneles, tools/comandos, estado de UI
        +--> @nodera/theme-engine     design tokens, temas, variables CSS
        +--> @nodera/layout-engine    layouts, geometría, persistencia de preferencias
        +--> @nodera/application      casos de uso (selección, historial, validación)

@nodera/layout-engine --> @nodera/ui-core + @nodera/contracts
@nodera/theme-engine  --> @nodera/contracts
@nodera/ui-core       --> @nodera/contracts

@nodera/canvas-react-flow   (adaptador de canvas, único paquete que importa @xyflow/react)
        ^
        |  hermano, NO dependencia de ui-react
        |
  aplicación host  --- compone ui-react (paneles, providers) y canvas-react-flow
```

`@nodera/ui-react` y `@nodera/canvas-react-flow` son adaptadores hermanos: el
host compone ambos. `ui-react` nunca importa `@xyflow/react` ni depende de
`canvas-react-flow`.

Reglas de frontera, verificadas de forma ejecutable con `pnpm check:architecture`
(`scripts/check-architecture.mjs`, sin dependencias añadidas):

- `@nodera/ui-core`, `@nodera/theme-engine` y `@nodera/layout-engine` no importan
  React, React DOM, herramientas solo-DOM, React Flow ni `@nodera/application` /
  `@nodera/domain`; solo contratos, datos y funciones puras.
- `@nodera/ui-react` ni en su código ni en su `package.json` menciona
  `@xyflow`, y no declara `@nodera/canvas-react-flow`: el canvas queda en el
  adaptador. El minimapa de composición es un SVG propio, no el `MiniMap` de
  React Flow.
- Ningún paquete fuera de `packages/canvas-react-flow` importa `@xyflow/react`.

El script imprime un resumen de las cuatro reglas y termina con código distinto de
cero listando los archivos que las incumplen.

Reglas de comportamiento:

- El estado de UI (`themeId`, `layoutId`, estado de paneles, menús abiertos,
  búsqueda, modo de interacción) vive en `UiStateStore` y jamás se serializa en
  el documento portable; la selección y el historial siguen en
  `@nodera/application`, y el viewport sigue siendo estado interno del canvas.
- El motor de layout no modifica el modelo de dominio del grafo: recibe
  `LayoutDefinition`/`LayoutState` y devuelve geometría y estados nuevos.
  `computeShellSizes` no reimplementa esa geometría: delega en `resolveLayout`.
- Los registros de definiciones (`PanelRegistry`, `ToolRegistry`,
  `ThemeRegistry`, `LayoutRegistry`) devuelven `Result` con las mismas reglas del
  ecosistema: identificadores duplicados son conflictos explícitos e
  identificadores desconocidos son `not-found` explícitos, nunca sobrescrituras
  silenciosas. `ComponentRegistry` (`@nodera/ui-react`) es la excepción
  deliberada: registra componentes React, no definiciones serializables, así que
  **lanza** `DuplicateComponentError`/`MissingComponentError` y su `unregister`
  ignora los ids desconocidos a propósito; `replace(id, component)` es la vía
  documentada para sustituir un renderer incorporado (S3 nivel 2).

Las decisiones de la Fase 5 se documentan en `odd/tasks/fase5-ui-composition.md`
(secciones `Specs`, `Decisions` y `Log`). El repositorio no dispone todavía de un
mecanismo de ADR, por lo que no se creó uno.

