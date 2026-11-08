# Canvas Engine Module

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

