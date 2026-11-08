# Arquitectura y definición funcional

# Generic Visual Graph Builder

**Documento de arquitectura de software y definición de módulos**

Versión: 1.0\
Stack principal: TypeScript\
Motor gráfico inicial: React Flow (`@xyflow/react`)\
Arquitectura: Hexagonal (Ports & Adapters), Domain-Driven Design y SOLID\
Modelo de distribución: Core + SDK + UI Framework Adapters + Plugins\
Objetivo: Editor visual de grafos completamente agnóstico respecto al dominio y al motor de ejecución.

---

# 1. Visión del producto

## 1.1. Objetivo

Construir un framework visual de edición de grafos que permita a cualquier aplicación integrar un builder configurable y extensible sin tener que implementar desde cero la lógica de edición, representación, gestión y persistencia de grafos.

El producto no debe conocer qué representa el grafo ni qué significa ejecutar sus elementos.

Podrá utilizarse para construir, entre otros:

- Workflows y automatizaciones.
- Agentes de inteligencia artificial.
- Pipelines de procesamiento de datos.
- Arquitecturas de software.
- Sistemas de integración.
- Procesos empresariales.
- Diagramas técnicos.
- Sistemas de decisión.
- Flujos de conversación.
- Procesos ETL.
- Orquestadores de herramientas.

El mismo builder deberá poder adaptarse a todos estos contextos mediante configuración, SDK y plugins.

## 1.2. Principios fundamentales

1. **Domain agnostic:** el core no contiene conceptos específicos de un sector o aplicación.
2. **Execution agnostic:** el builder nunca ejecuta nodos, herramientas ni workflows.
3. **Framework agnostic core:** el dominio no depende de React ni de ningún framework visual.
4. **Extensible by design:** nodos, edges, propiedades, paneles, herramientas y layouts pueden extenderse.
5. **Schema driven:** las definiciones de nodos y propiedades se describen mediante contratos tipados y esquemas.
6. **Portable graph:** el resultado es un documento independiente del editor.
7. **Composable UI:** cada aplicación decide cómo organizar y representar la interfaz.
8. **Plugin architecture:** las funcionalidades se distribuyen como extensiones independientes.
9. **Versionable:** los documentos, plugins y contratos deben soportar versiones.
10. **SOLID:** responsabilidades separadas y dependencias dirigidas hacia abstracciones.

## 1.3. Límites de responsabilidad

El producto tiene tres responsabilidades principales:

- Permitir crear y modificar grafos.
- Proporcionar una interfaz visual para representar esos grafos.
- Producir documentos estructurados que otros sistemas puedan consumir.

Queda explícitamente fuera de alcance:

- Ejecutar workflows.
- Ejecutar tools.
- Resolver dependencias externas.
- Gestionar credenciales de ejecución.
- Administrar colas de trabajo.
- Orquestar procesos.
- Gestionar estados de ejecución.
- Implementar motores de IA.

Podrá representar metadatos de ejecución si una aplicación lo necesita, pero nunca será responsable de ejecutarlos.

---

# 2. Arquitectura general

## 2.1. Arquitectura de alto nivel

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

## 2.2. Separación de capas

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

---

# 3. Definición de módulos

Esta es la propuesta de módulos funcionales y técnicos del producto.

# 3.1. Graph Domain Module

**Responsabilidad:** representar el modelo conceptual del grafo.

Es el núcleo del dominio y no debe conocer ningún detalle de representación visual.

Componentes:

- Graph Entity.
- Node Entity.
- Edge Entity.
- Port Entity.
- Connection Value Object.
- GraphId.
- NodeId.
- EdgeId.
- PortId.
- GraphMetadata.
- GraphSettings.

Responsabilidades:

- Mantener la identidad de los elementos.
- Gestionar nodos y conexiones.
- Garantizar la integridad estructural.
- Mantener las relaciones entre elementos.
- Controlar las reglas universales del grafo.

El grafo no debe asumir que todos los nodos tienen inputs y outputs del mismo tipo. Los puertos deben admitir diferentes semánticas y contratos de datos.

# 3.2. Node Definition Module

**Responsabilidad:** definir qué tipos de nodos puede utilizar una aplicación.

Es uno de los módulos más importantes del producto.

Cada nodo debe estar definido mediante un contrato declarativo que permita al builder conocer:

- Identificador único.
- Nombre.
- Descripción.
- Categoría.
- Icono.
- Versión.
- Renderizador.
- Puertos.
- Propiedades.
- Reglas de conexión.
- Configuración visual.
- Reglas de validación.
- Metadatos adicionales.

Una definición de nodo debe ser independiente de su instancia.

Por ejemplo:

- `http.request`: definición de un nodo.
- `node-123`: instancia concreta de ese nodo en un grafo.

Debe existir un Node Registry que permita registrar, consultar, actualizar y eliminar definiciones.

# 3.3. Edge Definition Module

**Responsabilidad:** permitir personalizar completamente las conexiones.

