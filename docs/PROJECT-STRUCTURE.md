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
│   ├── graph-layout/
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

> **Estado actual del árbol.** La lista anterior es la estructura propuesta y
> coincide con el repositorio salvo en estos puntos, que conviene no confundir
> con código funcional:
>
> - `apps/playground`, `apps/documentation` y `apps/dev-tools` son
>   placeholders: solo contienen un `package.json` privado con nombre y
>   descripción, sin `src`, sin scripts y sin nada ejecutable.
> - `examples/workflow-builder`, `examples/data-pipeline-builder` y
>   `examples/agent-builder` son directorios **vacíos**.
> - `packages/core`, `packages/testing`, `packages/adapter-storage-local` y
>   `packages/adapter-storage-http` son stubs `private` sin código fuente, sin
>   build y sin tests (ver `docs/KNOWN-ISSUES.md`, KI-7).
> - `tooling/` todavía no existe, aunque `pnpm-workspace.yaml` lo contempla.
>
> Lo ejecutable hoy son `examples/phase1-demo` … `examples/phase7-demo`,
> `examples/layout-switch-demo` y los cinco plugins de `plugins/*`.
>
> La Fase 8 añade tres piezas que no figuraban en la estructura original:
> `eslint.config.mjs` en la raíz (lint real: `pnpm lint`), `.github/workflows/ci.yml`
> (typecheck, build, test, lint y `check:architecture` en push y PR) y
> `.changeset/` (configuración de `@changesets/cli` más los scripts
> `version`/`release`).

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
Plugins           ---> Public SDK contracts (@nodera/sdk)
Host Application  ---> Public SDK (@nodera/sdk) or the React binding (@nodera/react)
Public SDK        ---> Domain / Application / Document contracts
React binding (@nodera/react) ---> Public SDK + canvas adapter + ui-react
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
@nodera/ui-react  (componentes React, providers, bindings; interno: se publica
                    dentro de @nodera/react, §7.6)
        |
        +--> @nodera/ui-core         contratos: paneles, tools/comandos, estado de UI
        +--> @nodera/theme-engine     design tokens, temas, variables CSS
        +--> @nodera/layout-engine    layouts, geometría, persistencia de preferencias
        +--> @nodera/application      casos de uso (selección, historial, validación)

@nodera/layout-engine --> @nodera/ui-core + @nodera/contracts
@nodera/theme-engine  --> @nodera/contracts
@nodera/ui-core       --> @nodera/contracts

@nodera/react-flow   (capa de canvas: importa @xyflow/react; el mismo paquete
        ^             aloja el binding del SDK, ver §7.3. Interno: se publica
        |             dentro de @nodera/react, §7.6)
        |  hermano, NO dependencia de ui-react
        |
  aplicación host  --- instala @nodera/react, que empaqueta ui-react
                       (paneles, providers) y la capa de canvas
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
- Ningún paquete fuera de `packages/react-flow` y de `packages/react` importa
  `@xyflow/react`.

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

El SDK se implementa en dos artefactos, y esa separación es la idea central de la
fase: `@nodera/sdk` es agnóstico de framework y de motor, y el binding React
selecciona ambos. Desde la consolidación de la distribución (§7.6) ese binding se
publica como `@nodera/react`, que empaqueta `packages/react-flow` y
`packages/ui-react`; `packages/react-flow` sigue alojando a su vez dos capas,
porque el binding está escrito contra los tipos del adaptador de canvas y solo
tiene sentido con él (D25):

