# feature: fase8-production-readiness

Fase 8 Production Readiness para Nodera, per docs/PRODUCT-DESCRIPTION.md §12 (Roadmap) y las secciones que la detallan (§11.1 Performance, §11.3 Compatibility, §11.4 Testing, §3.22 Accessibility & Internationalization, §17 Documentation).
Branch: `feature/fase8-production-readiness` (off `feature/fase7-plugin-ecosystem`, single-branch delivery like fase1-7).

## Specs

- S1 (user request, verbatim): "Vamos con la fase 8 descrito en el documento @docs/PRODUCT-DESCRIPTION.md en la sección 12 de roadmap. Lo que dice de hacer en esa fase esta definido con detalle en el resto del documento"
- S2 (ROADMAP Fase 8, verbatim): "Implementar: Performance. Accessibility. Internationalization. Testing. Documentation. Compatibility. Release Automation. npm Publishing. Resultado: producto listo para ser consumido por aplicaciones externas."
- S3 (user decision, L2): "MIT" — licencia SPDX del repo y de los paquetes publicables.
- S4 (user decision, L2): "Solo dejar publicable" — build real a `dist`, `package.json` (fields/exports), changesets y `npm pack --dry-run`; **sin** `npm publish` real (sin credenciales ni registro externo).
- S5 (user decision, L2): "1.0.0 estable" — versión base de los paquetes publicables; el SDK expone una constante de versión real que resuelve `compatibility.sdkVersion`.
- S6 (user decision, L2): "Solo reforzar Vitest" — endurecer unit/integration/contract existentes; **sin** Playwright/Cypress ni E2E de navegador ni tests visuales por screenshots.
- S7 (PRODUCT-DESCRIPTION §11.1 Performance, verbatim): "Renderizado eficiente. Evitar actualizaciones innecesarias. Soporte para grafos grandes. Virtualización cuando sea necesaria. Separación entre estado del canvas y estado del dominio. Operaciones incrementales. Posibilidad de optimizar selección y renderizado."
- S8 (PRODUCT-DESCRIPTION §3.22 Accessibility & Internationalization, verbatim): "Navegación por teclado. Accesibilidad de nodos y edges. ARIA. Atajos configurables. Textos traducibles. Internacionalización. Formatos regionales. Soporte RTL. Etiquetas accesibles."
- S9 (PRODUCT-DESCRIPTION §11.4 Testing, verbatim): "Unit tests de dominio. Tests de casos de uso. Tests de contratos. Tests de serialización. Tests de plugins. Tests de adaptadores. Tests de integración. Tests visuales. Tests E2E."
- S10 (PRODUCT-DESCRIPTION §17 Documentation, verbatim): "Actualiza documentación cuando cambies: APIs públicas. Contratos del documento GGD. Definiciones de nodos, edges o propiedades. Sistema de plugins. Ciclo de vida del builder. Dependencias entre paquetes. Comportamiento de importación/exportación."
- S11 (PRODUCT-DESCRIPTION §11.3 Compatibility, verbatim): "TypeScript strict. Versionado semántico. Contratos estables. Migraciones. Compatibilidad entre documentos. Soporte de extensiones desconocidas."
- S12 (Release Automation + npm Publishing): el roadmap solo nombra estas dos áreas (sin detalle en el cuerpo del documento); se definen por S3–S5 + AGENTS.md §8 ("Distribución: Paquetes npm") y §18 (typecheck/lint/build en cada paquete afectado). "npm Publishing" se interpreta como *readiness* de publicación (S4), nunca como `npm publish` real.
- S13 (AGENTS.md §18, verbatim, aplica a cada unidad): "Ejecuta los tests relevantes. Ejecuta typecheck, lint y build para los paquetes afectados cuando existan scripts para ello. Revisa `git diff` para detectar cambios accidentales, archivos generados o secretos. Comprueba que no se han introducido dependencias prohibidas entre capas."

## Non-goals

