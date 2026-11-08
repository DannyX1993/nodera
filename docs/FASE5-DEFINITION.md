# UI Composition Module

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

# UI Customization Module

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

# Layout Engine Module

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

# State Management Module

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

# Framework visual: decisión tecnológica

## Recomendación

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

## Arquitectura propuesta

```text
              @generic-builder/core
                       |
              @generic-builder/sdk
                       |
             @generic-builder/contracts



## Layout externo al canvas

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

# Personalización visual

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


