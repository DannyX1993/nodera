# AGENTS.md — Nodera

Este archivo define las instrucciones de trabajo para agentes de programación que contribuyan a Nodera. Sus reglas se aplican a todo el proyecto, salvo que exista un `AGENTS.md` más específico en un subdirectorio. En caso de conflicto, respeta las instrucciones de mayor especificidad y las decisiones documentadas en el propio código y ADRs vigentes.

## 1. Misión del proyecto

Construimos **Nodera**, un Graph Editing Framework genérico, extensible y agnóstico respecto al dominio y al motor de ejecución.

Nodera permite definir, editar, representar, validar, importar y exportar grafos. No ejecuta workflows, nodos, tools ni procesos externos.

Debe poder integrarse en aplicaciones diferentes mediante un SDK y un sistema de plugins. Cada aplicación host debe poder definir sus tipos de nodos, edges, puertos, propiedades, herramientas, renderizadores, paneles, temas y layouts.

El documento del grafo debe ser portable e independiente de React, React Flow y de cualquier sistema de ejecución externo.

### Objetivos fundamentales

- **Domain agnostic:** no introduzcas conceptos propios de workflows, IA, ETL u otros sectores en el core. Esos conceptos pertenecen a extensiones o aplicaciones consumidoras.
- **Execution agnostic:** Nodera describe y edita; nunca ejecuta nodos, herramientas o grafos.
- **Framework-agnostic core:** el dominio y la aplicación no dependen de React, React Flow, Vue, Angular ni del DOM.
- **Portable documents:** JSON es la representación estructurada canónica; YAML es un formato alternativo de serialización del mismo contrato.
- **Extensible by design:** las extensiones se incorporan mediante contratos públicos y APIs de registro.
- **Composable UI:** el host controla la composición, el layout y los componentes visuales.
- **Versioned contracts:** documentos, definiciones, plugins y APIs públicas deben poder evolucionar de forma explícita.

## 2. Prioridad de las decisiones

Al implementar una tarea, aplica este orden:

1. Requisitos explícitos del usuario y criterios de aceptación de la tarea.
2. Contratos públicos y especificaciones versionadas del proyecto.
3. Decisiones arquitectónicas documentadas (ADRs y documentación vigente).
4. Patrones y convenciones ya establecidos en el repositorio.
5. Estas instrucciones generales.

No inventes APIs, paquetes, comandos o estructuras que no existan. Antes de asumir que una pieza está implementada, inspecciona el repositorio. Si la arquitectura propuesta y el estado real del código difieren, conserva el comportamiento existente salvo que la tarea requiera cambiarlo; documenta las decisiones relevantes.

No conviertas ejemplos conceptuales de documentación en contratos definitivos sin comprobar su estado y propósito.

## 3. Stack y herramientas

Stack de referencia:

- TypeScript con `strict` habilitado.
- React como primer adaptador de UI.
- `@xyflow/react` (React Flow) como primer adaptador de canvas.
- pnpm para gestión del monorepo.
- Turborepo para orquestación, si el repositorio lo ha adoptado.
- JSON Schema Draft 2020-12 como referencia para validación de estructuras configurables.
- JSON y YAML para importación/exportación de documentos.

### Reglas sobre herramientas

- Respeta las versiones y el package manager declarados en los archivos existentes (`package.json`, lockfile, configuración y CI).
- No actualices dependencias por iniciativa propia ni introduzcas una librería para resolver algo que pueda resolverse con las abstracciones existentes, salvo que exista una justificación técnica clara.
- No añadas dependencias de React o React Flow a paquetes de dominio o aplicación.
- No añadas Vue o Angular hasta que exista una tarea explícita para desarrollar esos adaptadores.
- No cambies de package manager ni regeneres lockfiles con otra herramienta.
- Utiliza los scripts declarados en los `package.json`; no presupongas nombres de comandos. Si no conoces los comandos, inspecciona primero los scripts.

## 4. Arquitectura obligatoria