- `npm publish` real a un registry (S4): solo dejar publicable + `npm pack --dry-run`.
- Tests de navegador E2E/visuales (Playwright/Cypress/Storybook/Chromatic) (S6).
- Cambiar el contrato GGD del documento ni su comportamiento de round-trip (S11 se cumple sin tocar el formato ya establecido).
- Cambiar la arquitectura de capas ni la dirección de dependencias; Fase 8 es aditiva y de endurecimiento.
- Marketplace de plugins ni descarga dinámica (ya fuera de alcance en Fase 7).
- Ejecutar nodos/tools (invariante del producto, AGENTS.md §1).

## Decisions

- D1: Branch única `feature/fase8-production-readiness` desde `feature/fase7-plugin-ecosystem` (fase 7 aún no mergeada a master). La Fase 8 construye sobre la Fase 7; el merge a master sigue siendo decisión del usuario.
- D2: Licencia MIT (S3). `LICENSE` en raíz + campo `license: "MIT"` en todos los paquetes publicables + `license` en el `package.json` raíz.
- D3: Paquetes publicables = los 21 `packages/*` con código fuente real; quedan `private` los 4 stubs sin código (`core`, `testing`, `adapter-storage-local`, `adapter-storage-http`), y `apps/*`/`examples/*`/`plugins/*` (apps y ejemplos no se publican; los plugins de ejemplo quedan privados hasta que exista una tarea explícita de distribución de plugins).
- D4: Pipeline de build real (S4). Cada paquete publicable gana `tsconfig.build.json` que emite a `dist/` (JS + `.d.ts` + sourcemap), `build` → `tsc -p tsconfig.build.json` (antes `tsc --noEmit`), y `main`/`types`/`exports`/`files` apuntan a `dist`. El `typecheck` (`tsc --noEmit`) y el dev source-consumed de ejemplos siguen funcionando vía turbo `^build` (los deps se compilan antes). Sin bundler nuevo ni dependencia añadida: `tsc` ya está en el repo.
- D5: Versionado 1.0.0 (S5). Todos los paquetes publicables pasan a `version: "1.0.0"` y `@nodera/sdk` expone `SDK_VERSION = "1.0.0"` (y el `@nodera/contracts` si hace falta para la resolución de `compatibility.sdkVersion` sin ciclo). Los plugins de ejemplo que declaran `compatibility.sdkVersion: "^0.0.0"` se corrigen a `^1.0.0` en la misma unidad para que sigan siendo honestos.
- D6: Compatibilidad de definición-instancia (S11). Se añade una regla explícita que compara la `version` de una `NodeInstance`/`EdgeInstance` con la versión de la definición registrada y produce un diagnóstico `document.definition-version-mismatch` (o código equivalente) en lugar de aceptarla en silencio; se documenta la política (major igual, minor/patch tolerados — consistente con el caret de plugins).
- D7: Migraciones (S11). El puerto `documentVersionMigrator` ya existe (Fase 2); se envía al menos una migración real registrada por defecto (o una superficie pública de registro de migraciones) y se documenta, para que "migraciones" deje de ser maquinaria sin política.
- D8: a11y (S8). Capa de atajos configurables como contrato en `@nodera/ui-core` (framework-agnostic, sin React) + proveedor en `ui-react`; `aria-live="polite"` para anuncios de validación/historial; estilos `:focus-visible`; sin añadir `axe-core`/`jest-axe` (S6 = Vitest, y se evita dependencia nueva): las aserciones a11y se hacen con los tests jsdom existentes (roles, aria-*, tabIndex, teclado).
- D9: i18n (S8). Catálogo de strings + tipo `Locale` + `t()` en `@nodera/ui-core` (framework-agnostic); proveedor en `ui-react`; se extraen los ~40 strings hardcodeados a un catálogo por defecto `en` con override por host; `Intl` para formatos regionales; se documenta RTL como soportable por composición (sin implementar layout RTL completo en esta fase).
- D10: Performance (S7). `React.memo` en renderers de nodo/edge y paneles; aislar la selección de la derivación del grafo (la selección no debe reconstruir los objetos React Flow); `onlyRenderVisibleElements` en el canvas; un test de regresión de performance que afirme que una actualización no relacionada no re-deriva los nodos (conteo de invocaciones). Sin virtualización de paleta en esta fase (no hay evidencia de grafos/paletas lo bastante grandes; se documenta como limitación).
- D11: Testing (S9, S6). ESLint + Prettier con config raíz compartida y `lint` real por paquete (hoy `pnpm lint` es no-op); umbrales de cobertura mínimos en los vitest configs; decidir `packages/testing` (rellenarlo con fixtures/fakes compartidos o marcarlo explícitamente como placeholder privado no publicable); tests para los 4 paquetes sin código (o documentarlos como stubs no publicables). Sin Playwright.
- D12: Release Automation (S12). GitHub Actions CI (push/PR: `pnpm install --frozen-lockfile` + `test`/`typecheck`/`build`/`lint`/`check:architecture`) y changesets (`@changesets/cli`) con `version`/`release` scripts + CHANGELOG. No se ejecuta ningún workflow (no hay push a GitHub en esta fase); solo se crean los archivos. `check:architecture.mjs` gana una regla para `ui-core` (sin React) si D8/D9 lo requiere.
- D13: Documentación (S10). README raíz, `CONTRIBUTING.md`, `CHANGELOG.md` (arrancado por changesets), READMEs para los 16 paquetes sin README, y refresco de los docs stale: `GLOBAL-ARCHITECTURE.md` (mencionar plugin-manager/graph-layout/waypoints), `KNOWN-ISSUES.md` (listar limitaciones reales conocidas), `PROJECT-STRUCTURE.md`/`PRODUCT-DESCRIPTION.md` (marcar `apps/*` y ciertos `examples/*` como stubs/placeholders), y estado Fase 8 en `ROADMAP.md`.