No se debe limitar a las conexiones visuales predeterminadas.

Debe soportar:

- Diferentes estilos de líneas.
- Diferentes geometrías.
- Flechas.
- Etiquetas.
- Indicadores de estado visual.
- Colores.
- Animaciones.
- Acciones contextuales.
- Conexiones condicionales.
- Metadatos.
- Tipos de conexión.

También debe existir un Edge Registry.

La definición de una conexión visual debe estar separada de la semántica de la relación almacenada en el documento.

# 3.4. Port & Connection Module

**Responsabilidad:** definir los puntos de entrada y salida de los nodos y las reglas que determinan qué conexiones son posibles.

Un puerto debe poder declarar:

- Identificador.
- Nombre.
- Dirección.
- Tipo de dato.
- Multiplicidad.
- Cardinalidad.
- Reglas de conexión.
- Representación visual.
- Metadatos.

El módulo debe permitir implementar reglas como:

- Un puerto acepta únicamente conexiones de tipo `string`.
- Un puerto admite múltiples conexiones.
- Un puerto solo admite una conexión.
- Un puerto acepta conexiones de determinados tipos de nodos.
- Una conexión necesita cumplir una condición personalizada.

La validación debe producir resultados independientes de la representación visual.

# 3.5. Property Definition Module

**Responsabilidad:** definir cómo se configuran los nodos y sus propiedades.

No debe existir un inspector rígido asociado a un tipo de nodo.

Se necesita un sistema declarativo de propiedades.

Tipos iniciales:

- String.
- Number.
- Boolean.
- Select.
- Multi-select.
- Textarea.
- Code editor.
- JSON editor.
- YAML editor.
- Date.
- DateTime.
- Color.
- File reference.
- Object.
- Array.
- Custom component.

Cada propiedad debe permitir configurar:

- Identificador.
- Etiqueta.
- Descripción.
- Tipo.
- Valor por defecto.
- Obligatoria.
- Editable.
- Visible.
- Orden.
- Validaciones.
- Opciones.
- Dependencias.
- Condiciones de visibilidad.
- Componente personalizado.
- Agrupación.

Debe soportar propiedades dinámicas: mostrar, ocultar o modificar campos en función de los valores de otros campos.

Recomendación: utilizar JSON Schema Draft 2020-12 como estándar de referencia para la definición y validación de estructuras de datos, añadiendo un metamodelo de UI propio para los aspectos de presentación que JSON Schema no cubre por sí solo.

# 3.6. Registry Module

**Responsabilidad:** centralizar el descubrimiento y registro de extensiones.

Debe haber registros independientes:

- NodeRegistry.
- EdgeRegistry.
- PropertyRendererRegistry.
- NodeRendererRegistry.
- PanelRegistry.
- ToolRegistry.
- ValidatorRegistry.
- PluginRegistry.
- ThemeRegistry.
- LayoutRegistry.
- ImporterRegistry.
- ExporterRegistry.

El registro debe permitir:

- Registrar extensiones.
- Consultarlas por identificador.
- Consultarlas por categoría.
- Resolver versiones.
- Detectar identificadores duplicados.
- Resolver dependencias.
- Desregistrar extensiones.
- Gestionar conflictos.

Los registros deben ser accesibles mediante contratos del dominio o de aplicación, sin depender de la interfaz visual.

# 3.7. Validation Module

**Responsabilidad:** validar grafos y configuraciones.

Debe separar diferentes niveles de validación:

**Structural validation**

- Identificadores duplicados.
- Nodos inexistentes.
- Conexiones inválidas.
- Puertos inexistentes.
- Referencias inconsistentes.

**Domain validation**

- Restricciones entre tipos de nodos.
- Cardinalidad de conexiones.
- Reglas específicas de cada definición.
- Propiedades obligatorias.

**Document validation**

- Estructura del documento.
- Versiones.
- Campos requeridos.
- Compatibilidad del esquema.

**Extension validation**

- Dependencias de plugins.
- Compatibilidad entre versiones.
- Definiciones incompletas.

El resultado será una colección de incidencias normalizadas:

- Code.
- Severity.
- Message.
- ElementId.
- PropertyPath.
- Metadata.

Los validadores personalizados podrán registrarse mediante plugins.

Importante: un grafo puede ser estructuralmente válido y, sin embargo, tener errores de configuración. No debemos confundir ambos estados.

# 3.8. Application Use Cases Module

**Responsabilidad:** implementar todas las acciones del builder.

Cada acción debe ser un caso de uso independiente.

Operaciones iniciales:

**Graph**

- CreateGraph.
- LoadGraph.
- ClearGraph.
- DeleteGraph.
- UpdateGraphMetadata.

**Nodes**

- AddNode.
- RemoveNode.
- DuplicateNode.
- MoveNode.
- UpdateNodeProperties.
- UpdateNodeMetadata.
- GroupNodes.
- UngroupNodes.

**Edges**

- CreateEdge.
- RemoveEdge.
- UpdateEdge.
- ReconnectEdge.

