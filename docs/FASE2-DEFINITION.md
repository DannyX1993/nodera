# Document & Serialization Module

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

# Definición del modelo de documento portable

## Principio

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

## Separación entre definición e instancia

Hay que distinguir claramente:

**Node Definition**

Describe qué es un tipo de nodo y cómo debe configurarse.

**Node Instance**

Describe una instancia concreta dentro de un grafo.

La definición puede estar en un plugin y la instancia en el documento exportado.

El documento debe contener una referencia estable al tipo y su versión, pero no tiene por qué duplicar toda la definición.

## Portabilidad

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