## Verification

- TDD por unidad: RED antes de implementar; tests por la interfaz pública.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint` (nuevo), `pnpm check:architecture` (turbo).
- Prueba funcional de publicación: `pnpm -r --filter @nodera/sdk exec npm pack --dry-run` (o equivalente) demuestra que el tarball de al menos un paquete publicable contiene `dist/` y sus metadatos (S4).
- Differential check (código compartido tocado): el pipeline de build (D4) cambia el `build`/`main`/`types` de los 21 paquetes — comparar que los ejemplos (`phase6-demo`/`phase7-demo`) siguen compilando/resolviendo tras el cambio (ninguna aserción eliminada; solo adiciones de metadatos).
- Verificación independiente final (`gentle-ai-verify`) por tocar contratos públicos nuevos (D8/D9 shortcuts + locale, D5 versión de SDK, D6 código de diagnóstico).

## Tasks

- T1 (S3,S10,S12): metadatos raíz — `LICENSE` (MIT), `README.md` raíz, campos de `package.json` raíz (`license`/`repository`/`author`/`keywords`), `.npmrc`. Route: inline. Commit: yes.
- T2 (S4,S5,S12): pipeline de publicación — `tsconfig.build.json` + `build` real a `dist` y `main`/`types`/`exports`/`files`/`license`/`repository`/`publishConfig` para los 21 paquetes publicables; smoke `npm pack --dry-run`. Route: worker (TDD: pack smoke). Commit: yes.
- T3 (S5,S11): compatibilidad — `SDK_VERSION = "1.0.0"` en SDK/contracts, resolución real de `compatibility.sdkVersion`, política de versión definición-instancia (D6), migración real registrada (D7). Route: worker (TDD). Commit: yes.
- T4 (S8): accesibilidad — atajos configurables (contrato ui-core + proveedor), `aria-live` para validación/historial, estilos `:focus-visible`, aserciones a11y. Route: worker (TDD). Commit: yes.
- T5 (S8): internacionalización — catálogo de strings + `Locale` + `t()` en ui-core, proveedor en ui-react, extracción de ~40 strings a catálogo `en`. Route: worker (TDD). Commit: yes.
- T6 (S7): performance — `React.memo`, aislar selección de la derivación, `onlyRenderVisibleElements`, test de regresión de no re-derivación. Route: worker (TDD). Commit: yes.
- T7 (S9,S6): testing hardening — ESLint+Prettier + `lint` real, umbrales de cobertura, decidir `packages/testing`, tests de los 4 stubs. Route: worker. Commit: yes.
- T8 (S10,S13): documentación — READMEs de 16 paquetes, `CONTRIBUTING.md`, `CHANGELOG.md`, refresco de docs stale (GLOBAL-ARCHITECTURE, KNOWN-ISSUES, PROJECT-STRUCTURE, ROADMAP Fase 8). Route: worker. Commit: yes.
- T9 (S12): release automation — GitHub Actions CI, changesets + scripts `version`/`release`, `.changeset/`. Route: worker. Commit: yes.
- T10 (S1..S13): cierre — turbo test/typecheck/build/lint/architecture, differential check, pack smoke, risk lines, verificación independiente `gentle-ai-verify`. Route: inline + verify. Commit: no (evidence only).

## Log

- L1 (user request, verbatim): "Vamos con la fase 8 descrito en el documento @docs/PRODUCT-DESCRIPTION.md en la sección 12 de roadmap. Lo que dice de hacer en esa fase esta definido con detalle en el resto del documento"
- L2 (user decisions, verbatim): Licencia — "MIT"; Publicación — "Solo dejar publicable"; Versionado — "1.0.0 estable"; Testing E2E — "Solo reforzar Vitest". → S3–S6, D2–D6, D11.
- L3 (research evidence, explorer map): mapeo completo de las 8 áreas. Performance: memoización de derivación sólida (`graph-canvas.tsx:1715-2110`, `editor-snapshot.ts:35-49`) pero sin `React.memo` en componentes, selección reconstruye todo el grafo (`use-editor-graph.ts:75-99`), sin `onlyRenderVisibleElements` (`graph-canvas.tsx:2139`), sin benchmarks. A11y: ARIA por componente bueno (dialog focus-trap `dialog.tsx:150-231`, toolbar `toolbar.tsx:171-282`, minimap `minimap-panel.tsx:191-235`) pero sin `aria-live`, sin atajos configurables, sin `:focus-visible`. i18n: inexistente (~40 strings hardcodeados en `ui-react`/`react-flow`). Testing: 21 vitest configs, ~160 archivos de test, `packages/testing` es stub vacío, 4 paquetes sin tests, sin ESLint (`pnpm lint` no-op), sin visual/E2E. Docs: 9/25 paquetes con README, sin README raíz ni LICENSE, 16 paquetes sin README, `KNOWN-ISSUES` con 1 sola entrada. Compat: capa documento sólida (`versioning.ts`, `normalize.ts` preservación) pero 0 migraciones reales, sin política definición-instancia, semver helpers no exportados de contracts, SDK sin constante de versión. Release: 0% (sin `.github/`, changesets, versionado). Publishing: 0 paquetes publicables (`private:true`, `main`→`.ts` sin dist, sin fields).
- L4 (execution): Engram mirror no disponible — `mem_current_project` rechazó el contrato de runtime de Engram ("unreadable or incompatible contract"). El tracking de Fase 8 queda solo en este archivo `odd/tasks/fase8-production-readiness.md` (sin mirror `odd/fase8-production-readiness/tasks`).
- L5 (pre-existing, open): `plugins/ai-nodes/src/index.ts` tiene un cambio **sin commitear** que reintroduce bindings de data descriptors (rompe `InvalidRendererBindingError` al montar, contradice D13/L12-L13 de `fase7-plugin-ecosystem.md`, y rompe 4 tests de `plugins/ai-nodes/src/index.test.ts`). Queda fuera de la Fase 8; no se commitea ni se descarta sin autorización. Se resolverá (revert/stash) antes del cierre T10.