Aplica arquitectura hexagonal (Ports & Adapters), DDD y principios SOLID de forma pragmática. No añadas capas, interfaces o patrones sin una necesidad real.

### 4.1 Dirección de dependencias

La dirección conceptual debe ser:

```text
Presentation / Framework Adapters
              |
              v
        Application Layer
              |
              v
          Domain Layer

Infrastructure Adapters ---> Ports definidos hacia el interior
Plugins -------------------> Public Extension API / Contracts
Host Application ----------> Public SDK
```

Reglas:

- El dominio no importa aplicación, infraestructura ni presentación.
- La aplicación depende del dominio y de puertos; no de adaptadores concretos.
- La infraestructura implementa puertos definidos por las capas interiores.
- React Flow solo puede aparecer en el adaptador de canvas React Flow y en sus pruebas/documentación específicas.
- Los paquetes públicos de SDK exponen contratos estables; no deben filtrar clases internas ni detalles de implementación.
- Evita dependencias circulares entre paquetes.
- No utilices imports profundos que atraviesen la API pública de otro paquete, salvo que el workspace defina expresamente esa convención.

### 4.2 Domain layer

Contiene el modelo y las invariantes universales del grafo, por ejemplo:

- Graph, Node, Edge y Port.
- Identificadores y value objects.
- Definiciones declarativas del grafo y sus elementos cuando correspondan al dominio.
- Reglas de integridad y políticas de conexión.
- Errores e invariantes del dominio.

El dominio no debe conocer:

- Componentes, hooks o contextos React.
- Objetos `Node`, `Edge`, `Handle` o estados de React Flow.
- Elementos DOM, CSS o eventos de navegador.
- Almacenamiento concreto, HTTP o bases de datos.
- Funciones de renderizado, iconos o componentes de UI.
- Código o protocolos de ejecución de nodos y tools.

### 4.3 Application layer

Implementa casos de uso y coordina las reglas del dominio. Ejemplos:

- Crear, cargar y modificar grafos.
- Añadir, eliminar, duplicar y mover nodos.
- Crear, eliminar y reconectar edges.
- Actualizar propiedades y metadatos.
- Validar grafos y conexiones.
- Importar, exportar y migrar documentos.
- Gestionar operaciones de historial.
- Publicar eventos de aplicación cuando sea necesario.

Los casos de uso no deben recibir objetos de React Flow ni depender de callbacks del framework.

### 4.4 Infrastructure layer

Implementa adaptadores para capacidades externas, por ejemplo:

- Serialización JSON/YAML.
- Persistencia local o remota opcional.
- Lectura y escritura de documentos.
- Adaptadores de almacenamiento.
- Carga e integración controlada de plugins.

No impongas un backend ni un proveedor de almacenamiento al consumidor del SDK.

### 4.5 Presentation layer

Contiene canvas, componentes React, paneles, paletas, inspectores, temas, layouts y renderizadores. Traduce interacciones de UI a comandos/casos de uso y representa el estado recibido desde la aplicación.

La presentación no debe convertirse en la fuente de verdad del modelo del grafo.

## 5. Modelo de grafo y separación de conceptos

Mantén separados estos conceptos:

- **Definition:** describe un tipo reutilizable de nodo, edge, puerto, propiedad o extensión.
- **Instance:** representa un elemento concreto dentro de un grafo.
- **Document:** representación portable y versionada del grafo.
- **Editor state:** selección, paneles, menús, modo de interacción e historial de edición.
- **Canvas state:** viewport, zoom, pan y otros datos propios de la representación.
- **Renderer:** implementación visual específica de un framework.
- **Execution/runtime:** sistema externo que interpreta o ejecuta el documento; está fuera del alcance de Nodera.

No mezcles definiciones con instancias. No almacenes componentes ni funciones dentro de definiciones serializables.

### 5.1 Nodos, puertos y conexiones