**Selection**

- SelectNode.
- SelectEdge.
- SelectMultiple.
- ClearSelection.

**Clipboard**

- CopySelection.
- CutSelection.
- PasteSelection.

**History**

- Undo.
- Redo.

**Validation**

- ValidateGraph.
- ValidateNode.
- ValidateConnection.

**Documents**

- ImportDocument.
- ExportDocument.
- MigrateDocument.

Estos casos de uso no deben depender de eventos específicos de React Flow.

# 3.9. History & Command Module

**Responsabilidad:** gestionar las modificaciones realizadas en el grafo.

Debe soportar:

- Undo.
- Redo.
- Agrupación de operaciones.
- Historial de cambios.
- Transacciones.
- Restauración de estados.

La arquitectura recomendada es Command Pattern con operaciones reversibles.

Ejemplo:

- AddNodeCommand.
- MoveNodeCommand.
- UpdatePropertyCommand.
- CreateEdgeCommand.
- DeleteNodeCommand.

Eliminar un nodo deberá contemplar la restauración de sus conexiones si se ejecuta un undo.

El historial será independiente de la persistencia y de cualquier mecanismo de ejecución.

# 3.10. Document & Serialization Module

**Responsabilidad:** convertir el grafo interno en un documento portátil.

Este módulo es fundamental para garantizar el agnosticismo.

Debe existir un contrato de documento independiente de React Flow.

Formatos iniciales:

- JSON.
- YAML.

Responsabilidades:

- Serialización.
- Deserialización.
- Validación.
- Versionado.
- Migraciones.
- Importación.
- Exportación.
- Normalización.
- Gestión de extensiones desconocidas.

El documento exportado no debe contener:

- Componentes React.
- Referencias a objetos JavaScript.
- Hooks.
- Estados internos de React Flow.
- Instancias de clases.
- Funciones.
- Referencias a DOM.
- Datos internos de renderizado.

Sí podrá contener:

- Identificadores.
- Tipos de nodos.
- Propiedades.
- Conexiones.
- Puertos.
- Posiciones.
- Agrupaciones.
- Metadatos.
- Versiones.
- Referencias a extensiones.

Debe distinguirse entre el modelo portable del grafo y el estado de visualización.

Por ejemplo, las posiciones de los nodos pueden formar parte del documento para permitir reconstruir el mismo layout, pero el zoom, el viewport y la selección podrían almacenarse en un documento de presentación separado.

# 3.11. Canvas Engine Module

**Responsabilidad:** representar gráficamente el grafo.

Será el adaptador inicial para React Flow.

Debe traducir:

- Domain Node → React Flow Node.
- Domain Edge → React Flow Edge.
- Domain Port → React Flow Handle.
- Domain Graph → React Flow State.

Y en sentido contrario, traducir las interacciones visuales a comandos de aplicación.

El dominio nunca debe recibir objetos propios de React Flow.

Este módulo gestionará:

- Renderizado.
- Drag and drop.
- Zoom.
- Pan.
- Selección.
- Conexiones.
- Posicionamiento.
- Eventos de interacción.
- Renderizado personalizado.
- Minimapa.
- Controles visuales.

React Flow permite utilizar nodos y edges personalizados y controlar el estado del canvas. Estas capacidades lo convierten en un buen adaptador inicial, pero no justifican acoplar el dominio a su modelo interno.

# 3.12. UI Composition Module

**Responsabilidad:** proporcionar componentes visuales que puedan organizarse libremente fuera del canvas.

Este módulo no debe imponer un layout.

Componentes disponibles:

- EditorShell.
- CanvasContainer.
- NodePalette.
- PropertiesPanel.
- InspectorPanel.
- Toolbar.
- ContextMenu.
- Header.
- Footer.
- Sidebar.
- Navigator.
- SearchPanel.
- MinimapPanel.
- ValidationPanel.
- HistoryPanel.
- MetadataPanel.

La aplicación host debe decidir cuáles utiliza, dónde los coloca y cómo se muestran.

Ejemplo de composición:

```text
+----------------------------------------------------------+
|                       APPLICATION HEADER                 |
+----------------------------------------------------------+
|          |                               |               |
|  NODE    |                               |  PROPERTIES   |
|  PALETTE |             CANVAS            |  INSPECTOR    |
|          |                               |               |
|          |                               |               |
+----------+-------------------------------+---------------+
|                     VALIDATION PANEL                     |
+----------------------------------------------------------+
```

Este es únicamente un layout de ejemplo.

El producto debe permitir layouts completamente diferentes.

# 3.13. UI Customization Module

**Responsabilidad:** permitir personalizar completamente la experiencia visual.

Debe incluir:

- Theme System.
- Design Tokens.
- CSS Variables.
- Typography.
- Spacing.
- Colors.
- Borders.
- Shadows.
- Icons.
- Node Styles.
- Edge Styles.
- Handle Styles.
- Selection Styles.
- Canvas Background.
- Panels.
- Menus.
- Toolbars.

