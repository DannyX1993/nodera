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
│   ├── react-flow/
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

Infrastructure    ---> Application / Domain contracts
Plugins           ---> Public SDK contracts
Host Application  ---> Public SDK
Public SDK        ---> Domain / Application / Document contracts
React Flow integration (binding layer) ---> Public SDK
React Flow integration (canvas layer)  ---> Application / Domain / Graph model
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

@nodera/react-flow   (capa de canvas: único paquete que importa @xyflow/react;
        ^             el mismo paquete aloja el binding del SDK, ver §7.3)
        |  hermano, NO dependencia de ui-react
        |
  aplicación host  --- compone ui-react (paneles, providers) y la capa de canvas
```

`@nodera/ui-react` y la capa de canvas de `@nodera/react-flow` son adaptadores
hermanos: el host compone ambos. `ui-react` nunca importa `@xyflow/react` ni
depende de `@nodera/react-flow`.

Reglas de frontera, verificadas de forma ejecutable con `pnpm check:architecture`
(`scripts/check-architecture.mjs`, sin dependencias añadidas):

- `@nodera/ui-core`, `@nodera/theme-engine` y `@nodera/layout-engine` no importan
  React, React DOM, herramientas solo-DOM, React Flow ni `@nodera/application` /
  `@nodera/domain`; solo contratos, datos y funciones puras.
- `@nodera/ui-react` ni en su código ni en su `package.json` menciona
  `@xyflow`, y no importa ni declara `@nodera/react-flow`: el canvas queda en el
  adaptador. El minimapa de composición es un SVG propio, no el `MiniMap` de
  React Flow.
- Ningún paquete fuera de `packages/react-flow` importa `@xyflow/react`.

El script imprime una línea de estado por regla y termina con código distinto de
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

## 7.3. Capa SDK implementada (Fase 6)

El SDK se implementa en dos paquetes, y esa separación es la idea central de la
fase: `@nodera/sdk` es agnóstico de framework y de motor, y `@nodera/react-flow`
selecciona ambos. El segundo aloja a su vez dos capas, porque el binding está
escrito contra los tipos del adaptador de canvas y solo tiene sentido con él
(D25):

```text
@nodera/react-flow   (integración de React Flow; un motor distinto es otro paquete)
        |
        |  dos capas dentro del paquete:
        |    binding  adapter/, providers/, editor/, vocabulary.ts,
        |             renderers/renderer-set.ts      -> compone un Builder
        |    canvas   canvas/, map/, registries/, renderers/
        |             -> traduce el grafo portable al motor
        |
        +--> @nodera/sdk                API pública, composición, puerto de motor
        +--> @nodera/ui-react           componentes, providers, registros de UI
        +--> @nodera/application        casos de uso que la capa de canvas invoca
        +--> @xyflow/react              el motor (solo la capa de canvas)

@nodera/sdk  --> contratos del core: domain, contracts, graph-model,
                 node-registry, edge-registry, property-system, validation,
                 document, serialization-json, serialization-yaml, application,
                 ui-core, theme-engine, layout-engine