```text
@nodera/react        (binding React publicado: empaqueta react-flow + ui-react)
        |
        +--> @nodera/sdk
        +--> packages/react-flow      (integrado, no publicado)
        +--> packages/ui-react        (integrado, no publicado)

packages/react-flow  (integración de React Flow; un motor distinto es otro paquete)
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
`@nodera/react-flow`. El paquete publicado `packages/react` depende de los tres
en una sola dirección (`react → sdk`), y su regla de frontera está en §7.6.

Reglas de frontera, verificadas de forma ejecutable con `pnpm check:architecture`
(`scripts/check-architecture.mjs`, sin dependencias añadidas). El script imprime
una línea de estado por regla y falla con código distinto de cero; las seis
reglas de esta sección son:

- `core-framework-free` — `ui-core`, `theme-engine` y `layout-engine` no importan
  React, módulos solo-DOM, React Flow, `application` ni `domain`.
- `ui-react-ignores-react-flow` — `ui-react` ni en su código ni en su
  `package.json` menciona `@xyflow`.
- `ui-react-owns-no-adapter` — `ui-react` no importa ni declara
  `@nodera/react-flow`.
- `react-flow-adapter-only` — ningún paquete fuera de
  `packages/react-flow` y de `packages/react` importa `@xyflow/react`.
- `sdk-framework-free` — `packages/sdk` no importa React, React DOM,
  `@nodera/ui-react`, `@nodera/react-flow` ni `@xyflow`, y su manifiesto no los
  declara en ninguna sección de dependencias.
- `react-flow-consumes-the-sdk` — `packages/react-flow` declara
  `@nodera/sdk` y su capa de binding compone el builder a través del SDK: esa
  capa nunca importa `@nodera/domain`, `@nodera/application` ni
  `@nodera/document`. La composición tiene una sola superficie y es el SDK; la
  capa de canvas sí puede usar `application` y los paquetes del modelo, porque su
  trabajo es traducir entre ambos.

El mismo script verifica la regla de frontera del ecosistema de plugins (§7.5) y
la del binding publicado (§7.6).

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
- **Un solo vocabulario en la frontera, en ambos sentidos.** Todo lo que un host
  *lee* del SDK —`builder.registerNode`/`registerEdge`, `builder.registries.nodes`/
  `.edges` y cada método de `builder.graph`— habla el vocabulario de §9 de
  `docs/PRODUCT-DESCRIPTION.md` (`type`/`label`, instancias planas). El formato de
  *wire* (`GraphDocument`, con endpoints anidados) es el contrato publicado de la
  Fase 2 y se conserva tal cual en `builder.document`; las formas del core
  (`Node`, `Edge`, `NodeDefinition`, `EdgeDefinition`) solo son alcanzables por la
  vía avanzada documentada, `builder.editor` (D12).

Las decisiones de la Fase 6 se documentan en `odd/tasks/fase6-sdk.md`
(secciones `Specs`, `Non-goals`, `Decisions` D1-D25 y `Log`). El repositorio no
dispone todavía de un mecanismo de ADR, por lo que no se creó uno.

## 7.4. Colocación de nodos (`@nodera/graph-layout`)

La colocación de nodos en el grafo es una capacidad propia, separada del motor
de layout del shell (§7.2) y de la composición del SDK (§7.3). El paquete
`@nodera/graph-layout` es privado y se consume desde el código fuente, como el
resto del monorepo: no tiene dependencia externa y declara solo `@nodera/contracts`
y `@nodera/graph-model`.

```text
@nodera/graph-layout   (geometría: puerto de estrategia, free, layered, registro)
        |
        +--> @nodera/contracts     Result, RegistryStore, RegistryError
        +--> @nodera/graph-model   NodePosition