Cada tipo de nodo podrá definir su propio componente visual.

Cada edge podrá definir su propio renderizador.

Cada aplicación podrá proporcionar sus propios componentes de interfaz.

La personalización no debe limitarse a cambiar colores mediante un tema: debe permitir sustituir por completo los renderizadores.

# 3.14. Tool & Action Definition Module

**Responsabilidad:** representar herramientas y acciones que una aplicación desea ofrecer al usuario.

Aquí conviene diferenciar dos conceptos:

- Tool como elemento que puede ser seleccionado o utilizado en un nodo.
- Tool como acción disponible en la interfaz del builder.

El módulo debe permitir registrar:

- Identificador.
- Nombre.
- Descripción.
- Categoría.
- Icono.
- Schema de configuración.
- Parámetros.
- Metadatos.
- Compatibilidad.
- Referencias externas.

El builder podrá mostrar herramientas y permitir su configuración, pero nunca ejecutarlas.

Por ejemplo, una aplicación podría registrar una herramienta `send-email` y utilizarla en un nodo. El builder solamente almacenaría su identificador y su configuración.

La ejecución corresponderá al sistema externo.

# 3.15. Plugin System Module

**Responsabilidad:** proporcionar un mecanismo estandarizado para extender el producto.

Un plugin podrá aportar uno o varios elementos:

- Nuevos nodos.
- Nuevos edges.
- Nuevos renderizadores.
- Nuevos tipos de propiedades.
- Nuevas herramientas.
- Nuevos paneles.
- Nuevos validadores.
- Nuevos temas.
- Nuevos importadores.
- Nuevos exportadores.
- Nuevas acciones de interfaz.

Cada plugin deberá declarar:

- Plugin ID.
- Name.
- Version.
- Description.
- Author.
- Dependencies.
- Compatibility.
- Contributions.
- Permissions, si aplica.

Debe existir un ciclo de vida:

1. Discover.
2. Resolve dependencies.
3. Validate manifest.
4. Register contributions.
5. Activate.
6. Deactivate.
7. Unregister.

**Seguridad:** los plugins ejecutables deben tratarse como código de terceros. No se debe permitir que un documento JSON/YAML active código arbitrario. La carga de plugins debe ser explícita y estar controlada por la aplicación host.

# 3.16. Layout Engine Module

**Responsabilidad:** gestionar las composiciones de la interfaz.

Debe soportar:

- Layouts predefinidos.
- Layouts personalizados.
- Paneles acoplables.
- Paneles redimensionables.
- Paneles ocultables.
- Paneles flotantes.
- Paneles externos al canvas.
- Persistencia de preferencias de layout.

Los layouts deben poder declararse desde la aplicación host.

El motor de layout no debe modificar el modelo de dominio del grafo.

# 3.17. State Management Module

**Responsabilidad:** gestionar el estado de la aplicación de edición.

Debe separar:

**Domain state**

- Nodos.
- Edges.
- Propiedades.
- Metadatos.

**Editor state**

- Selección.
- Modo de interacción.
- Historial.
- Estado de los paneles.
- Menús abiertos.

**Canvas state**

- Zoom.
- Pan.
- Viewport.
- Posición visual.

**UI state**

- Tema.
- Layout.
- Preferencias.
- Visibilidad de paneles.

El estado del editor no debe contaminar el documento portable.

# 3.18. Persistence Adapter Module

**Responsabilidad:** permitir que cada aplicación decida cómo almacenar sus grafos.

No se debe implementar un backend obligatorio.

Se deben proporcionar interfaces para:

- SaveGraph.
- LoadGraph.
- DeleteGraph.
- ListGraphs.
- Autosave.
- RevisionHistory.

Los adaptadores podrán implementar:

- LocalStorage.
- IndexedDB.
- REST API.
- GraphQL.
- Backend propio.
- Sistemas de almacenamiento externos.

La persistencia será opcional y estará fuera del dominio.

# 3.19. Import & Export Module

**Responsabilidad:** importar y exportar documentos.

Además de JSON y YAML, debe permitir añadir formatos futuros.

Debe soportar:

- Importación de grafos.
- Exportación de grafos.
- Importación parcial.
- Exportación parcial.
- Validación previa.
- Migraciones.
- Transformaciones.
- Detección de extensiones no disponibles.

Un documento que contenga tipos de nodos desconocidos no debe provocar la pérdida de datos. El editor debería poder conservarlos como elementos desconocidos, permitir su inspección básica y volver a exportarlos sin alterar su configuración.

# 3.20. SDK Public API Module

**Responsabilidad:** proporcionar una API pública estable y sencilla para los desarrolladores.

El SDK debe ocultar los detalles internos y permitir configurar el builder desde la aplicación host.

Debe proporcionar:

- BuilderFactory.
- BuilderConfiguration.
- NodeDefinition API.
- EdgeDefinition API.
- Property API.
- Plugin API.
- Theme API.
- Layout API.
- Document API.
- Registry API.
- Event API.

