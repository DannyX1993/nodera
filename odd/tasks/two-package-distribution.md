# feature: two-package-distribution

Consolidar la distribución pública de Nodera a **dos paquetes**: `@nodera/sdk` (todo el core framework-agnóstico) y `@nodera/react` (todo el binding React: `react-flow` + `ui-react`). Cambiar de framework en el futuro = cambiar el paquete del binding, sin tocar el core.
Branch: se trabaja sobre `master` (fase 7 y fase 8 ya mergeadas).

## Specs

- S1 (user decision, verbatim): "Yo creo que es mejor en dos paquetes, uno lo que es todo el core y todo lo agnostivo y otro todo lo de react, no? asi si en el futuro en vez de react o reactflow usamos otra cosa es solo meter ese otro paquete en vez de react, no?"
- S2 (AGENTS.md §4.1): el core/dominio/aplicación no importa React ni React Flow; "No añadas dependencias de React o React Flow a paquetes de dominio o aplicación."
- S3 (AGENTS.md §4): "Evita dependencias circulares entre paquetes."

## Non-goals

- No desmantelar el monorepo: los paquetes internos siguen existiendo para desarrollo, tests y arquitectura; solo dejan de publicarse.
- No publicar realmente (sigue vigente readiness-only, `npm pack --dry-run` como smoke).
- No cambiar el comportamiento de runtime.

## Decisions

- D1: `@nodera/sdk` es el paquete público del core framework-free. Bundela las 15 dependencias core (contracts, domain, graph-model, application, document, serialization-json, serialization-yaml, validation, node-registry, edge-registry, property-system, history, graph-layout, ui-core, theme-engine, layout-engine) + re-exporta `@nodera/plugin-api`. **Fold**: `@nodera/plugin-manager` se pliega DENTRO de `@nodera/sdk` (mover su `src/` a `packages/sdk/src/plugin-manager/`) para eliminar el ciclo `sdk ↔ plugin-manager` (plugin-manager depende de sdk). `@nodera/plugin-api` se pliega también (es chico, puro, y el ciclo `sdk ↔ plugin-manager` se rompe mejor si ambos viven en sdk). Entry único `.`; sin React, sin `@xyflow`.
- D2: `@nodera/react` es un paquete público NUEVO (`packages/react/`). Bundela `@nodera/sdk` + `@nodera/react-flow` + `@nodera/ui-react` en un solo `dist/`. Depende de `@nodera/sdk` en una sola dirección (sin ciclo). `peerDependencies`: `react`, `react-dom`, `@xyflow/react`. Re-exporta TODO (`sdk` + `react-flow` + `ui-react`) para que un host React instale un solo paquete.
- D3: Los 23 paquetes restantes pasan a `private: true` (todo `packages/*` excepto `sdk` y `react`, más los 4 stubs ya private). Mantienen `build`/`test`/`typecheck` para desarrollo; sus `dist/` son inputs del bundle.
- D4: Imports públicos: `@nodera/react-flow` y `@nodera/ui-react` → `@nodera/react`; `@nodera/plugin-api` y `@nodera/plugin-manager` → `@nodera/sdk`. Se actualizan `examples/*` y `plugins/*` y los READMEs/`docs/PLUGINS.md`/`docs/SDK-GUIDE.md`.
- D5: Reglas de arquitectura (`scripts/check-architecture.mjs`) actualizadas: el binding React ahora se expone por `@nodera/react` (nueva regla: solo `@nodera/react` y `@nodera/react-flow`/`@nodera/ui-react` pueden importar React/`@xyflow`); `sdk-framework-free` sigue valiendo (sdk no importa React); `plugin-manager-is-infrastructure-only` se reemplaza porque plugin-manager ya no es paquete separado.

## Verification

