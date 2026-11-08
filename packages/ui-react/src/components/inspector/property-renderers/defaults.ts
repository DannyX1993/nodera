import type { ComponentType } from "react";

import { PROPERTY_TYPES, type PropertyType } from "@nodera/property-system";

import {
  ComponentRegistry,
  type PropertyRendererProps,
} from "../../../registries/component-registry.js";
import { ArrayPropertyRenderer } from "./array-property.js";
import { BooleanPropertyRenderer } from "./boolean-property.js";
import { CodeEditorPropertyRenderer } from "./code-editor-property.js";
import { ColorPropertyRenderer } from "./color-property.js";
import { CustomPropertyRenderer } from "./custom-property.js";
import { DatePropertyRenderer } from "./date-property.js";
import { DatetimePropertyRenderer } from "./datetime-property.js";
import { FileReferencePropertyRenderer } from "./file-reference-property.js";
import { JsonEditorPropertyRenderer } from "./json-editor-property.js";
import { MultiSelectPropertyRenderer } from "./multi-select-property.js";
import { NumberPropertyRenderer } from "./number-property.js";
import { ObjectPropertyRenderer } from "./object-property.js";
import { SelectPropertyRenderer } from "./select-property.js";
import { StringPropertyRenderer } from "./string-property.js";
import { TextareaPropertyRenderer } from "./textarea-property.js";
import { YamlEditorPropertyRenderer } from "./yaml-editor-property.js";

/**
 * Built-in renderer of one property type.
 *
 * These are fallbacks, not the customization mechanism: a host replaces any of
 * them by registering its own component in the property renderer registry
 * (S3 Level 2: "Property Renderer"). The mapping is total over
 * `PROPERTY_TYPES`, so a panel always has something to render.
 */
export function defaultPropertyRenderer(
  type: PropertyType,
): ComponentType<PropertyRendererProps> {
  switch (type) {
    case "string":
      return StringPropertyRenderer;
    case "number":
      return NumberPropertyRenderer;
    case "boolean":
      return BooleanPropertyRenderer;
    case "select":
      return SelectPropertyRenderer;
    case "multi-select":
      return MultiSelectPropertyRenderer;
    case "textarea":
      return TextareaPropertyRenderer;
    case "code-editor":
      return CodeEditorPropertyRenderer;
    case "json-editor":
      return JsonEditorPropertyRenderer;
    case "yaml-editor":
      return YamlEditorPropertyRenderer;
    case "date":
      return DatePropertyRenderer;
    case "datetime":
      return DatetimePropertyRenderer;
    case "color":
      return ColorPropertyRenderer;
    case "file-reference":
      return FileReferencePropertyRenderer;
    case "object":
      return ObjectPropertyRenderer;
    case "array":
      return ArrayPropertyRenderer;
    case "custom":
      return CustomPropertyRenderer;
  }
}

/**
 * Registry holding one built-in renderer per property type.
 *
 * The panel resolves a renderer through the host registry first and falls back
 * to {@link defaultPropertyRenderer}; a host that wants the built-ins to be
 * replaceable *and* enumerable (a theme editor, a renderer picker) can start
 * from this registry and override single ids.
 */
export function createDefaultPropertyRenderers(): ComponentRegistry<PropertyRendererProps> {
  const registry = new ComponentRegistry<PropertyRendererProps>();
  for (const type of PROPERTY_TYPES) {
    registry.register(type, defaultPropertyRenderer(type));
  }
  return registry;
}