El SDK debe poder utilizarse sin necesidad de conocer el funcionamiento interno de los módulos.

# 3.21. Events & Integration Module

**Responsabilidad:** comunicar los cambios del builder a la aplicación host.

Eventos iniciales:

- graph.created
- graph.loaded
- graph.changed
- graph.saved
- graph.exported
- node.created
- node.deleted
- node.updated
- node.selected
- edge.created
- edge.deleted
- edge.updated
- property.changed
- validation.completed
- plugin.registered
- plugin.error

Los eventos deben ser agnósticos respecto al framework visual.

La aplicación host podrá suscribirse a ellos para sincronizar datos, actualizar su interfaz o iniciar procesos externos.

# 3.22. Accessibility & Internationalization Module

**Responsabilidad:** asegurar que el builder pueda adaptarse a distintos usuarios y mercados.

Debe incorporar:

- Navegación por teclado.
- Accesibilidad de nodos y edges.
- ARIA.
- Atajos configurables.
- Textos traducibles.
- Internacionalización.
- Formatos regionales.
- Soporte RTL.
- Etiquetas accesibles.

---

# 4. Definición del modelo de documento portable

## 4.1. Principio

El formato exportado debe representar el grafo, no la implementación del editor.

Se recomienda definir un formato canónico propio denominado, por ejemplo:

`Generic Graph Document (GGD)`

La estructura inicial podría ser:

```json
{
  "format": "ggd",
  "version": "1.0.0",
  "metadata": {
    "id": "graph-001",
    "name": "Example graph",
    "description": "Example document"
  },
  "extensions": [
    {
      "id": "example.nodes",
      "version": "1.0.0"
    }
  ],
  "graph": {
    "nodes": [
      {
        "id": "node-001",
        "type": "example.input",
        "version": "1.0.0",
        "position": {
          "x": 100,
          "y": 100
        },
        "properties": {
          "value": "Hello world"
        },
        "metadata": {}
      }
    ],
    "edges": [],
    "groups": []
  }
}
```

Este contrato es orientativo y deberá evolucionar mediante una especificación formal.

## 4.2. Separación entre definición e instancia

Hay que distinguir claramente:

**Node Definition**

Describe qué es un tipo de nodo y cómo debe configurarse.

**Node Instance**

Describe una instancia concreta dentro de un grafo.

La definición puede estar en un plugin y la instancia en el documento exportado.

El documento debe contener una referencia estable al tipo y su versión, pero no tiene por qué duplicar toda la definición.

## 4.3. Portabilidad

La portabilidad debe basarse en:

- Identificadores estables.
- Versiones explícitas.
- Estructuras JSON estándar.
- Ausencia de referencias a clases.
- Ausencia de referencias a componentes.
- Ausencia de dependencias de React.
- Esquemas públicos.
- Semántica documentada.

Importante: ser agnóstico no significa que cualquier sistema pueda interpretar automáticamente cualquier nodo. El consumidor necesitará conocer la definición de los tipos utilizados. Por eso deben publicarse también los contratos de nodos, extensiones y versiones.

---

# 5. Definición del SDK

El SDK debe ser la principal puerta de entrada para los desarrolladores.

## 5.1. API de registro de nodos

Ejemplo conceptual:

```typescript
builder.registerNode({
  type: "http.request",
  version: "1.0.0",
  label: "HTTP Request",
  description: "Makes an HTTP request",
  category: "network",
  icon: "globe",

  ports: {
    inputs: [
      {
        id: "trigger",
        dataType: "event"
      }
    ],
    outputs: [
      {
        id: "response",
        dataType: "object"
      }
    ]
  },

  properties: [
    {
      id: "url",
      type: "string",
      label: "URL",
      required: true
    },
    {
      id: "method",
      type: "select",
      label: "Method",
      defaultValue: "GET",
      options: [
        "GET",
        "POST",
        "PUT",
        "DELETE"
      ]
    }
  ],

  renderer: HttpRequestNodeRenderer
});
```

El renderizador es una contribución de presentación. No debe formar parte de la definición portable del nodo.

## 5.2. API de registro de edges

```typescript
builder.registerEdge({
  type: "conditional",
  label: "Conditional connection",
  renderer: ConditionalEdgeRenderer,
  style: {
    strokeWidth: 2
  }
});
```

## 5.3. API de plugins

```typescript
const plugin: BuilderPlugin = {
  id: "company.ai-nodes",
  version: "1.0.0",

  install(api) {
    api.nodes.register(aiAgentNode);
    api.nodes.register(aiPromptNode);

    api.properties.register(
      codeEditorProperty
    );

    api.panels.register(
      aiConfigurationPanel
    );
  }
};
```

## 5.4. API de configuración

```typescript
const builder = createBuilder({
  registry: {
    nodes: [
      inputNode,
      outputNode
    ]
  },

  features: {
    minimap: true,
    history: true,
    validation: true,
    grouping: true
  },

  document: {
    format: "ggd",
    version: "1.0.0"
  },

  ui: {
    theme: "custom",
    layout: "custom"
  }
});
```