- No presupongas que todos los nodos tienen exactamente un input y un output.
- Los puertos deben poder identificarse de forma estable y declarar dirección, tipo/semántica y restricciones de conexión.
- Las reglas de conexión deben poder validarse sin depender de la UI.
- Un edge debe referenciar nodos y, cuando corresponda, puertos mediante identificadores del modelo portable.
- No utilices índices de arrays como identificadores persistentes.
- No presupongas que todos los grafos son acíclicos, dirigidos de una única manera o ejecutables. Esas restricciones deben declararse por configuración o extensión cuando proceda.

### 5.2 Propiedades

- Define las propiedades mediante esquemas declarativos y tipos TypeScript.
- Separa el esquema de datos de su representación visual.
- Los renderizadores de propiedades deben poder sustituirse o registrarse por extensión.
- Las reglas de visibilidad, dependencias y validación deben ser explícitas y comprobables.
- No introduzcas funciones, componentes React ni referencias al DOM en los datos serializables.
- Trata los valores externos como `unknown` hasta validarlos; evita propagar `any`.

### 5.3 Estado

Mantén separados:

- Estado del dominio/documento.
- Estado de edición/aplicación.
- Estado del canvas.
- Estado visual de la UI.

No exportes selección, menús abiertos, instancias de componentes ni estado interno de React Flow dentro del documento portable. La posición de los nodos puede formar parte del documento si el contrato lo establece; viewport y preferencias de presentación deben permanecer separados o estar identificados explícitamente como metadatos de presentación.

## 6. Documento portable y serialización

El documento portable (propuesta de formato: **Generic Graph Document / GGD**) es un contrato público, no un volcado del estado del canvas.

Reglas:

- JSON define la estructura de datos canónica. YAML debe serializar exactamente el mismo modelo lógico.
- Incluye identificadores estables y versiones explícitas donde sean necesarias.
- Distingue versión del formato, versión de definiciones de nodos y versión de plugins/extensiones.
- No serialices funciones, clases, símbolos, referencias DOM, componentes, hooks ni objetos específicos del framework.
- No serialices el estado interno de React Flow.
- Valida los documentos en los límites de entrada antes de tratarlos como datos de dominio.
- Mantén separadas la validación estructural del documento y las reglas semánticas del grafo.
- Diseña migraciones explícitas entre versiones; no reescribas silenciosamente documentos antiguos.
- Conserva, cuando sea viable, campos y extensiones desconocidos para permitir round-tripping sin pérdida.
- No descartes silenciosamente información desconocida o incompatible: devuelve diagnósticos claros y preserva los datos cuando el contrato lo permita.
- Evita incluir secretos, credenciales o datos de ejecución en el documento.
- No confundas la presencia de una referencia a un nodo/tool con autorización para ejecutarlo.

Cuando cambies el contrato del documento, actualiza conjuntamente sus tipos, esquemas, ejemplos, validadores, serializadores, migraciones y pruebas de compatibilidad.

## 7. React Flow y adaptadores visuales

React Flow es el motor inicial de canvas, no el modelo de dominio.

- Implementa conversiones explícitas entre el modelo portable/de aplicación y el modelo de React Flow.
- Mantén esas conversiones en el adaptador correspondiente.
- Convierte eventos e interacciones visuales en comandos/casos de uso.
- No permitas que `ReactFlowInstance`, hooks o tipos de `@xyflow/react` atraviesen hacia Domain o Application.
- No exportes directamente objetos de React Flow como documentos GGD.
- Evita duplicar lógica de negocio en callbacks de nodos, edges o componentes.
- Respeta las prácticas de rendimiento de React y React Flow: referencias estables cuando sean relevantes, actualizaciones acotadas y renderizadores que no se reconstruyan innecesariamente.
- Los nodos y edges personalizados deben registrarse mediante el adaptador de presentación, no en el dominio.

El layout de la aplicación debe quedar fuera del canvas. El host decide la ubicación y composición de paleta, inspector, toolbar, paneles y canvas. Los componentes incluidos por el framework deben ser componibles y no imponer una estructura global obligatoria.

No afirmes que Vue o Angular son compatibles con React Flow. Cualquier otro framework necesitará su propio adaptador y un motor de representación adecuado.

