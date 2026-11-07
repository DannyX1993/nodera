# Fase 1 — Domain Foundation

Core del dominio de Nodera: modelos de grafo, definiciones, registros y validación, sin interfaz gráfica.

## Specs

- S1: "Vamo a hacer ahora solo la Fase 1 especificada en @docs/ROADMAP.md . La definición de modulos de esta fase está en @docs/FASE1-DEFINITION.md y debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md"
- S2: ROADMAP Fase 1 "Domain Foundation": "Graph Model. Node Model. Edge Model. Port Model. Node Definitions. Edge Definitions. Property Definitions. Registries. Graph Validation." Resultado: "core capaz de crear y gestionar grafos sin interfaz gráfica."
- S3: Graph domain module components: "Graph Entity. Node Entity. Edge Entity. Port Entity. Connection Value Object. GraphId. NodeId. EdgeId. PortId. GraphMetadata. GraphSettings."
- S4: "El grafo no debe asumir que todos los nodos tienen inputs y outputs del mismo tipo. Los puertos deben admitir diferentes semánticas y contratos de datos."
- S5: Node definition contract fields: "Identificador único. Nombre. Descripción. Categoría. Icono. Versión. Renderizador. Puertos. Propiedades. Reglas de conexión. Configuración visual. Reglas de validación. Metadatos adicionales."
- S6: "Una definición de nodo debe ser independiente de su instancia." Ejemplo: `http.request` definición, `node-123` instancia.
- S7: Node Registry: "permitir registrar, consultar, actualizar y eliminar definiciones."
- S8: Edge definition soporta: "Diferentes estilos de líneas. Diferentes geometrías. Flechas. Etiquetas. Indicadores de estado visual. Colores. Animaciones. Acciones contextuales. Conexiones condicionales. Metadatos. Tipos de conexión." Y: "La definición de una conexión visual debe estar separada de la semántica de la relación almacenada en el documento."
- S9: Puerto declara: "Identificador. Nombre. Dirección. Tipo de dato. Multiplicidad. Cardinalidad. Reglas de conexión. Representación visual. Metadatos." Reglas ejemplo: tipo string, múltiples conexiones, una sola conexión, tipos de nodos permitidos, condición personalizada.
- S10: "La validación debe producir resultados independientes de la representación visual."
- S11: Property types: "String. Number. Boolean. Select. Multi-select. Textarea. Code editor. JSON editor. YAML editor. Date. DateTime. Color. File reference. Object. Array. Custom component." Config por propiedad: "Identificador. Etiqueta. Descripción. Tipo. Valor por defecto. Obligatoria. Editable. Visible. Orden. Validaciones. Opciones. Dependencias. Condiciones de visibilidad. Componente personalizado. Agrupación." Dinámicas: "mostrar, ocultar o modificar campos en función de los valores de otros campos." "utilizar JSON Schema Draft 2020-12 como estándar de referencia... añadiendo un metamodelo de UI propio".
- S12: Registry operations: "Registrar extensiones. Consultarlas por identificador. Consultarlas por categoría. Resolver versiones. Detectar identificadores duplicados. Resolver dependencias. Desregistrar extensiones. Gestionar conflictos."
- S13: Validation levels: structural ("Identificadores duplicados. Nodos inexistentes. Conexiones inválidas. Puertos inexistentes. Referencias inconsistentes.") y domain ("Restricciones entre tipos de nodos. Cardinalidad de conexiones. Reglas específicas de cada definición. Propiedades obligatorias."). Document validation y extension validation quedan fuera de Fase 1 (Fase 2 y Fase 7). Custom validators registrables.
- S14: Issue shape: "Code. Severity. Message. ElementId. PropertyPath. Metadata."
- S15: "un grafo puede ser estructuralmente válido y, sin embargo, tener errores de configuración. No debemos confundir ambos estados."
- S16: AGENTS.md: core sin React/React Flow/DOM/almacenamiento; definiciones ≠ instancias; ids estables (no índices); sin `any`, `!` innecesario ni casts injustificados; English identifiers/comments; diagnósticos estructurados.
- S17: Decisiones del usuario: topología en 7 paquetes (contracts: tipos compartidos y puertos; graph-model: entidades; property-system; node-registry; edge-registry; validation; domain: fachada). Test runner: Vitest. Build: no emitir (`noEmit`), build = verificación de tipos.

