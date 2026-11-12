# Ecosistema de plugins (Fase 7)

Un plugin de Nodera aporta definiciones y capacidades a un host: tipos de nodo y
de edge, tipos de propiedad, paneles, herramientas, temas, layouts, validadores,
importadores, exportadores, diálogos, estrategias de colocación y bindings de
renderizador. Este documento es la guía de autoría y de integración de esa
superficie tal como existe hoy; cada afirmación se corresponde con un módulo del
repositorio, y ninguna API de este documento es aspiracional.

Nodera **modela y edita** grafos: un plugin nunca ejecuta nodos, herramientas ni
grafos. Un plugin es código de terceros que el host decide cargar (AGENTS.md §9
y §16).

## Paquetes y dirección de dependencias

Desde la consolidación de la distribución (`docs/KNOWN-ISSUES.md` KI-12) el
ecosistema de plugins no es un paquete aparte: se publica dentro de
`@nodera/sdk`. Los contratos viven en `packages/sdk/src/plugin-api/` y la
infraestructura en `packages/sdk/src/plugin-manager/`; los antiguos
`packages/plugin-api` y `packages/plugin-manager` siguen en el workspace como
cascarones `private` sin exports, para no tocar el grafo de pnpm ni el de turbo.

```text
plugins/*                     (terceros: solo la superficie pública)
        |
        +--> @nodera/sdk               BuilderPluginApi, builder, eventos,
        |                              manifest, contribuciones, lifecycle,
        |                              createPluginManager

host                          (compone el builder y decide qué carga)
        |
        +--> @nodera/sdk               (una sola ruta de import público)

@nodera/sdk
        src/plugin-api/                contratos: PluginManifest, PluginDefinition,
        |                              PluginState, PluginIssue(s), isPluginId
        src/plugin-manager/            infraestructura: validación, resolución,
        |                              conflictos y ciclo de vida
        +--> la superficie pública del propio SDK
             (installPlugin, unregister, eventos)
```

| Ruta | Responsabilidad |
| --- | --- |
| `@nodera/sdk` (`src/plugin-api/`) | Contratos puros: `PluginManifest`, descriptores de contribución, `PluginDefinition`, `PluginState`, `PluginIssue(s)`, `isPluginId`. Genéricos sobre `PluginDefinition<TApi>`, sin conocer el builder. |
| `@nodera/sdk` (`src/plugin-manager/`) | Infraestructura: `validatePluginManifest`, `resolveDependencyOrder`, `detectPluginConflicts`, `createPluginManager`. Compone la superficie pública del SDK. |
| `@nodera/sdk` (`src/plugin/plugin.ts`) | La superficie que recibe un plugin (`BuilderPluginApi`) y los eventos de ciclo de vida. |
| `plugins/*` | Cinco plugins de ejemplo, uno por faceta de la superficie. |

El SDK no depende de los paquetes de plugins y ningún paquete depende del SDK
por un camino que vuelva: el manager ya vive dentro del SDK, así que el antiguo
ciclo `sdk ↔ plugin-manager` no puede existir. El contrato de autoría sigue
siendo genérico sobre `PluginDefinition<TApi>`, de modo que sirve también a un
host que no sea el SDK de Nodera.

Dos reglas de frontera lo verifican de forma ejecutable con
`pnpm check:architecture` (`scripts/check-architecture.mjs`):

- `example-plugins-use-the-public-surface` — cada `plugins/*` importa solo
  `@nodera/sdk` en su código de producción; sus tests pueden importar además
  `vitest`.
- `sdk-framework-free` — `packages/sdk` no importa React, React DOM,
  `@nodera/ui-react`, `@nodera/react-flow` ni `@xyflow`. Como los contratos de
  plugin ahora viven dentro de ese paquete, la regla cubre también que un
  manifest, un diagnóstico o un hook no arrastren una presentación a cada
  consumidor.

Las reglas `plugin-api-is-pure-contracts` y
`plugin-manager-is-infrastructure-only` se retiraron con los paquetes que
vigilaban: el código que cubrían ya no es un paquete propio.


## Qué puede aportar un plugin

