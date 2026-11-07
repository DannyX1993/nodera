# Graph Domain Module

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

# Node Definition Module

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

# Edge Definition Module

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

# Port & Connection Module

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

# Property Definition Module

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

# Registry Module

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

# Validation Module

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