## Tasks

- T1 (S17): Infra — tsconfig por paquete, vitest compartido, scripts en los 7 paquetes. Commit.
- T2 (S14,S16): contracts — ids con branding, ValidationIssue, Severity, puertos de registry. Commit.
- T3 (S3,S4,S16): graph-model — entidades e integridad estructural. Commit.
- T4 (S11): property-system — PropertyDefinition + validación de propiedades. Commit.
- T5 (S5,S6,S7,S12): node-registry — NodeDefinition + NodeRegistry. Commit.
- T6 (S8,S12): edge-registry — EdgeDefinition + EdgeRegistry. Commit.
- T7 (S9,S10,S13,S14,S15): validation — validadores estructural y de dominio + ValidatorRegistry. Commit.
- T8 (S2): domain — fachada que compone el core. Commit.
- T9 (S2,S16): verificación completa del pipeline y revisión de diff.

## Log

- L1: "Vamo a hacer ahora solo la Fase 1 especificada en @docs/ROADMAP.md . La definición de modulos de esta fase está en @docs/FASE1-DEFINITION.md y debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md"
- L2: Decisiones de topología (7 paquetes), Vitest y no-emit confirmadas por el usuario vía cuestionario.
- L3: El usuario pidió probar el core manualmente en terminal sin tests automáticos; se creó el ejemplo ejecutable examples/phase1-demo (imports workspace reales, verificado con `pnpm dlx tsx index.ts`).

## Commits

- T1 → 568bb8c chore(domain): scaffold phase-1 package infrastructure
- T2 → 5aea3e9 feat(contracts): shared identifiers, results, diagnostics and registry port
- T3 → e739685 feat(graph-model): graph, node, edge, port and connection entities
- T4 → 8be6902 feat(property-system): declarative property definitions
- T5 → 62ffa36 feat(node-registry): node definitions and NodeRegistry
- T6 → 54a14de feat(edge-registry): edge definitions and EdgeRegistry
- T7 → cd93f1f feat(validation): structural and domain graph validation
- T8 → 7485da2 feat(domain): facade composing the phase-1 core
- Extra → bb3526f docs(examples): runnable phase-1 domain demo (verificación manual en terminal)
- Extra → 5d6ca76 docs(odd): record fase-1 domain foundation coverage and verification

## Coverage

- S1–S2: solo Fase 1; resultado verificable sin UI (domain-facade.test.ts integra todo el core).
- S3–S4: graph-model (entidades + puertos polimórficos, sin asumir forma del grafo).
- S5–S7: node-registry (contrato declarativo completo, definición ≠ instancia, CRUD del registro).
- S8: edge-registry (presentación separada de la semántica almacenada).
- S9: graph-model/port.ts (declaraciones con dirección, tipo, multiplicidad, cardinalidad, reglas, visual, metadata).
- S10–S11: property-system (16 tipos, metamodelo UI propio, JSON Schema 2020-12 como referencia, condiciones dinámicas serializables).
- S12: contracts/registry.ts + NodeRegistry (categoría) + EdgeRegistry (connection type); resolución de rangos de versión queda como limitación documentada.
- S13–S15: validation (structural + domain; document/extension levels quedan para Fase 2/Fase 7; reporte separa validez estructural de configuración).
- S16: verificado por grep — sin imports de React/React Flow/DOM en los 7 paquetes.
- S17: aplicado (Vitest, noEmit, 7 paquetes).

## Verification

- `pnpm exec turbo run build typecheck test`: 21/21 tareas OK (7 paquetes × 3), 67 tests en verde.
- Grep de dependencias prohibidas: vacío.
- git diff master revisado: solo paquetes de Fase 1, turbo.json, lockfile y este documento.
- Engram no disponible (binario ausente): mirror de memoria no persistido.

Risk: none
