# SDK Public API Module

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


# Definición del SDK

El SDK debe ser la principal puerta de entrada para los desarrolladores.

## API de registro de nodos

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

## API de registro de edges

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

## API de plugins

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

## API de configuración

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


# Contratos públicos y tipado

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