La API definitiva deberá ser tipada, validada y compatible con la evolución del SDK.

---

# 6. Framework visual: decisión tecnológica

## 6.1. Recomendación

Mi recomendación es:

**Core agnóstico + adaptador React como primera implementación.**

No intentaría implementar desde el principio tres versiones completas para React, Vue y Angular.

Tampoco construiría todo el sistema en vanilla JavaScript.

La razón es que el proyecto tendrá una gran cantidad de componentes interactivos y personalizables:

- Nodos complejos.
- Formularios dinámicos.
- Paneles.
- Menús.
- Renderizadores.
- Edges personalizados.
- Editores de código.
- Sistemas de selección.
- Estados reactivos.

React Flow proporciona una base madura para el canvas y permite registrar renderizadores personalizados de nodos y edges.

## 6.2. Arquitectura propuesta

```text
              @generic-builder/core
                       |
              @generic-builder/sdk
                       |
             @generic-builder/contracts
                       |
          +------------+------------+
          |            |            |
        React         Vue         Angular
        Adapter      Adapter      Adapter
          |
    @xyflow/react
```

El core no importa ningún framework.

Los adaptadores son los responsables de conectar el SDK con el framework correspondiente.

## 6.3. Cómo desacoplar React

Los renderizadores React no deben registrarse directamente en el dominio.

Debe existir una interfaz de presentación que permita asociar un identificador de renderizador con una implementación específica del framework.

Ejemplo conceptual:

```typescript
interface RendererRegistry {
  registerNodeRenderer(
    type: string,
    renderer: unknown
  ): void;
}
```

Cada adaptador implementará esta interfaz utilizando sus propios mecanismos de componentes.

En React, utilizará componentes React y React Flow.

En Vue, deberá utilizar una implementación compatible con su sistema de componentes y un motor de canvas apropiado.

En Angular, se utilizarán componentes y adaptadores específicos.

Esto permite mantener una arquitectura común sin fingir que React Flow es compatible directamente con todos los frameworks.

## 6.4. Layout externo al canvas

El canvas debe ser un componente independiente.

Ejemplo:

```tsx
<BuilderProvider builder={builder}>
  <ApplicationLayout>

    <CustomHeader />

    <CustomSidebar>
      <NodePalette />
    </CustomSidebar>

    <CustomWorkspace>
      <GraphCanvas />
    </CustomWorkspace>

    <CustomInspector>
      <PropertiesPanel />
    </CustomInspector>

    <CustomFooter>
      <ValidationPanel />
    </CustomFooter>

  </ApplicationLayout>
</BuilderProvider>
```

La aplicación host controla completamente el layout.

El builder proporciona componentes funcionales que pueden colocarse donde se necesiten.

---

# 7. Arquitectura de paquetes y monorepo

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

---

# 8. Diseño del sistema de plugins

## 8.1. Tipos de plugins

| Plugin             | Responsabilidad                            |
| ------------------ | ------------------------------------------ |
| Node Plugin        | Añadir tipos de nodos                      |
| Edge Plugin        | Añadir tipos de conexiones                 |
| Property Plugin    | Añadir controles de propiedades            |
| Panel Plugin       | Añadir paneles de gestión                  |
| Theme Plugin       | Añadir temas                               |
| Layout Plugin      | Añadir composiciones                       |
| Tool Plugin        | Registrar herramientas                     |
| Validator Plugin   | Añadir validaciones                        |
| Importer Plugin    | Añadir formatos de entrada                 |
| Exporter Plugin    | Añadir formatos de salida                  |
| Integration Plugin | Añadir integraciones con sistemas externos |

## 8.2. Distribución

Se recomienda soportar:

- Paquetes npm públicos.
- Paquetes npm privados.
- Plugins internos de una aplicación.
- Plugins cargados explícitamente en tiempo de ejecución.

No recomiendo implementar inicialmente un marketplace ni un sistema de descarga dinámica de plugins.

Primero debe estabilizarse el contrato de extensión.

## 8.3. Versionado

Cada plugin debe declarar:

- Su versión.
- La versión compatible del SDK.
- Las dependencias necesarias.
- Las versiones de las definiciones que aporta.

Se debe evitar que dos plugins registren accidentalmente el mismo identificador.

---

# 9. Contratos públicos y tipado

La API pública debe estar diseñada para que los desarrolladores puedan extender el sistema sin conocer su implementación interna.

Contratos fundamentales:

```typescript
interface GraphDocument {
  format: string;
  version: string;
  metadata: GraphMetadata;
  extensions: ExtensionReference[];
  graph: GraphData;
}

interface NodeDefinition {
  type: string;
  version: string;
  label: string;
  category?: string;
  ports: PortDefinition[];
  properties: PropertyDefinition[];
}

interface NodeInstance {
  id: string;
  type: string;
  version: string;
  position: Position;
  properties: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface EdgeInstance {
  id: string;
  type?: string;
  source: string;
  sourcePort?: string;
  target: string;
  targetPort?: string;
  metadata?: Record<string, unknown>;
}

interface PluginManifest {
  id: string;
  version: string;
  sdkVersion: string;
  dependencies?: string[];
}

interface GraphSerializer {
  serialize(
    document: GraphDocument
  ): string;

  deserialize(
    content: string
  ): GraphDocument;
}
```

Estos contratos son un punto de partida. Deberán completarse con tipos discriminados, validaciones, políticas de compatibilidad y esquemas de documento.

---

# 10. Personalización visual

La personalización visual debe tener tres niveles.

## Nivel 1: Theme

Cambiar colores, tipografía, sombras, espaciado y estilos generales.

## Nivel 2: Component replacement

Sustituir completamente:

- Node Renderer.
- Edge Renderer.
- Port Renderer.
- Property Renderer.
- Panel Renderer.
- Toolbar Renderer.

## Nivel 3: UI Composition

Permitir que la aplicación host construya su propia interfaz utilizando los componentes funcionales del SDK.

El objetivo es que dos aplicaciones puedan utilizar exactamente el mismo core y presentar experiencias visuales radicalmente diferentes.

Ejemplo:

- Una aplicación puede utilizar nodos minimalistas.
- Otra puede utilizar nodos grandes con formularios integrados.
- Otra puede utilizar nodos compactos con iconos.
- Otra puede utilizar una representación visual tipo IDE.

La semántica del grafo será la misma.

---

# 11. Requisitos no funcionales

## 11.1. Performance

- Renderizado eficiente.
- Evitar actualizaciones innecesarias.
- Soporte para grafos grandes.
- Virtualización cuando sea necesaria.
- Separación entre estado del canvas y estado del dominio.
- Operaciones incrementales.
- Posibilidad de optimizar selección y renderizado.

## 11.2. Seguridad

- No ejecutar código almacenado en documentos.
- Validar documentos importados.
- Controlar la carga de plugins.
- Evitar evaluación arbitraria de expresiones.
- Definir límites para extensiones de terceros.
- No almacenar secretos de ejecución en el documento.

## 11.3. Compatibilidad

- TypeScript strict.
- Versionado semántico.
- Contratos estables.
- Migraciones.
- Compatibilidad entre documentos.
- Soporte de extensiones desconocidas.

## 11.4. Testing

- Unit tests de dominio.
- Tests de casos de uso.
- Tests de contratos.
- Tests de serialización.
- Tests de plugins.
- Tests de adaptadores.
- Tests de integración.
- Tests visuales.
- Tests E2E.

El dominio debe poder probarse sin montar un navegador ni React.

---

# 12. Roadmap de implementación

No recomiendo construir todos los módulos simultáneamente.

El desarrollo debe avanzar por capas, manteniendo un producto funcional en cada etapa.

## Fase 1. Domain Foundation

Implementar:

- Graph Model.
- Node Model.
- Edge Model.
- Port Model.
- Node Definitions.
- Edge Definitions.
- Property Definitions.
- Registries.
- Graph Validation.

**Resultado:** core capaz de crear y gestionar grafos sin interfaz gráfica.

## Fase 2. Document Foundation

Implementar:

- Graph Document.
- JSON Serializer.
- YAML Serializer.
- Document Validation.
- Document Versioning.
- Import/Export.
- Unknown Node Preservation.

**Resultado:** el core puede generar documentos portables y reconstruir grafos a partir de ellos.

## Fase 3. Application Core

Implementar:

- Use Cases.
- Commands.
- Events.
- History.
- Undo/Redo.
- Selection Model.
- Clipboard.
- Validation Pipeline.

**Resultado:** motor de edición independiente del framework visual.

## Fase 4. React Canvas Adapter

Implementar:

- React Provider.
- GraphCanvas.
- Node Renderer Registry.
- Edge Renderer Registry.
- Port Renderer.
- Drag and Drop.
- Connections.
- Zoom/Pan.
- Selection.
- Custom Nodes.

**Resultado:** primer editor funcional.

## Fase 5. UI Composition

Implementar:

- Node Palette.
- Properties Panel.
- Toolbar.
- Context Menu.
- Validation Panel.
- Layout Engine.
- Theme Engine.
- Component Replacement.

**Resultado:** interfaz configurable y completamente personalizable.

## Fase 6. SDK

Implementar:

- Public API.
- Builder Factory.
- Node API.
- Edge API.
- Property API.
- Plugin API.
- Theme API.
- Layout API.
- Event API.

**Resultado:** terceros pueden integrar el builder sin acceder a sus módulos internos.

## Fase 7. Plugin Ecosystem

Implementar:

- Plugin Manifest.
- Plugin Registry.
- Dependency Resolution.
- Lifecycle.
- Conflict Detection.
- Example Plugins.
- Plugin Documentation.

**Resultado:** ecosistema extensible y distribuible.