- `pnpm build` produce `packages/sdk/dist/index.js|.d.ts` (core) y `packages/react/dist/index.js|.d.ts` (binding).
- `npm pack --dry-run` en `@nodera/sdk` y `@nodera/react`: dos tarballs self-contained (sin imports `@nodera/*` residuales).
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm check:architecture` verdes.
- Ejemplos y plugins compilan/testean con los imports nuevos.
- Differential: la superficie pública re-exportada por `@nodera/sdk` y `@nodera/react` cubre los nombres que antes salían de los 4 paquetes públicos (react-flow, ui-react, plugin-api, plugin-manager), sin aserciones eliminadas.

## Tasks

- T1 (D1): fold de `plugin-api` + `plugin-manager` dentro de `packages/sdk/` (mover `src/`, actualizar imports internos, re-exportar desde el barrel de sdk) y marcarlos `private`. Route: worker. Commit: yes.
- T2 (D1,D3): bundle core de `@nodera/sdk` (tsup, una entrada, noExternal `@nodera/*`, sin React) + `package.json` (exports, deps→devDeps) + 19 paquetes core `private`. Route: worker. Commit: yes.
- T3 (D2,D4): nuevo `@nodera/react` (tsup bundle de sdk+react-flow+ui-react, peerDeps React) + marcar react-flow/ui-react `private` + actualizar imports de `examples/*`/`plugins/*`. Route: worker. Commit: yes.
- T4 (D5,cierre): reglas de arquitectura + docs (PLUGINS, SDK-GUIDE, READMEs) + verificación completa + pack + differential + risk lines. Route: inline + verify. Commit: yes.

## Log

- L1 (user, verbatim): "a ver, al final esto va conjunto no se debe empaquetar por separado. Podemos hacer que sea un solo archivo para poder utilizar el SDK que al final va a ser el punto de entrada, no?"
- L2 (user decision, verbatim): "Un paquete + subpath react".
- L3 (research + user pivot): la vía "un paquete + subpath" vía bundler+re-export genera un ciclo real `sdk ↔ react-flow/ui-react/plugin-manager` (turbo aborta, rompe 2 reglas de arquitectura, TS2322 por identidad de tipos). El usuario pivota a **dos paquetes** (S1): el core agnóstico por un lado, el binding React por otro, intercambiable por otro framework en el futuro. El ciclo se elimina porque `@nodera/react` depende de `@nodera/sdk` en una sola dirección, y `plugin-manager`/`plugin-api` se pliegan dentro de `sdk`.
- L4 (execution): intento previo de "1 paquete + subpath" (worker) revertido íntegro (`git checkout -- .` + rm de `packages/sdk/src/react.ts`/`tsup.config.ts`); se re-arranca limpio con el modelo de dos paquetes.
- L5 (execution): T1-T4 completados (delegado a worker + fixes de docs del parent). Fold de `plugin-api` + `plugin-manager` dentro de `packages/sdk/src/{plugin-api,plugin-manager}` (imports reescritos a relativos, sin ciclo hacia `src/index.ts`); `@nodera/sdk` bundela el core (tsup, `noExternal @nodera/*`, self-contained, `exports` `.` único, sin React); nuevo `@nodera/react` (bundela sdk+react-flow+ui-react, peerDeps react/react-dom/@xyflow/react); 23 paquetes `private`; imports de examples/plugins migrados a `@nodera/sdk`/`@nodera/react`; reglas de arquitectura reescritas (8 PASS); O1: emisión de tipos no-bundelados `dist/types` + `paths` en `tsconfig.base.json` para identidad única de tipos en el workspace (el `dist/index.d.ts` publicado queda self-contained y `dist/types` excluido del tarball). Verificación: build 32/32, typecheck 56/56, test 56/56 (sdk 613 tests), lint 0 errors/52 warnings, architecture 8/8, `npm pack --dry-run` x2 (sdk 467 kB / react 966 kB, self-contained), demos phase6/phase7 build OK. Parent corrigió `packages/sdk/README.md` (stale, ship en el tarball) y `docs/ROADMAP.md` (dos paquetes).