Trece clases de contribución, cerradas en `PluginContributionKind`
(`packages/sdk/src/plugin-api/contributions.ts`) y en la superficie de plugins
`BuilderPluginApi` (`packages/sdk/src/plugin/plugin.ts`):

| `type` del manifest | Superficie / declaración | Qué es |
| --- | --- | --- |
| `node` | `api.nodes.register(input)` | definición de nodo (datos) |
| `edge` | `api.edges.register(input)` | definición de edge (datos) |
| `property` | `api.properties.register(input)` | tipo de propiedad (datos) |
| `panel` | `api.panels.register(panel)` | superficie declarativa que el host coloca |
| `tool` | `api.tools.register(tool)` | acción de interfaz declarativa |
| `theme` | `api.themes.register(input)` | design tokens |
| `layout` | `api.layouts.register(layout)` | composición de paneles |
| `validator` | `api.validators.register(validator)` | **código** que valida un grafo |
| `importer` | `api.importers.register(importer)` | **código** que lee un formato |
| `exporter` | `api.exporters.register(exporter)` | **código** que escribe un formato |
| `dialog` | `api.dialogs.register(dialog)` | superficie declarativa que la UI abre por id |
| `layout-strategy` | `api.layoutStrategies.register(strategy)` | **código** que coloca nodos |
| `renderer` | declaración: el id de renderer de la definición (el `type` del nodo) | id con el que el host pinta la definición |

Toda contribución es dato o código en un registro; **ninguna es un componente**.
Un plugin framework-agnóstico **no liga renderers**: declara con qué id se pinta
lo que aporta —el `type` de un nodo *es* su id de renderer— y el host decide qué
componente corresponde a ese id con
`builder.bindRenderer("nodes", "example.ai.classify", Componente)`. `bindRenderer`
añade un binding nuevo indexado por id (no exige un slot previo: solo rechaza un
id ya ligado, con `sdk.duplicate-id`). Esa separación —el plugin aporta
definiciones, el host aporta píxeles— es lo que permite que el mismo plugin
sirva a un host React y a un host sin React.

`api.renderers.bind(kind, id, value)` es el canal **del host y del adaptador de
framework**, no el de un plugin agnóstico: el valor cruza como `unknown` y solo
un binding de framework (`@nodera/react`) decide cómo pintarlo, así que en
React tiene que ser un componente (función o `memo`/`forwardRef`). Cualquier otro
valor —un descriptor de datos, por ejemplo— hace que `createRendererSet` lance
`InvalidRendererBindingError` para **todo** el builder, y un id ya ligado no se
puede reemplazar: ese builder deja de poder montarse.

