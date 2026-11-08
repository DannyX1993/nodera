import { useId, useState, type ReactNode } from "react";

import { updateGraphMetadata } from "@nodera/application";
import type { GraphMetadata } from "@nodera/graph-model";

import { useEditorSnapshot } from "../../bindings/editor-snapshot.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import {
  CONTROL_STYLE,
  FIELD_STYLE,
  HEADING_STYLE,
  LABEL_STYLE,
  MUTED_STYLE,
  PANEL_STYLE,
} from "./styles.js";

/** Props accepted by {@link MetadataPanel}. */
export interface MetadataPanelProps {
  readonly className?: string;
  /** Disables every editor. */
  readonly readOnly?: boolean;
}

/** Editable text form of the graph metadata. */
interface MetadataDraft {
  readonly name: string;
  readonly description: string;
  /** Tags as the user types them: one comma separated value. */
  readonly tags: string;
  /** Metadata the panel does not edit, preserved on every commit. */
  readonly extra: Readonly<Record<string, unknown>> | undefined;
}

function toDraft(metadata: GraphMetadata): MetadataDraft {
  return {
    name: metadata.name ?? "",
    description: metadata.description ?? "",
    tags: (metadata.tags ?? []).join(", "),
    extra: metadata.extra,
  };
}

/** Splits the comma separated field into normalized tags, dropping blanks. */
function parseTags(text: string): readonly string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Rebuilds the metadata record from the draft.
 *
 * Empty text fields are *absent* keys, not empty strings: clearing a
 * description removes it from the document instead of storing `""`, so a
 * round-trip does not invent metadata the host never wrote. Tags are always an
 * array (`[]` when the field is empty) because that is their declared shape.
 */
function toMetadata(draft: MetadataDraft): GraphMetadata {
  return {
    ...(draft.name === "" ? {} : { name: draft.name }),
    ...(draft.description === "" ? {} : { description: draft.description }),
    tags: parseTags(draft.tags),
    ...(draft.extra === undefined ? {} : { extra: draft.extra }),
  };
}

/** Stable identity of a metadata record, used to detect external updates. */
function metadataKey(metadata: GraphMetadata): string {
  return JSON.stringify(metadata);
}

/**
 * Graph metadata panel: the graph id and the editable descriptive metadata.
 *
 * Every commit goes through the `updateGraphMetadata` use case, so it is one
 * undoable unit and the document — never the UI state — stays the source of
 * truth (S5). The local draft exists only so an in-progress field keeps its
 * text; it follows external changes such as an undo.
 */
export function MetadataPanel(props: MetadataPanelProps): ReactNode {
  const editor = useEditorEngine();
  const snapshot = useEditorSnapshot(editor);
  const metadata = snapshot.graph.metadata;
  const externalKey = metadataKey(metadata);
  const nameId = useId();
  const descriptionId = useId();
  const tagsId = useId();
  const readOnly = props.readOnly === true;

  const [state, setState] = useState<{ readonly draft: MetadataDraft; readonly key: string }>(
    () => ({ draft: toDraft(metadata), key: externalKey }),
  );

  if (externalKey !== state.key) {
    const draftKey = metadataKey(toMetadata(state.draft));
    setState({
      draft: draftKey === externalKey ? state.draft : toDraft(metadata),
      key: externalKey,
    });
  }

  const commit = (draft: MetadataDraft): void => {
    setState({ draft, key: metadataKey(toMetadata(draft)) });
    updateGraphMetadata(editor, { metadata: toMetadata(draft) });
  };

  return (
    <div
      data-nodera-metadata-panel=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={PANEL_STYLE}
    >
      <h3 style={HEADING_STYLE}>Graph metadata</h3>
      <p data-nodera-metadata="graph-id" style={MUTED_STYLE}>
        {snapshot.graph.id}
      </p>
      <div style={FIELD_STYLE}>
        <label htmlFor={nameId} style={LABEL_STYLE}>
          Graph name
        </label>
        <input
          id={nameId}
          type="text"
          aria-label="Graph name"
          value={state.draft.name}
          disabled={readOnly}
          onChange={(event) => {
            commit({ ...state.draft, name: event.target.value });
          }}
          style={CONTROL_STYLE}
        />
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor={descriptionId} style={LABEL_STYLE}>
          Graph description
        </label>
        <textarea
          id={descriptionId}
          aria-label="Graph description"
          value={state.draft.description}
          disabled={readOnly}
          onChange={(event) => {
            commit({ ...state.draft, description: event.target.value });
          }}
          style={CONTROL_STYLE}
        />
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor={tagsId} style={LABEL_STYLE}>
          Tags
        </label>
        <input
          id={tagsId}
          type="text"
          aria-label="Tags"
          value={state.draft.tags}
          disabled={readOnly}
          onChange={(event) => {
            commit({ ...state.draft, tags: event.target.value });
          }}
          style={CONTROL_STYLE}
        />
      </div>
    </div>
  );
}