@nodera/sdk  --> @nodera/graph-layout   (selecciona la estrategia y le pasa datos planos)
@nodera/application <-- @nodera/sdk     (arrangeGraph aplica la respuesta como una unidad de historial)
```

Reglas de frontera:

- El paquete no importa React, React DOM, React Flow, `@nodera/application`,
  `@nodera/sdk` ni el adaptador de canvas: recibe ids, posiciones y edges, y
  devuelve posiciones o un diagnóstico estructurado. Su `package.json` declara
  únicamente `@nodera/contracts` y `@nodera/graph-model`, y esas son las dos
  únicas importaciones de sus fuentes. `pnpm check:architecture` todavía no
  verifica esta frontera: sus ocho reglas cubren la capa de presentación, el SDK,
  el binding React y el ecosistema de plugins (§7.2, §7.3, §7.5, §7.6).
- Escribir posiciones no es responsabilidad de este paquete: el SDK aplica la
  respuesta a través del caso de uso `arrangeGraph` de `@nodera/application`, que
  valida todo antes de escribir y lo hace como una única unidad reversible.
- El paquete no decide cuándo se coloca nada. La colocación en el alta de un nodo
  (`graph.layout.mode: "auto"`) es geometría del SDK; volver a colocar un grafo
  existente es el comando explícito `builder.graph.arrange()`.
- La estrategia se elige como dato: el registro
  (`LayoutStrategyRegistry`) aplica las mismas reglas que el resto de registros
  (`duplicate-id` para un id en uso, `not-found` para uno desconocido) y el host
  puede registrar un adaptador propio (por ejemplo `@dagrejs/dagre`) sin cambiar
  el SDK, la aplicación ni el canvas. El framework no envía ninguna dependencia
  de layout externa.
- Ningún componente de UI coloca nodos: `ui-react`, `ui-core` y el adaptador de
  canvas renderizan las posiciones del documento y no llaman a `arrange()`.

La referencia completa del paquete (exportaciones, reglas exactas de colocación,
valores por defecto, códigos de diagnóstico y limitaciones) está en
`packages/graph-layout/README.md`; la página de la capacidad, con la superficie
del SDK y el ejemplo, en `docs/GRAPH-LAYOUT.md`; el ejemplo ejecutable en
`examples/layout-switch-demo`.

## 7.5. Ecosistema de plugins implementado (Fase 7)

El sistema de plugins es responsabilidad de la capa de infraestructura
(`docs/GLOBAL-ARCHITECTURE.md` §Infrastructure Layer) y su dirección de
dependencias es la de §7.1: los plugins consumen contratos públicos, nunca el
core. Desde la consolidación de la distribución (KI-12) el ecosistema entero se
publica dentro de `@nodera/sdk`: los contratos viven en
`packages/sdk/src/plugin-api/` y la infraestructura en
`packages/sdk/src/plugin-manager/`. Los paquetes `packages/plugin-api` y
`packages/plugin-manager` siguen existiendo como cascarones `private` cuyo
`src/index.ts` no exporta nada, para no alterar el grafo del workspace ni el de
turbo.

```text
plugins/*                    (terceros: solo la superficie pública)
        |
        +--> @nodera/sdk        BuilderPluginApi, builder, eventos, manifest,
                                contribuciones, lifecycle, createPluginManager

host
        |
        +--> @nodera/sdk        (misma superficie; no hay un segundo paquete)

@nodera/sdk  contiene
        src/plugin-api/         contrato puro: manifest, lifecycle, errores, ids
        src/plugin-manager/     infraestructura: validación, resolución,
                                conflictos, ciclo de vida y retirada
                          |
                          +--> usa la superficie pública del propio SDK
                               (installPlugin, unregister, eventos)
```

El antiguo ciclo `sdk ↔ plugin-manager` desaparece por construcción: el manager
compone la superficie pública del SDK y ahora vive dentro de él, sin importar
ningún paquete externo. El contrato sigue siendo puro: `src/plugin-api` no
importa React, React DOM, React Flow ni `@nodera/ui-*`, y esa propiedad queda
cubierta por `sdk-framework-free` (si alguien arrastrase una presentación al SDK,
la regla falla).

Reglas de frontera, verificadas con `pnpm check:architecture`:

- `example-plugins-use-the-public-surface` — cada `plugins/*` importa solo
  `@nodera/sdk` en su código de producción (sus tests pueden importar además
  `vitest`) y nunca un paquete interno del core. Un plugin es un tercero: se
  escribe contra la superficie publicada y nada más.
- Las antiguas `plugin-api-is-pure-contracts` y
  `plugin-manager-is-infrastructure-only` se retiraron junto con los paquetes
  públicos que vigilaban: el código que cubrían ya no es un paquete, y un
  contrato dentro del SDK no puede fijar por sí mismo la dirección de un paquete
  que no existe. `pnpm check:architecture` mantiene ocho reglas (§7.2, §7.3,
  §7.6).

La guía completa — manifest, contribuciones, ciclo de vida, resolución de
dependencias, conflictos, seguridad, distribución y limitaciones conocidas —
está en `docs/PLUGINS.md`; el código, en `packages/sdk/src/plugin-api/` y
`packages/sdk/src/plugin-manager/`; los cinco ejemplos en `plugins/*`.

## 7.6. Distribución en dos paquetes

Nodera publica exactamente dos paquetes (decisión S1 del
`odd/tasks/two-package-distribution.md`): el core agnóstico y el binding de un
framework. Cambiar de framework es añadir otro paquete de binding, nunca tocar el
core.

```text
@nodera/sdk   (público, sin dependencias de framework)
        |  bundle: contracts, domain, graph-model, application, document,
        |          serialization-*, validation, node/edge-registry,
        |          property-system, history, graph-layout, ui-core,
        |          theme-engine, layout-engine, plugin-api, plugin-manager
        v
@nodera/react (público, peer: react, react-dom, @xyflow/react)
           bundle: @nodera/sdk + packages/react-flow + packages/ui-react
```

Propiedades del modelo:

- **Una dirección.** `@nodera/react` depende de `@nodera/sdk`; el SDK no depende
  del binding. El ciclo que impedía empaquetarlo todo en un paquete desaparece
  porque el binding ya no forma parte del core.
- **Un solo punto de entrada por paquete.** `exports` es `"."` en ambos: no hay
  subrutas, ni `./react`, ni imports profundos. Un host React instala
  `@nodera/react` y React; un host sin UI instala `@nodera/sdk`.
- **Autocontenidos.** `tsup` con `noExternal: [/^@nodera\//]` inlinea todos los
  paquetes del workspace en un único `dist/index.js`, y `dts: { resolve }`
  inlinea sus declaraciones: el `dist/index.d.ts` publicado no contiene ningún
  especificador `@nodera/*`. React, React DOM y `@xyflow/react` quedan
  `external` (peer del binding).
- **Los internos son `private`.** Los 23 paquetes restantes de `packages/*` no se
  publican; conservan `build`/`test`/`typecheck` porque son entradas del bundle,
  y `@nodera/plugin-api`/`@nodera/plugin-manager` quedan como cascarones sin
  exports (§7.5).
- **Identidad de tipos en el workspace.** Un `dist/index.d.ts` autocontenido es
  una copia de las declaraciones del core, así que dentro del monorepo convive
  con las declaraciones originales de cada paquete. Para que un programa que ve
  las dos (el binding, los ejemplos que usan `@nodera/sdk` y `@nodera/react`)
  mantenga una única identidad, `tsconfig.base.json` mapea `@nodera/sdk` y
  `@nodera/react` con `paths` al árbol de declaraciones sin empaquetar
  (`dist/types/index.d.ts`), que ambos paquetes emiten como segundo paso del
  build con `tsc --emitDeclarationOnly`. Ese árbol no se publica
  (`files: ["dist", "!dist/types"]`).
- **La regla del binding.** `react-binding-composes-the-sdk` verifica que
  `packages/react` importa solo `@nodera/sdk`, `@nodera/react-flow`,
  `@nodera/ui-react`, `react`, `react-dom` y `@xyflow/react` (`vitest` en tests):
  el binding compone el SDK, nunca un paquete del core por debajo de él.
