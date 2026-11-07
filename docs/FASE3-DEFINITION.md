# Application Use Cases Module

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

# History & Command Module

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

# Events & Integration Module

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


