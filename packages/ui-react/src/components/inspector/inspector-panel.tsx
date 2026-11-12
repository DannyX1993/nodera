import type { CSSProperties, ReactNode } from "react";

import type { Edge, Node } from "@nodera/graph-model";

import { useEditorSnapshot } from "../../bindings/editor-snapshot.js";
import { useGraphQueries, type GraphQueries } from "../../bindings/graph-queries.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import {
  HEADING_STYLE,
  LIST_STYLE,
  MUTED_STYLE,
  PANEL_STYLE,
  RAW_STYLE,
  ROW_LABEL_STYLE,
  ROW_STYLE,
  ROW_VALUE_STYLE,
  SECTION_STYLE,
} from "./styles.js";

/** Props accepted by {@link InspectorPanel}. */
export interface InspectorPanelProps {
  readonly className?: string;
  /** Node to inspect. Defaults to the first selected node. */
  readonly nodeId?: string;
  /** Edge to inspect. Defaults to the first selected edge. */
  readonly edgeId?: string;
  /** Whether the raw property record is shown. Defaults to `true`. */
  readonly showRawProperties?: boolean;
}

/** Formats one metadata or property value for the read-only text rows. */
function displayValue(value: unknown): string {
  if (value === undefined) {
    return "—";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/** One label/value row of the structural view. */
function InspectorRow(props: { readonly name: string; readonly children: ReactNode }): ReactNode {
  return (
    <div data-nodera-inspector-row={props.name} style={ROW_STYLE}>
      <dt style={ROW_LABEL_STYLE}>{props.name}</dt>
      <dd style={ROW_VALUE_STYLE}>{props.children}</dd>
    </div>
  );
}

/** Metadata entries of a node or edge, one row per declared key. */
function MetadataRows(props: { readonly metadata: Readonly<Record<string, unknown>> | undefined }): ReactNode {
  if (props.metadata === undefined) {
    return null;
  }
  return (
    <>
      {Object.entries(props.metadata).map(([key, value]) => (
        <InspectorRow key={key} name={`metadata-${key}`}>
          {displayValue(value)}
        </InspectorRow>
      ))}
    </>
  );
}

function rootProps(
  className: string | undefined,
  surface: string,
): {
  readonly className?: string;
  readonly "data-nodera-inspector": string;
  readonly style: CSSProperties;
} {
  return {
    ...(className === undefined ? {} : { className }),
    "data-nodera-inspector": surface,
    style: PANEL_STYLE,
  };
}

/** Read-only structural view of a node instance. */
function NodeInspector(props: {
  readonly queries: GraphQueries;
  readonly node: Node;
  readonly showRawProperties: boolean;
  readonly className: string | undefined;
}): ReactNode {
  const t = useTranslate();
  const { node } = props;
  const definition = props.queries.nodeDefinition(node.definitionId);
  const version = definition?.version ?? node.definitionVersion;
  const declarations = definition?.ports ?? [];
  const position = node.position;

  return (
    <div {...rootProps(props.className, "node")}>
      <dl style={SECTION_STYLE}>
        <InspectorRow name="id">{node.id}</InspectorRow>
        <InspectorRow name="definition">{node.definitionId}</InspectorRow>
        {version === undefined ? null : (
          <InspectorRow name="version">{version}</InspectorRow>
        )}
        {position === undefined ? null : (
          <>
            <InspectorRow name="position-x">{String(position.x)}</InspectorRow>
            <InspectorRow name="position-y">{String(position.y)}</InspectorRow>
          </>
        )}
        <MetadataRows metadata={node.metadata} />
      </dl>
      <section data-nodera-inspector-section="ports" style={SECTION_STYLE}>
        <h4 style={HEADING_STYLE}>{t("inspector.ports")}</h4>
        <ul style={LIST_STYLE}>
          {node.getPorts().map((port) => {
            const declaration = declarations.find(
              (candidate) => candidate.id === (port.declarationId ?? port.id),
            );
            const dataType = declaration?.dataType;
            return (
              <li
                key={port.id}
                data-nodera-inspector-port={port.id}
                data-nodera-inspector-port-direction={port.direction}
                {...(dataType === undefined
                  ? {}
                  : { "data-nodera-inspector-port-data-type": dataType })}
                style={ROW_STYLE}
              >
                <span style={ROW_LABEL_STYLE}>{port.id}</span>
                <span style={ROW_VALUE_STYLE}>
                  {`${port.direction}${dataType === undefined ? "" : ` · ${dataType}`}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {props.showRawProperties ? (
        <section data-nodera-inspector-section="properties" style={SECTION_STYLE}>
          <h4 style={HEADING_STYLE}>{t("inspector.properties")}</h4>
          <pre data-nodera-inspector-raw-properties="" style={RAW_STYLE}>
            {JSON.stringify(node.getProperties(), null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

/** Read-only structural view of an edge instance. */
function EdgeInspector(props: {
  readonly edge: Edge;
  readonly className: string | undefined;
}): ReactNode {
  const { edge } = props;
  const source = edge.connection.source;
  const target = edge.connection.target;

  return (
    <div {...rootProps(props.className, "edge")}>
      <dl style={SECTION_STYLE}>
        <InspectorRow name="id">{edge.id}</InspectorRow>
        <InspectorRow name="definition">{edge.definitionId ?? "—"}</InspectorRow>
        <InspectorRow name="label">{edge.label ?? "—"}</InspectorRow>
        <InspectorRow name="source">{`${source.nodeId}:${source.portId}`}</InspectorRow>
        <InspectorRow name="target">{`${target.nodeId}:${target.portId}`}</InspectorRow>
        <MetadataRows metadata={edge.metadata} />
      </dl>
    </div>
  );
}

/**
 * Read-only inspector of the selected element (D11).
 *
 * It shows what the portable model actually holds — ids, definition version,
 * positions, metadata, ports and the raw property record — without inputs and
 * without mutations. Editing belongs to `PropertiesPanel`; this surface exists
 * so a host can offer a structural view (debugging, auditing, education) that
 * may not apply to the selected element at all.
 */
export function InspectorPanel(props: InspectorPanelProps): ReactNode {
  const editor = useEditorEngine();
  const t = useTranslate();
  const snapshot = useEditorSnapshot(editor);
  const queries = useGraphQueries(editor);
  const showRawProperties = props.showRawProperties !== false;

  const selectedNodeId = snapshot.selectedNodes[0];
  const selectedEdgeId = snapshot.selectedEdges[0];
  const nodeId =
    props.nodeId ?? (props.edgeId === undefined ? selectedNodeId : undefined);
  const resolvedEdgeId =
    props.edgeId ??
    (props.nodeId === undefined && nodeId === undefined ? selectedEdgeId : undefined);

  const node = nodeId === undefined ? undefined : queries.node(nodeId);
  if (node !== undefined) {
    return (
      <NodeInspector
        queries={queries}
        node={node}
        showRawProperties={showRawProperties}
        className={props.className}
      />
    );
  }

  const edge = resolvedEdgeId === undefined ? undefined : queries.edge(resolvedEdgeId);
  if (edge !== undefined) {
    return <EdgeInspector edge={edge} className={props.className} />;
  }

  return (
    <div {...rootProps(props.className, "none")}>
      <p data-nodera-inspector-empty="" style={MUTED_STYLE}>
        {t("inspector.empty")}
      </p>
    </div>
  );
}
