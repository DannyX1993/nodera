# Arquitectura general

## Arquitectura de alto nivel

La arquitectura se divide en cinco grandes bloques:

1. Domain Core.
2. Application Core.
3. Infrastructure Adapters.
4. Presentation Layer.
5. Extension Ecosystem.

El core debe ser independiente de los adaptadores y de las tecnologías de presentación.

### Diagrama conceptual

```text
                   HOST APPLICATION
                          |
             +------------+------------+
             |                         |
          SDK API                 UI COMPOSITION
             |                         |
             +------------+------------+
                          |
                 APPLICATION CORE
                          |
          +---------------+---------------+
          |               |               |
       Commands        Queries          Events
          |               |               |
          +---------------+---------------+
                          |
                     DOMAIN CORE
                          |
         +----------------+----------------+
         |                |                |
       Graph           Registry         Validation
       Model           Model             Model
         |                |                |
         +----------------+----------------+
                          |
                   PORTS / INTERFACES
                          |
          +---------------+----------------+
          |               |                |
      React Flow       Persistence       Plugins
      Adapter          Adapter           Adapter
          |
       Canvas UI

      External application
          |
     JSON / YAML
          |
    External runtime
```

El dominio no conoce los adaptadores. Los adaptadores implementan los contratos definidos por el core.

## Separación de capas

### Domain Layer

Contiene las reglas de negocio universales del editor:

- Graph.
- Node.
- Edge.
- Port.
- Connection.
- NodeDefinition.
- PropertyDefinition.
- GraphMetadata.
- ValidationRule.
- ExtensionDefinition.

No debe importar librerías de interfaz, almacenamiento ni frameworks.

### Application Layer

Coordina las operaciones del usuario:

- Crear nodos.
- Eliminar nodos.
- Conectar nodos.
- Desconectar nodos.
- Modificar propiedades.
- Mover nodos.
- Agrupar elementos.
- Validar grafos.
- Importar documentos.
- Exportar documentos.
- Registrar extensiones.
- Gestionar el historial de cambios.

Implementará casos de uso y coordinará los servicios de dominio.

### Infrastructure Layer

Implementa las interfaces externas:

- Serialización JSON.
- Serialización YAML.
- Persistencia.
- Importación y exportación.
- Sistema de plugins.
- Almacenamiento local.
- Integración con APIs externas.
- Adaptadores de frameworks.

### Presentation Layer

Gestiona exclusivamente la representación visual:

- Canvas.
- Nodos.
- Edges.
- Paneles.
- Toolbar.
- Context menus.
- Inspector.
- Node palette.
- Layout.
- Temas.
- Interacciones visuales.

### Extension Layer

Permite incorporar funcionalidades externas:

- Nuevos tipos de nodos.
- Nuevos tipos de edges.
- Nuevos campos de propiedades.
- Nuevos renderizadores.
- Nuevos paneles.
- Nuevas herramientas de edición.
- Nuevos validadores.
- Nuevos importadores y exportadores.

## Estado de implementación (Fases 5-8)

El diagrama anterior es conceptual y sigue vigente: las fases añaden piezas
concretas dentro de esos bloques, no bloques nuevos ni flechas nuevas. El
detalle por fase está en `docs/ROADMAP.md` y `docs/PROJECT-STRUCTURE.md` §7.2-7.5.

- **Fase 5 — UI Composition** (Presentation): `@nodera/ui-core` (contratos de
  paneles, tools, atajos, i18n y estado de UI, sin React), `@nodera/ui-react`
  (componentes y providers), `@nodera/theme-engine` (design tokens y su
  proyección a variables CSS) y `@nodera/layout-engine` (layouts del shell,
  geometría y preferencias). Ninguno es dominio.
- **Fase 6 — SDK** (Ports / API pública): `@nodera/sdk` es la superficie de
  composición framework-agnóstica (builder, APIs de documento, grafo, tema,
  layout, plugin y eventos) y declara el puerto `BuilderAdapter`.
  `@nodera/react-flow` es el adaptador de canvas —el único paquete que importa
  `@xyflow/react`— y aloja también el binding del SDK. `@nodera/graph-layout`
  aporta la colocación de nodos como estrategia propia: geometría pura, sin
  React ni motor, consumida desde el SDK. Los **waypoints** de un edge son datos
  del documento (`@nodera/document`, `Edge.waypoints`), se editan con
  `updateEdgeWaypoints` en `@nodera/application` y la presentación solo los
  dibuja: no son estado del canvas.
- **Fase 7 — Plugin Ecosystem** (Extension): `@nodera/plugin-api` publica los
  contratos puros (manifest, contribuciones, ciclo de vida, diagnósticos) y
  `@nodera/plugin-manager` la infraestructura del host (descubrimiento,
  resolución de dependencias, conflictos y lifecycle) sobre el SDK. Un plugin se
  escribe solo contra la superficie pública.
- **Fase 8 — Production Readiness** (alcance de la rama actual): endurecimiento
  y distribución, no rediseño — pipeline de build/publicación por paquete,
  `SDK_VERSION`, accesibilidad, i18n, performance, ESLint + tests, documentación
  y CI/changesets. La dirección de dependencias del diagrama no cambia.
