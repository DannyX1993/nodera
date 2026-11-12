import { useId, type CSSProperties, type ReactNode } from "react";

import {
  updateEdge,
  updateNodeProperties,
  type EditorEngine,
} from "@nodera/application";
import type { PropertyDefinition } from "@nodera/property-system";
import {
  effectiveOptions,
  isDefinitionEnabled,
  isDefinitionVisible,
  validatePropertyValue,
} from "@nodera/property-system";

import { useEditorSnapshot } from "../../bindings/editor-snapshot.js";
import { useGraphQueries } from "../../bindings/graph-queries.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { useEditorEngine, useComponentRenderers } from "../../providers/ui-provider.js";
import { groupPropertiesForDisplay, type PropertySection } from "./property-layout.js";
import { defaultPropertyRenderer } from "./property-renderers/defaults.js";
import {
  CONTROL_STYLE,
  FIELD_STYLE,
  HEADING_STYLE,
  LABEL_STYLE,
  MUTED_STYLE,
  PANEL_STYLE,
  RAW_STYLE,
  SECTION_STYLE,
} from "./styles.js";

/** Props accepted by {@link PropertiesPanel}. */
export interface PropertiesPanelProps {
  readonly className?: string;
  /** Node to edit. Defaults to the first selected node. */
  readonly nodeId?: string;
  /** Disables every editor without hiding any property. */
  readonly readOnly?: boolean;
  /**
   * Host commit handler. When supplied the panel reports the change instead of
   * writing it, so a host can validate, batch or route it through its own use
   * case.
   */
  readonly onChange?: (nodeId: string, propertyId: string, value: unknown) => void;
  /** Copy shown when there is nothing to edit. Defaults to the catalog's `properties.empty`. */
  readonly emptyMessage?: string;
}

interface PanelRootProps {
  readonly className?: string;
  readonly "data-nodera-properties-panel": string;
  readonly "data-nodera-properties-target": string;
  readonly style: CSSProperties;
}

function panelRoot(className: string | undefined, target: string): PanelRootProps {
  return {
    ...(className === undefined ? {} : { className }),
    "data-nodera-properties-panel": "",
    "data-nodera-properties-target": target,
    style: PANEL_STYLE,
  };
}

/** Props shared by the two editors of the panel. */
interface EditorProps {
  readonly editor: EditorEngine;
  readonly readOnly: boolean;
  readonly onChange: ((nodeId: string, propertyId: string, value: unknown) => void) | undefined;
}

/** One editable property of the target node. */
function PropertyRow(
  props: EditorProps & {
    readonly nodeId: string;
    readonly definition: PropertyDefinition;
    readonly values: Readonly<Record<string, unknown>>;
  },
): ReactNode {
  const renderers = useComponentRenderers();

  const options = effectiveOptions(props.definition, props.values);
  const definition: PropertyDefinition =
    options === undefined || options === props.definition.options
      ? props.definition
      : { ...props.definition, options };

  const stored = props.values[definition.id];
  const value = stored === undefined ? definition.defaultValue : stored;
  const enabled = isDefinitionEnabled(definition, props.values);
  const issues = validatePropertyValue(definition, value, { elementId: props.nodeId });

  const Renderer =
    renderers.properties.tryGet(definition.component ?? definition.type) ??
    defaultPropertyRenderer(definition.type);

  return (
    <Renderer
      definition={definition}
      value={value}
      issues={issues}
      disabled={props.readOnly || !enabled}
      onChange={(next: unknown) => {
        if (props.onChange !== undefined) {
          props.onChange(props.nodeId, definition.id, next);
          return;
        }
        updateNodeProperties(props.editor, {
          nodeId: props.nodeId,
          name: definition.id,
          value: next,
        });
      }}
    />
  );
}