```

La dirección de dependencias es `react-flow → sdk` en la capa de binding y
`sdk → solo paquetes del core`. `react-flow` depende de `ui-react`, de
`application` (para la capa de canvas) y de `@xyflow/react`; `sdk` no puede
depender de este paquete, ni de React ni de `@xyflow/react`. Un host que solo
consume `@nodera/sdk` no necesita React Flow (AGENTS.md §4.1 y §8). El paquete
`ui-react` sigue siendo el único paquete React agnóstico de motor: nunca importa
`@nodera/react-flow`.

Reglas de frontera, verificadas de forma ejecutable con `pnpm check:architecture`
(`scripts/check-architecture.mjs`, sin dependencias añadidas). El script imprime
una línea de estado por regla y falla con código distinto de cero; las seis
reglas son:

- `core-framework-free` — `ui-core`, `theme-engine` y `layout-engine` no importan
  React, módulos solo-DOM, React Flow, `application` ni `domain`.
- `ui-react-ignores-react-flow` — `ui-react` ni en su código ni en su
  `package.json` menciona `@xyflow`.
- `ui-react-owns-no-adapter` — `ui-react` no importa ni declara
  `@nodera/react-flow`.
- `react-flow-adapter-only` — ningún paquete fuera de
  `packages/react-flow` importa `@xyflow/react`.
- `sdk-framework-free` — `packages/sdk` no importa React, React DOM,
  `@nodera/ui-react`, `@nodera/react-flow` ni `@xyflow`, y su manifiesto no los
  declara en ninguna sección de dependencias.
- `react-flow-consumes-the-sdk` — `packages/react-flow` declara
  `@nodera/sdk` y su capa de binding compone el builder a través del SDK: esa
  capa nunca importa `@nodera/domain`, `@nodera/application` ni
  `@nodera/document`. La composición tiene una sola superficie y es el SDK; la
  capa de canvas sí puede usar `application` y los paquetes del modelo, porque su
  trabajo es traducir entre ambos.

Reglas de comportamiento:

- **Un único nivel de `Result` en la superficie pública.** Los paquetes del core
  devuelven resultados anidados en algunos caminos (`Result<Result<Graph, …>, …>`
  en `@nodera/document`); el SDK los aplana, de modo que
  `builder.document.import` es `Result<Graph, SdkIssues>` y nunca
  `Result<Result<…>>`. Toda operación falla con `SdkIssues` — una lista de
  `SdkIssue` con `code` cerrado y estable, `severity`, `message`, `path` y
  `metadata` — así que un host gestiona un solo tipo de error en toda la
  superficie; `assertOk` / `assertValid` desenvuelven para código lineal y el SDK
  nunca lanza por datos.
- **La frontera de renderers es opaca.** El SDK almacena cada contribución de
  presentación como `unknown` bajo un id derivado (el `type` de la definición para
  nodos y edges, `<ownerType>.<propertyId>` para una propiedad declarada dentro de
  un nodo) y nunca la inspecciona, tipa ni valida. El binding es el único lugar
  que convierte ese valor en un tipo del framework y el único autorizado a afirmar
  que es un componente (`createRendererSet`, `InvalidRendererBindingError`). Es lo
  que permite que el `renderer` de FASE6 conviva con la regla de que el dominio no
  conoce React; el SDK solo publica tipos de los nombres que el host debe escribir
  (`vocabulary.ts`, re-exports type-only, un propietario por nombre).
- **El motor se elige como dato, no como import.** `BuilderAdapter` declara `id`,
  `label` y las once capacidades de presentación; `requirementsFrom` y
  `capabilityGaps` comparan lo que las definiciones necesitan con lo que el motor
  declara, y las diferencias terminan en `builder.diagnostics` como avisos
  (`sdk.renderer-unsupported`), no como errores. Un motor nuevo — o un adaptador
  de Vue/Angular — es un paquete de binding nuevo, nunca un cambio del SDK.
- **Los presets de la Fase 5 se movieron a `ui-core`.** `DEFAULT_PANELS` y
  `DEFAULT_TOOLS` son datos declarativos (`PanelDefinition` / `ToolDefinition`, sin
  React), así que ahora viven en
  `packages/ui-core/src/defaults/{default-panels,default-tools}.ts`;
  `@nodera/ui-react` los re-exporta sin cambios (`DEFAULT_PANELS`, `DEFAULT_TOOLS`,
  `createDefaultPanelRegistry`, `createDefaultToolRegistry`), de modo que ningún
  import del host se rompe. El SDK, que no puede importar `ui-react`, construye
  sus registros de paneles y tools con esas funciones.
- **`UiStateStore` lo crea el builder** (es agnóstico de framework) y el binding
  React consume el del builder, junto con sus registros, en lugar de construir los
  valores por defecto otra vez: de lo contrario `builder.registerPanel()` o
  `builder.theme.setDefault()` no llegarían nunca a la UI.

Las decisiones de la Fase 6 se documentan en `odd/tasks/fase6-sdk.md`
(secciones `Specs`, `Non-goals`, `Decisions` D1-D25 y `Log`). El repositorio no
dispone todavía de un mecanismo de ADR, por lo que no se creó uno.