## Fase 8. Production Readiness

Implementar:

- Performance.
- Accessibility.
- Internationalization.
- Testing.
- Documentation.
- Compatibility.
- Release Automation.
- npm Publishing.

**Resultado:** producto listo para ser consumido por aplicaciones externas.

---

# 13. Decisiones arquitectónicas que deben considerarse definitivas

| Decisión            | Recomendación                        |
| ------------------- | ------------------------------------ |
| Lenguaje            | TypeScript strict                    |
| Arquitectura        | Hexagonal + DDD + SOLID              |
| Organización        | Monorepo                             |
| Package manager     | pnpm                                 |
| Build orchestration | Turborepo                            |
| Canvas inicial      | React Flow                           |
| Framework inicial   | React                                |
| Core                | Framework agnostic                   |
| Estado              | Separado por responsabilidades       |
| Extensiones         | Plugin API                           |
| Definiciones        | Declarativas y tipadas               |
| Propiedades         | Schema driven                        |
| Validación          | JSON Schema + reglas de dominio      |
| Documento           | Especificación GGD                   |
| Exportación         | JSON y YAML                          |
| Persistencia        | Adaptadores opcionales               |
| Layout              | Completamente externo y configurable |
| Renderizado         | Custom renderers                     |
| Ejecución           | Externa                              |
| Distribución        | Paquetes npm                         |

---

# 14. Riesgos arquitectónicos que debemos evitar

1. **Acoplar el dominio a React Flow.** Esto convertiría la futura compatibilidad con otros frameworks en una reescritura del core.

2. **Utilizar directamente el modelo de React Flow como documento exportado.** Sus estructuras contienen información específica de la representación visual.

3. **Mezclar Node Definition con Node Instance.** Las definiciones pertenecen al catálogo de extensiones; las instancias pertenecen al grafo.

4. **Confundir UI con dominio.** La posición, el color y el renderizador no deben alterar la semántica de un nodo.

5. **Introducir ejecución en el builder.** El producto debe seguir siendo exclusivamente un editor y modelador visual.

6. **Crear un plugin system excesivamente complejo desde el principio.** Primero deben estabilizarse los contratos públicos.

7. **Hacer que el layout sea obligatorio.** La aplicación host debe controlar la composición.

8. **Permitir que los plugins modifiquen directamente el estado interno.** Deben interactuar mediante APIs públicas y casos de uso.

9. **Depender de componentes visuales concretos para definir propiedades.** El esquema debe ser independiente y el renderizador debe ser sustituible.

10. **Perder información desconocida durante importaciones y exportaciones.** La compatibilidad futura exige preservar extensiones que el editor todavía no conoce.

---

# 15. Criterios de aceptación del producto

La primera versión estable debería cumplir estos requisitos:

- [ ] Crear un grafo desde cero.
- [ ] Registrar nodos mediante SDK.
- [ ] Registrar edges mediante SDK.
- [ ] Definir puertos personalizados.
- [ ] Definir propiedades mediante esquemas.
- [ ] Incorporar renderizadores personalizados.
- [ ] Incorporar validadores personalizados.
- [ ] Crear conexiones con reglas configurables.
- [ ] Modificar nodos y conexiones.
- [ ] Implementar undo/redo.
- [ ] Personalizar completamente la paleta.
- [ ] Personalizar completamente el inspector.
- [ ] Sustituir componentes visuales.
- [ ] Crear layouts personalizados.
- [ ] Gestionar plugins.
- [ ] Exportar JSON.
- [ ] Exportar YAML.
- [ ] Importar documentos.
- [ ] Validar documentos.
- [ ] Versionar documentos.
- [ ] Preservar nodos desconocidos.
- [ ] Funcionar sin backend propio.
- [ ] No ejecutar ningún nodo ni herramienta.
- [ ] Permitir que otro sistema consuma el documento sin depender del builder.

---

# 16. Conclusión y visión final

El producto debe concebirse como un **Graph Editing Framework**, no como un workflow builder.

La diferencia es importante.

Un workflow builder presupone un dominio, una semántica de ejecución y normalmente un motor asociado.

Un Graph Editing Framework ofrece una infraestructura genérica para modelar estructuras conectadas, definir sus elementos, editarlos visualmente y exportarlos mediante un contrato independiente.

La arquitectura recomendada es:

**Domain Core + Application Core + SDK + Plugin System + UI Adapters.**

React Flow será la primera implementación del motor de representación, pero no una dependencia del dominio.

El documento GGD será el contrato de interoperabilidad entre el editor y cualquier sistema externo.

El SDK permitirá que cada aplicación defina sus propios nodos, edges, propiedades, herramientas y plugins.

La UI Composition API permitirá que cada aplicación construya su propia experiencia visual, sin quedar condicionada por un layout predeterminado.

**El resultado será un producto reutilizable que podrá utilizarse para construir prácticamente cualquier editor de grafos sin tener que desarrollar un builder nuevo para cada aplicación.**