/** Editable property list of one node instance. */
function NodePropertiesView(
  props: EditorProps & { readonly nodeId: string; readonly className: string | undefined },
): ReactNode {
  const t = useTranslate();
  const queries = useGraphQueries(props.editor);
  const node = queries.node(props.nodeId);
  if (node === undefined) {
    return null;
  }

  const values = node.getProperties();
  const definition = queries.nodeDefinition(node.definitionId);

  if (definition === undefined) {
    return (
      <div {...panelRoot(props.className, "node")}>
        <p data-nodera-properties-unknown-definition="" style={MUTED_STYLE}>
          {t("properties.unknownDefinition", { definitionId: node.definitionId })}
        </p>
        <pre data-nodera-properties-raw="" style={RAW_STYLE}>
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>
    );
  }

  const visible = queries
    .propertyDefinitions(props.nodeId)
    .filter((property) => isDefinitionVisible(property, values));
  const sections: readonly PropertySection[] = groupPropertiesForDisplay(visible);

  return (
    <div {...panelRoot(props.className, "node")}>
      <h3 data-nodera-properties-definition="" style={HEADING_STYLE}>
        {definition.name}
      </h3>
      {sections.length === 0 ? (
        <p data-nodera-properties-empty="" style={MUTED_STYLE}>
          {t("properties.noProperties")}
        </p>
      ) : null}
      {sections.map((section) => (
        <section
          key={section.group}
          data-nodera-property-group={section.group}
          style={SECTION_STYLE}
        >
          <h4 data-nodera-property-group-title="" style={HEADING_STYLE}>
            {section.title}
          </h4>
          {section.properties.map((property) => (
            <PropertyRow
              key={property.id}
              editor={props.editor}
              nodeId={props.nodeId}
              definition={property}
              values={values}
              readOnly={props.readOnly}
              onChange={props.onChange}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Edge inspector: an edge declares no properties, so the panel edits its label
 * (the only semantic text an edge carries) through the `updateEdge` use case.
 */
function EdgePropertiesView(
  props: {
    readonly editor: EditorEngine;
    readonly edgeId: string;
    readonly readOnly: boolean;
    readonly className: string | undefined;
  },
): ReactNode {
  const controlId = useId();
  const t = useTranslate();
  const queries = useGraphQueries(props.editor);
  const edge = queries.edge(props.edgeId);
  if (edge === undefined) {
    return null;
  }
  const definition =
    edge.definitionId === undefined
      ? undefined
      : queries.edgeDefinition(edge.definitionId);

  return (
    <div {...panelRoot(props.className, "edge")}>
      <h3 data-nodera-properties-definition="" style={HEADING_STYLE}>
        {definition?.name ?? edge.id}
      </h3>
      <div style={FIELD_STYLE}>
        <label htmlFor={controlId} style={LABEL_STYLE}>
          {t("properties.edgeLabel")}
        </label>
        <input
          id={controlId}
          type="text"
          aria-label={t("properties.edgeLabel")}
          value={edge.label ?? ""}
          disabled={props.readOnly}
          onChange={(event) => {
            updateEdge(props.editor, { edgeId: props.edgeId, label: event.target.value });
          }}
          style={CONTROL_STYLE}
        />
      </div>
    </div>
  );
}

/**
 * Properties panel driven by `PropertyDefinition` (D11).
 *
 * The panel duplicates no property logic: visibility, enabled state, effective
 * options and value diagnostics all come from `@nodera/property-system`, and
 * mutations go through the application use cases. It is replaceable at two
 * levels (S3): per property type through the renderer registry, and as a whole
 * panel through the panel renderer registry.
 */
export function PropertiesPanel(props: PropertiesPanelProps): ReactNode {
  const editor = useEditorEngine();
  const t = useTranslate();
  const snapshot = useEditorSnapshot(editor);
  const queries = useGraphQueries(editor);
  const readOnly = props.readOnly === true;

  const explicitNodeId = props.nodeId;
  const selectedNodeId = snapshot.selectedNodes[0];
  const selectedEdgeId = snapshot.selectedEdges[0];
  const nodeId = explicitNodeId ?? selectedNodeId;
  const edgeId =
    explicitNodeId === undefined && nodeId === undefined ? selectedEdgeId : undefined;

  if (nodeId !== undefined && queries.node(nodeId) !== undefined) {
    return (
      <NodePropertiesView
        editor={editor}
        nodeId={nodeId}
        readOnly={readOnly}
        onChange={props.onChange}
        className={props.className}
      />
    );
  }

  if (edgeId !== undefined && queries.edge(edgeId) !== undefined) {
    return (
      <EdgePropertiesView
        editor={editor}
        edgeId={edgeId}
        readOnly={readOnly}
        className={props.className}
      />
    );
  }

  return (
    <div {...panelRoot(props.className, "none")}>
      <p data-nodera-properties-empty="" style={MUTED_STYLE}>
        {props.emptyMessage ?? t("properties.empty")}
      </p>
    </div>
  );
}