`renderers.bind` no es una contribución a efectos del ciclo de vida: no aparece
en `contributionIds` y `uninstall` nunca lo retira (ver
[Limitaciones conocidas](#limitaciones-conocidas)).

Las "acciones de interfaz" de `docs/FASE7-DEFINITION.md` se expresan con `tool`,
`panel` y `dialog`: son las tres formas declarativas con las que un plugin añade
algo que una persona puede usar, sin aportar componentes.

## El manifest

`PluginManifest` (`packages/sdk/src/plugin-api/manifest.ts`) es el contrato
declarativo que todo plugin distribuye. Es dato puro — sin funciones, sin
componentes — para que pueda validarse, compararse y reportarse **antes** de
ejecutar código de terceros.

```ts
export interface PluginManifest {
  /** Globally qualified id, e.g. `vendor.feature-name`. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Semver version of the plugin itself. */
  readonly version: string;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Optional author. */
  readonly author?: PluginAuthor;
  /** Optional plugins this plugin depends on. */
  readonly dependencies?: readonly PluginDependency[];
  /** Optional host/document compatibility declaration. */
  readonly compatibility?: PluginCompatibility;
  /** Optional declared contributions, for pre-flight conflict detection. */
  readonly contributions?: readonly PluginContribution[];
  /** Optional declared permissions. */
  readonly permissions?: PluginPermissions;
}
```

(`packages/sdk/src/plugin-api/manifest.ts`.)

| Campo | Regla |
| --- | --- |
| `id` | Identificador globalmente cualificado `vendor.feature-name`: al menos un punto, sin espacios y sin segmentos vacíos. Es la misma regla que `isPluginId` aplica a los ids de plugin y de contribución. |
| `name` | Texto para personas; lo muestra el host. |
| `version` | `major.minor.patch` con prerelease opcional (`1.0.0`, `1.2.0-beta.1`) y **sin** build metadata (misma forma que la Fase 6). |
| `description`, `author` | Opcionales; `author` es `{ name, email?, url? }`. |
| `dependencies` | Lista de `{ id, version? }` resuelta **dentro del conjunto que el host entrega**; no descarga nada. |
| `compatibility` | `{ sdkVersion?, documentFormat?, documentVersion?, definitionVersions? }`: contra qué se escribió el plugin (S8). |
| `contributions` | Lista cerrada de `{ type, id, version? }` que el plugin **dice** que va a registrar; es lo que permite detectar conflictos antes de ejecutar código y retirar contribuciones al desinstalar. |
| `permissions` | `{ network?, storage? }`: declaraciones, nunca concesiones. El host decide qué otorga; declarar un permiso no concede nada. |

`compatibility.definitionVersions` es un mapa `definitionId → versión` de las
definiciones que el plugin aporta o consume, para que el host pueda comparar
versiones de definición sin leer el código.

### Validación del manifest

`validatePluginManifest(value: unknown)` acepta entrada no confiable (un
`package.json` en disco, una configuración del host) y devuelve
`Result<PluginManifest, PluginIssues>`. Nunca lanza; cada fallo es un
`plugin.invalid-manifest` con `path` preciso y las claves desconocidas se
ignoran, de modo que un manifest escrito para una versión posterior sigue
validando.

```ts
import { validatePluginManifest } from "@nodera/sdk";

const validated = validatePluginManifest({
  id: "acme.report-nodes",
  name: "ACME report nodes",
  version: "1.0.0",
  compatibility: { sdkVersion: "^0.0.0", documentFormat: "ggd" },
  contributions: [{ type: "node", id: "acme.report.table" }],
});

if (!validated.ok) {
  for (const issue of validated.error) {
    console.error(issue.code, issue.path?.join("."), issue.message);
  }
}
```

Los índices de un array dentro de `path` se reportan como texto
(`["dependencies", "0", "version"]`), porque `PluginIssue.path` es
`readonly string[]`.

## Autoría de un plugin

Un plugin es un `PluginDefinition<TApi>`: el manifest más un hook `activate(ctx)`
síncrono. `ctx` es `{ manifest, api }`, y `api` es el `BuilderPluginApi` del SDK
cuando el host es un builder de Nodera.

```ts
import type {
  BuilderPluginApi,
  NodeDefinitionInput,
  PluginDefinition,
  PluginManifest,
  SdkIssues,
} from "@nodera/sdk";

export const REPORT_NODE: NodeDefinitionInput = {
  type: "acme.report.table",
  version: "1.0.0",
  label: "Report table",
  description: "Renders the records it receives as a table.",
  category: "Reports",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "any", required: true }],
    outputs: [{ id: "out", name: "Out", dataType: "array" }],
  },
};

export const REPORTS_MANIFEST: PluginManifest = {
  id: "acme.reports",
  name: "ACME report nodes",
  version: "1.0.0",
  description: "One report node contributed through the public plugin api.",
  author: { name: "ACME" },
  compatibility: {
    sdkVersion: "^0.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
    definitionVersions: { [REPORT_NODE.type]: "1.0.0" },
  },
  contributions: [{ type: "node", id: REPORT_NODE.type, version: "1.0.0" }],
};

export const reportsPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: REPORTS_MANIFEST,
  activate({ api }) {
    const registered = api.nodes.register(REPORT_NODE);
    if (!registered.ok) {
      const details = registered.error.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
      throw new Error(`acme.reports could not register its node: ${details}`);
    }
  },
};
```

Cuatro reglas de autoría:

- **El manifest declara exactamente lo que `activate` registra**, con los
  mismos tipos y los mismos ids. La declaración es lo que permite detectar un
  conflicto antes de ejecutar código y lo que permite retirar la contribución al
  desinstalar; una contribución registrada y no declarada es un aviso en tiempo
  de instalación (ver [Limitaciones conocidas](#limitaciones-conocidas)).
- **`activate` no puede devolver diagnósticos.** Su firma es `void`, así que un
  fallo se comunica lanzando; el SDK convierte el throw en
  `plugin.activation-failed` con `metadata.sdkCode = "sdk.plugin-invalid"` y la
  instalación se detiene. Los cinco plugins de `plugins/*` tienen un
  `assertRegistered` local que hace exactamente eso.
- **Los hooks son síncronos** (`activate`, `deactivate?`). Cargar el módulo —un
  `import()` dinámico, un fichero de configuración— es trabajo del host **antes**
  de entregar la definición al manager; el manager solo registra, activa,
  desactiva y desinstala de forma determinista.
- **Nada serializable contiene funciones ni componentes.** Un plugin aporta
  datos declarativos y, cuando aporta comportamiento, lo hace a través de un
  puerto (`GraphValidator`, `Importer`, `Exporter`, `GraphLayoutStrategy`), que
  el host invoca cuando corresponde.

Los cinco ejemplos del repositorio cubren doce de las trece clases. La
decimotercera (`renderer`) no la liga ningún plugin, y no debe hacerlo: es una
declaración de la definición que el host resuelve con `bindRenderer`.

| Directorio | Id del plugin | Aporta |
| --- | --- | --- |
| `plugins/basic-nodes` | `example.basic-nodes` | dos nodos y un edge |
| `plugins/data-nodes` | `example.data-nodes` | dos propiedades, un validador y un importador NDJSON |
| `plugins/ai-nodes` | `example.ai-nodes` | dos nodos (el host liga sus componentes) |
| `plugins/developer-tools` | `example.developer-tools` | dos tools, dos paneles y un diálogo |
| `plugins/example-plugin` | `example.kitchen-sink` | un tema, un layout, una estrategia de colocación y un exportador |

Cada uno tiene su README con el detalle y su suite de tests, que instala el
plugin con el manager y comprueba que cada contribución declarada llega al
builder y se retira al desinstalar.

## Instalación desde el host

El host decide qué plugins existen y los instala con el manager, que corre el
ciclo de vida completo sobre un builder del SDK:

```ts
import { assertValid, createBuilder, createPluginManager } from "@nodera/sdk";
import { basicNodesPlugin } from "@nodera/basic-nodes";

const builder = assertValid(createBuilder());
// `sdkVersion` es la versión del SDK que este host ejecuta.
const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

const installed = manager.install([basicNodesPlugin]);
if (!installed.ok) {
  console.error(installed.error.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
}

manager.list();   // PluginRecord[] en orden de instalación
manager.get("example.basic-nodes"); // PluginRecord | undefined
```

`createPluginManager(builder, options?)` recibe las capacidades que un manifest
puede declarar contra el host:

| Opción | Se compara con |
| --- | --- |
| `sdkVersion` | `compatibility.sdkVersion` (rango semver) |
| `documentFormat` | `compatibility.documentFormat` |
| `documentVersion` | `compatibility.documentVersion` |

Una comparación cuyo lado del host está ausente se omite: un host que no declara
versión de SDK no puede ser incompatible con nada, y no se le obliga a inventarla.

### La superficie del manager

```ts
export interface PluginManager {
  install(plugins: readonly PluginDefinition<BuilderPluginApi>[]): Result<readonly PluginRecord[], PluginIssues>;
  deactivate(pluginId: string): Result<PluginRecord, PluginIssues>;
  uninstall(pluginId: string): Result<PluginRecord, PluginIssues>;
  get(pluginId: string): PluginRecord | undefined;
  list(): readonly PluginRecord[];
}

export interface PluginRecord {
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly contributionIds: readonly string[];
  readonly issues: PluginIssues;
}
```

(`packages/sdk/src/plugin-manager/plugin-manager.ts` y `plugin-records.ts`.)

`PluginRecord.issues` es donde el manager reporta lo que no impidió la
operación: los avisos de contribución no declarada de una instalación y los
fallos de retirada de un `uninstall`.

## Ciclo de vida

`install` ejecuta los pasos 1-5 para un conjunto descubierto, en este orden y de
forma síncrona; `deactivate` y `uninstall` recorren los pasos 6 y 7 de un plugin
concreto:

| # | Paso | Qué ocurre | Fallo |
| --- | --- | --- | --- |
| 1 | Discover | se comprueba que cada entrada tiene `manifest` y `activate`, y `validatePluginManifest` valida el manifest (id, name, version, dependencias, compatibilidad, contribuciones, permisos) | `plugin.invalid-manifest` |
| 2 | Resolve dependencies | orden topológico por `dependencies`, rangos semver, ciclos y faltantes | `plugin.missing-dependency`, `plugin.dependency-cycle`, `plugin.invalid-manifest` |
| 3 | Validate compatibility | `sdkVersion` (rango) y `documentFormat`/`documentVersion` (igualdad) contra las opciones del host, cuando éste las declara | `plugin.incompatible-sdk` |
| 4 | Detect conflicts | ids de plugin y pares `(type, id)` de contribución, incluidos los ya instalados por este manager | `plugin.duplicate-plugin`, `plugin.contribution-conflict` |
| 5 | Register + activate | `installPlugin` del SDK registra las contribuciones y emite `plugin.registered`; después corre `activate`, el plugin queda `active` y se emite `plugin.activated` | `plugin.activation-failed` |
| 6 | Deactivate | corre el hook `deactivate` si existe; el plugin queda `inactive` y se emite `plugin.deactivated` | `plugin.deactivation-failed` |
| 7 | Unregister | se retiran las contribuciones **declaradas** en orden inverso, el registro se olvida y se emite `plugin.unregistered` | los fallos se devuelven en el record (ver limitaciones) |

Dos invariantes gobiernan el conjunto:

- **Fail closed.** Los pasos 1-4 ocurren antes de que corra código de plugin: si
  alguno falla, `install` devuelve los diagnósticos sin tocar el builder ni el
  registro del manager. Solo un fallo de `activate` —código de terceros que el
  host decidió ejecutar— puede ocurrir a mitad.
- **Keep what worked.** Un plugin cuyo `activate` lanza queda registrado en
  estado `error` con las contribuciones que alcanzó a registrar, igual que la
  regla de instalación de la Fase 6; el manager no las deshace. Reintentar la
  instalación del mismo id en el mismo builder no es una secuencia soportada
  (ver limitaciones).

### La máquina de estados

`PluginState` (`packages/sdk/src/plugin-api/lifecycle.ts`) declara los estados del
contrato:

```ts
export type PluginState =
  | "discovered"
  | "resolved"
  | "validated"
  | "registered"
  | "active"
  | "inactive"
  | "unregistered"
  | "error";
```

Un `PluginRecord` guardado por el manager solo puede estar en `active`,
`inactive` o `error`: los estados intermedios describen el recorrido
`discovered → resolved → validated → registered` dentro de una misma llamada a
`install`, que no publica records parciales. `unregistered` es el estado del
record que devuelve `uninstall`; el manager ya no guarda ese plugin, así que
`get(pluginId)` responde `undefined`.

`deactivate` solo acepta un plugin `active`: sobre otro estado devuelve
`plugin.invalid-state` sin ejecutar el hook. `deactivate` y `uninstall` de un id
que el manager no tiene devuelven `plugin.not-found`.

### Eventos

El manager no inventa nombres de evento: emite los del SDK
(`packages/sdk/src/events/events-api.ts`) sobre el bus del builder.

| Evento | Quién lo emite | Payload |
| --- | --- | --- |
| `plugin.registered` | `installPlugin` del SDK (paso 5) | `{ pluginId, version, contributionIds }` |
| `plugin.error` | `installPlugin` del SDK | `{ pluginId, message, code }` |
| `plugin.activated` | el manager, tras un `activate` correcto | `{ pluginId, contributionIds }` |
| `plugin.deactivated` | el manager, tras el hook | `{ pluginId }` |
| `plugin.unregistered` | el manager, al terminar `uninstall` | `{ pluginId }` |

```ts
builder.events.on("plugin.activated", ({ pluginId, contributionIds }) => {
  console.log(`${pluginId} activated with ${contributionIds.length} contributions`);
});
```

Los nombres de aplicación (`EDITOR_EVENT_NAMES`) llevan solo ids; los nombres del
SDK llevan además la versión y los ids de contribución.

## Resolución de dependencias

`resolveDependencyOrder(manifests)` ordena el conjunto **descubierto**, de
dependencia a dependiente, y reporta lo que impide instalarlo. Nunca descarga
nada: qué plugins existen es decisión del host.

Gramática de versión soportada (D9), para `dependencies[].version` y para
`compatibility.sdkVersion`:

| Declaración | Significado |
| --- | --- |
| ausente o `*` | cualquier versión |
| `1.2.3` | exactamente esa versión |
| `^1.2.3` | mismo major y `>= 1.2.3` (caret literal: `^0.2.1` acepta `0.3.0`) |
| `~1.2.3` | mismo minor y `>= 1.2.3` |

Cualquier otro operador (`>=`, `>`, `||`, rangos con guion, comodines `x`) no se
reconoce y produce `plugin.invalid-manifest`, no una interpretación aproximada.
Una versión con prerelease solo satisface un rango que opta por prereleases de
la misma terna `major.minor.patch` (precedencia de npm); `*` y la ausencia de
rango siguen significando "cualquiera". Las versiones de plugin usan
`isValidSemver` de `@nodera/contracts` más la regla de "sin build metadata".

```ts
import { resolveDependencyOrder } from "@nodera/sdk";

const ordered = resolveDependencyOrder([reportsPlugin.manifest, sharedPlugin.manifest]);
if (!ordered.ok) {
  // plugin.missing-dependency | plugin.dependency-cycle | plugin.invalid-manifest
}
```

`documentVersion` no es un rango: solo `*` o la versión exacta del host.

## Detección de conflictos

`detectPluginConflicts(manifests)` recorre las declaraciones **antes** de que
corra ningún plugin y falla si:

- dos manifiestos comparten `id` — `plugin.duplicate-plugin`;
- dos contribuciones declaradas comparten `(type, id)` — `plugin.contribution-conflict`.

`install` aplica la misma comprobación al conjunto descubierto **más** los
plugins que ese manager ya tiene, de modo que un id ya instalado se rechaza como
conflicto antes de ejecutar código. Nunca se sobrescribe un registro en
silencio: la colisión es un diagnóstico con `path` y `metadata`.

## Modelo de seguridad

Un plugin que contiene código es código ejecutable de terceros (AGENTS.md §9);
no se trata como dato confiable por llevar un manifiesto (S6).

- **La carga es explícita y la controla el host.** `install` recibe la lista de
  `PluginDefinition` que el host ensambló. Nada escanea directorios, nada
  descarga, nada se activa por convención.
- **Un documento nunca activa código.** Importar un JSON/YAML no carga plugins:
  las extensiones y referencias del documento son declarativas, y una referencia
  a un nodo o a un plugin no es autorización para ejecutarlo.
- **Validación antes de ejecución.** Manifest, compatibilidad, dependencias y
  conflictos se comprueban sin correr código; un conjunto rechazado no deja
  rastro en el builder.
- **Sin evaluación de expresiones.** El core y estos paquetes no usan `eval` ni
  `new Function`, y los valores externos se validan en el límite.
- **Los permisos son declaraciones.** `permissions` registra lo que un plugin
  dice necesitar; el host decide qué concede, y declararlo no concede nada.
- **No se promete aislamiento.** Un plugin corre en el mismo contexto
  JavaScript que el host; el contrato no promete sandboxing.

## Distribución

Formatos soportados (S7), todos explícitos:

- **Paquetes npm públicos** — un plugin se publica y se declara en
  `dependencies` del host.
- **Paquetes npm privados** — el mismo mecanismo dentro de un registry privado.
- **Plugins internos de una aplicación** — un módulo del propio monorepo del
  host, como los cinco `plugins/*` de este repositorio.
- **Plugins cargados explícitamente en tiempo de ejecución** — el host hace el
  `import()` y pasa la definición resultante a `install`.

Hoy la superficie pública del ecosistema es `@nodera/sdk`, que se empaqueta con
`tsup` en un único `dist/` autocontenido (`exports` con una sola entrada `"."`,
sin subrutas) y se puede inspeccionar con `npm pack --dry-run`. Un plugin de
terceros declara `@nodera/sdk` como peer del host, no un paquete de plugins
propio. Publicar los cinco `plugins/*` de ejemplo sigue siendo Fase 8. No existe
marketplace, ni descarga dinámica, ni auto-actualización: primero tiene que
estabilizarse el contrato de extensión.

## Limitaciones conocidas

Límites reales de la implementación actual, no suposiciones de roadmap.

- **Un id de plugin no se puede reinstalar en el mismo builder.** El SDK
  recuerda en un `WeakMap` los ids ya instalados en un builder y nunca los
  olvida, así que desinstalar y reinstalar **el mismo id en el mismo builder**
  falla dentro de `installPlugin` (`sdk.plugin-conflict`) y el manager devuelve
  `plugin.activation-failed` con el record en estado `error`. Para volver a
  instalar un plugin, usa un builder nuevo o un id nuevo; las suites de
  `plugins/*` componen un builder por caso por este motivo.
- **`uninstall` retira solo lo declarado.** Se retiran las contribuciones que el
  manifest declara, en orden inverso, cada una por la superficie de su `type`.
  Una contribución registrada por `activate` y no declarada en el manifest sigue
  registrada: el record de instalación lleva un aviso
  `plugin.invalid-manifest` (severity `warning`) nombrando el id que no podrá
  retirarse. Es un bug de autoría del plugin, no una retirada silenciosa.
- **Los bindings de renderer nunca se retiran.** Un binding (por
  `api.renderers.bind` o por `builder.bindRenderer`) no es una contribución: no
  aparece en `contributionIds` y `uninstall` no lo desregistra. Un host que
  necesite deshacer un binding lo hace en su propio adaptador de presentación.
- **Un plugin agnóstico no liga renderers.** `api.renderers.bind` es el canal del
  host y de su adaptador, y el adaptador de React exige un componente: un
  descriptor de datos ligado en `nodes` hace que `createRendererSet` lance
  `InvalidRendererBindingError` para todo el builder, que entonces no se puede
  montar (y el id ligado no se puede reemplazar). Un plugin declara la
  definición y el host liga el componente con `builder.bindRenderer`; es el
  reparto que siguen los cinco `plugins/*` y el que compone
  `examples/phase7-demo`.
- **No existe `plugin.uninstall-failed`.** Un fallo al retirar una contribución
  reutiliza `plugin.deactivation-failed` (con `metadata.contributionId`,
  `metadata.type` y, cuando llega, `metadata.sdkCode`), y una contribución
  declarada que el builder no contiene es `plugin.not-found`. Ningún fallo de
  retirada detiene la retirada: se informan todos en el record.
- **Los manifests de ejemplo declaran `compatibility.sdkVersion: "^0.0.0"`.**
  Los cinco `plugins/*` se escribieron contra el SDK actual, que todavía no se ha
  publicado; el caret honesto hoy es `^0.0.0` y debe subir junto con la primera
  publicación del SDK.

## Referencias

- `packages/sdk/src/plugin-api/` — los contratos del ecosistema.
- `packages/sdk/src/plugin-manager/` — validación, resolución, conflictos y
  ciclo de vida.
- `packages/sdk/README.md` — la superficie `BuilderPluginApi` y los eventos.
- `docs/PROJECT-STRUCTURE.md` §7.5-7.6 — las fronteras y la distribución en dos
  paquetes.
- `docs/FASE7-DEFINITION.md` — el módulo de la fase y sus requisitos.
- `odd/tasks/fase7-plugin-ecosystem.md` — specs, decisiones y log de la fase.