## 8. SDK y API pública

El SDK es la puerta de entrada de los consumidores. Debe ser pequeño, coherente, tipado y estable.

- Expón operaciones y contratos necesarios, no detalles internos.
- Prefiere funciones y tipos explícitos a accesos globales o singletons ocultos.
- Define claramente el ciclo de vida de la instancia del builder y de sus registros.
- Proporciona errores y resultados comprensibles para el consumidor.
- Evita cambios incompatibles sin una estrategia de versionado y migración.
- Mantén las APIs de dominio/framework-neutral separadas de las APIs específicas de React.
- No hagas que el consumidor tenga que importar React Flow para utilizar el core o el SDK agnóstico.
- Documenta ejemplos públicos con imports reales y verificables.

No des por definitivas firmas de API que solo aparezcan en ejemplos conceptuales. Antes de implementarlas, verifica el diseño existente y completa los tipos necesarios.

## 9. Plugins y extensibilidad

Los plugins pueden contribuir con nodos, edges, renderizadores, propiedades, paneles, herramientas declarativas, validadores, temas, layouts, importadores y exportadores.

### Reglas de plugins

- Toda contribución debe registrarse mediante APIs públicas explícitas.
- Usa identificadores globalmente cualificados y estables, por ejemplo `vendor.feature-name`.
- Detecta duplicados y conflictos; no sobrescribas registros silenciosamente.
- Declara versión del plugin, compatibilidad con SDK y dependencias.
- Define el ciclo de vida de instalación, activación, desactivación y retirada.
- Evita que un plugin modifique directamente estructuras internas o el estado privado del core.
- Aísla las contribuciones específicas de framework en el paquete/adaptador correspondiente.
- Distingue las herramientas que el builder representa/configura de las acciones internas del editor.
- Nodera nunca ejecuta tools aportadas por plugins.

### Seguridad de plugins

Un plugin que contiene código es código ejecutable de terceros. No lo trates como datos confiables por el mero hecho de tener un manifiesto.

- No uses `eval`, `new Function` ni ejecución arbitraria de expresiones procedentes de documentos.
- No permitas que importar un JSON/YAML ejecute código o active automáticamente plugins.
- La aplicación host debe decidir qué plugins instala y carga.
- Valida los datos de entrada y limita las capacidades expuestas a extensiones.
- No prometas aislamiento de seguridad si el plugin se ejecuta dentro del mismo contexto JavaScript.

## 10. SOLID y calidad del diseño

Aplica estos principios de manera verificable:

- **SRP:** cada módulo y clase debe tener una responsabilidad coherente.
- **OCP:** las capacidades se amplían mediante contratos y registros, evitando modificar el core para cada nuevo tipo de nodo.
- **LSP:** las implementaciones de puertos y extensiones deben respetar el contrato y sus invariantes.
- **ISP:** define interfaces pequeñas y específicas; no obligues a los adaptadores a implementar capacidades que no soportan.
- **DIP:** los casos de uso dependen de abstracciones, no de implementaciones concretas.

Evita:

- Clases o servicios gigantes con múltiples responsabilidades.
- Interfaces creadas sin consumidor o necesidad concreta.
- Abstracciones genéricas prematuras.
- Herencia profunda cuando composición resuelva el problema.
- `any` como atajo para eludir el sistema de tipos.
- Estado global mutable sin un ciclo de vida definido.
- Dependencias circulares.
- Duplicación de reglas de dominio entre UI y core.

## 11. TypeScript y convenciones de código

