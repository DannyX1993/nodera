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

