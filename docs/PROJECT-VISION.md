# Visión del producto

## Objetivo

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

## Principios fundamentales

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

## Límites de responsabilidad

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