- Mantén `strict` y las opciones de TypeScript configuradas en el repositorio.
- Prefiere `unknown` a `any` en límites externos y valida antes de usar.
- Modela estados y variantes mediante unions discriminadas cuando aporte claridad.
- Usa tipos de dominio para identificadores y conceptos importantes cuando eviten intercambios accidentales.
- Define tipos de entrada y salida de casos de uso explícitamente.
- Evita casts (`as`) innecesarios; no los uses para ocultar errores de diseño.
- No añadas `!` (non-null assertion) sin una invariancia comprobable.
- Mantén nombres de código, identificadores, APIs y comentarios técnicos en inglés, salvo que el repositorio ya establezca otra convención.
- Usa nombres descriptivos; evita abreviaturas ambiguas.
- Mantén funciones pequeñas y con efectos secundarios explícitos.
- No introduzcas lógica de negocio en componentes de presentación.
- Mantén el formato y lint del repositorio; no reformatees archivos ajenos a la tarea sin motivo.

## 12. Eventos, comandos e historial

- Las interacciones de UI deben traducirse a comandos o casos de uso.
- Los eventos deben describir hechos ocurridos, no sustituir llamadas imperativas necesarias para completar una operación.
- Usa nombres de eventos estables y payloads tipados.
- Evita emitir eventos duplicados para una única operación lógica.
- Define claramente cuándo una operación modifica el documento y cuándo solo cambia el estado visual.
- Implementa undo/redo mediante operaciones reversibles o un mecanismo equivalente bien probado.
- Al eliminar nodos, contempla las conexiones y demás elementos dependientes para que la operación pueda revertirse correctamente.
- Agrupa cambios relacionados cuando deban deshacerse como una única acción del usuario.

## 13. Validación y gestión de errores

Distingue al menos:

1. Errores de parseo/serialización.
2. Errores estructurales del documento.
3. Violaciones de invariantes del dominio.
4. Errores de configuración de nodos y propiedades.
5. Errores de compatibilidad de extensiones/plugins.
6. Errores de adaptadores o infraestructura.

Reglas:

- Devuelve diagnósticos estructurados con código, severidad y contexto cuando corresponda.
- No dependas de mensajes de error destinados a la UI para tomar decisiones de dominio.
- No silencies excepciones ni conviertas fallos en valores aparentemente válidos.
- No confundas un grafo estructuralmente válido con uno correctamente configurado para el dominio consumidor.
- JSON Schema valida estructuras; las invariantes y reglas semánticas pertenecen también al dominio o a validadores explícitos.

## 14. Testing

Toda funcionalidad nueva debe incluir pruebas proporcionadas al riesgo y al nivel de la capa.

- **Domain:** pruebas unitarias sin React ni navegador.
- **Application:** pruebas de casos de uso con puertos falsos o mocks controlados.
- **Contracts:** pruebas de tipos, esquemas y compatibilidad.
- **Serialization:** round-trip JSON/YAML, documentos inválidos, versiones y extensiones desconocidas.
- **Plugins:** registro, duplicados, dependencias, ciclo de vida y errores.
- **Adapters:** conversión del modelo y traducción de eventos.
- **UI:** comportamiento de interacción y renderizadores.
- **E2E:** flujos críticos de edición/importación/exportación.

Para cambios de documento o serialización, comprueba como mínimo:

- `deserialize(serialize(document))` conserva el significado del documento.
- El resultado no contiene funciones ni objetos específicos del framework.
- Los datos desconocidos se preservan según el contrato.
- Las versiones incompatibles producen diagnósticos explícitos.

No escribas pruebas que solo repitan la implementación. Comprueba comportamiento observable e invariantes.

## 15. Accesibilidad, internacionalización y rendimiento

- Los controles interactivos deben ser utilizables por teclado.
- Proporciona nombres accesibles y atributos ARIA adecuados.
- No dependas exclusivamente del color para comunicar estados.
- Mantén los textos de UI preparados para traducción; evita incrustar textos de usuario en lógica de dominio.
- Evita renders y cálculos globales innecesarios en grafos grandes.
- Usa memoización cuando resuelva un problema medible o claro, no de forma indiscriminada.
- Mantén las operaciones costosas fuera del render de React.
- Considera grafos grandes al diseñar algoritmos de búsqueda, validación, selección y actualización.

## 16. Seguridad y tratamiento de datos

- Trata todo documento importado, configuración externa y dato de plugin como entrada no confiable.
- Valida en los límites del sistema.
- No almacenes secretos, tokens ni credenciales en documentos del grafo.
- No ejecutes código ni expresiones provenientes de documentos.
- Evita inyección en HTML, CSS, URLs y componentes personalizados.
- No introduzcas telemetría ni llamadas de red implícitas en el core.
- La persistencia y las integraciones externas deben ser opt-in y configuradas por la aplicación host.

## 17. Documentación y decisiones arquitectónicas

Actualiza documentación cuando cambies:

- APIs públicas.
- Contratos del documento GGD.
- Definiciones de nodos, edges o propiedades.
- Sistema de plugins.
- Ciclo de vida del builder.
- Dependencias entre paquetes.
- Comportamiento de importación/exportación.

Para decisiones que afecten a límites de paquetes, contratos públicos, compatibilidad o dependencias importantes, crea o actualiza un ADR (Architecture Decision Record) si el repositorio dispone de ese mecanismo. Un ADR debe incluir contexto, decisión, alternativas relevantes y consecuencias.

Los ejemplos deben compilar o estar claramente marcados como pseudocódigo. No presentes una API ilustrativa como si ya estuviera implementada.

## 18. Flujo de trabajo obligatorio del agente

Antes de modificar código:

1. Lee este archivo y cualquier `AGENTS.md` aplicable al directorio de trabajo.
2. Inspecciona el árbol del repositorio y los `package.json` relevantes.
3. Localiza los contratos, módulos y pruebas relacionados con la tarea.
4. Comprueba si ya existe una abstracción o patrón que resuelva parte del problema.
5. Identifica las capas y paquetes que pueden verse afectados.

Durante la implementación:

1. Realiza el cambio más pequeño que resuelva correctamente el requisito.
2. Mantén las dependencias dentro de los límites arquitectónicos.
3. Actualiza tipos, documentación y pruebas relacionadas.
4. No añadas funcionalidades no solicitadas que amplíen innecesariamente el alcance.
5. No cambies contratos públicos de forma incompatible sin justificarlo y documentar la migración.

Antes de finalizar:

1. Ejecuta los tests relevantes.
2. Ejecuta typecheck, lint y build para los paquetes afectados cuando existan scripts para ello.
3. Revisa `git diff` para detectar cambios accidentales, archivos generados o secretos.
4. Comprueba que no se han introducido dependencias prohibidas entre capas.
5. Informa con precisión de lo implementado, las comprobaciones ejecutadas y cualquier limitación pendiente.

Si un comando falla por un problema preexistente o del entorno, distingue ese fallo de los errores introducidos por el cambio. No afirmes que los tests pasan si no los has ejecutado correctamente.

No crees commits, publiques paquetes, despliegues ni modifiques servicios externos salvo que el usuario lo solicite expresamente.

## 19. Definition of Done

Una tarea se considera terminada cuando:

- Cumple el requisito y sus criterios de aceptación.
- Respeta los límites entre dominio, aplicación, infraestructura y presentación.
- No introduce dependencias de React/React Flow en el core agnóstico.
- Mantiene separados documento portable, estado de edición y estado visual.
- Incluye pruebas adecuadas.
- Pasa las comprobaciones aplicables o documenta exactamente por qué no se han podido ejecutar.
- Actualiza la documentación afectada.
- No contiene código muerto, casts injustificados, secretos ni cambios accidentales.
- Expone cualquier limitación o decisión pendiente sin ocultarla.

## 20. Regla final

Ante una duda arquitectónica, prioriza en este orden:

1. Portabilidad del documento.
2. Independencia del dominio respecto a frameworks y ejecución.
3. Estabilidad de los contratos públicos.
4. Extensibilidad mediante APIs explícitas.
5. Composición y personalización de la UI.
6. Simplicidad de implementación y mantenimiento.

**El core de Nodera modela y valida grafos; la aplicación coordina casos de uso; los adaptadores representan y persisten; los plugins amplían; el sistema externo ejecuta. No mezcles esas responsabilidades.**

