import {
  createNodeId,
  err,
  notFoundError,
  ok,
  type NodeId,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import { Graph, Node, type NodePosition } from "@nodera/graph-model";
import { EdgeRegistry } from "@nodera/edge-registry";
import { NodeRegistry, validateNodeDefinition, type NodeDefinition } from "@nodera/node-registry";
import {
  validateGraph,
  ValidatorRegistry,
  type ValidationContext,
  type ValidationLevel,
  type ValidationReport,
} from "@nodera/validation";

/** Kinds of errors the domain facade reports. */
export type DomainErrorKind =
  | "node-definition-not-found"
  | "invalid-node-definition"
  | "duplicate-node-id";

/** Structured error returned by facade operations. */
export interface DomainError {
  readonly kind: DomainErrorKind;
  readonly message: string;
  readonly elementId?: string;
}

/** Options for creating a node instance from a definition. */
export interface CreateNodeOptions {
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: NodePosition;
}

/**
 * Domain facade: composes the graph model, definition registries and
 * validation into one entry point, without any interface or framework
 * dependency.
 *
 * The core can create and manage graphs with no graphical interface; the
 * presentation layer is a later adapter that consumes this facade.
 */
export class NoderaDomain {
  readonly nodes: NodeRegistry;
  readonly edges: EdgeRegistry;
  readonly validators: ValidatorRegistry;

  constructor(
    nodes: NodeRegistry = new NodeRegistry(),
    edges: EdgeRegistry = new EdgeRegistry(),
    validators: ValidatorRegistry = new ValidatorRegistry(),
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.validators = validators;
  }

  /**
   * Creates a node instance from a registered node definition. Ports are
   * materialized from the definition's declarations; the definition itself
   * is never embedded in the instance.
   */
  createNode(
    graph: Graph,
    definitionId: string,
    options: CreateNodeOptions = {},
  ): Result<Node, DomainError> {
    const definition = this.nodes.get(definitionId);
    if (definition === undefined) {
      return err({
        kind: "node-definition-not-found",
        message: `No node definition registered with id "${definitionId}"`,
      });
    }
    const definitionIssues = validateNodeDefinition(definition).filter(
      (issue) => issue.severity === "error",
    );
    if (definitionIssues.length > 0) {
      return err({
        kind: "invalid-node-definition",
        message: `Node definition "${definitionId}" is invalid: ${definitionIssues.map((i) => i.code).join(", ")}`,
      });
    }
    const nodeId = createNodeId(options.nodeId ?? generateNodeId(definition));
    if (graph.getNode(nodeId) !== undefined) {
      return err({
        kind: "duplicate-node-id",
        message: `Graph already contains a node with id "${nodeId}"`,
        elementId: nodeId,
      });
    }
    const node = new Node(
      nodeId,
      definition.id,
      definition.ports.map((declaration) => ({
        id: declaration.id,
        direction: declaration.direction,
        declarationId: declaration.id,
      })),
      options.properties ?? {},
      options.position,
    );
    const added = graph.addNode(node);
    return added.ok ? ok(node) : err(toDomainError(added.error.kind, added.error.message, added.error.elementId));
  }

  /** Builds a validation context bound to this facade's registries. */
  createContext(graph: Graph): ValidationContext {
    return {
      graph,
      nodes: this.nodes,
      edges: this.edges,
      validators: this.validators,
    };
  }

  /** Validates a graph through the composed context. */
  validate(
    graph: Graph,
    options: { readonly levels?: readonly ValidationLevel[] } = {},
  ): ValidationReport {
    return validateGraph(this.createContext(graph), options);
  }
}

/** Node definition and registry errors share the structured error shape. */
export type { RegistryError };

function toDomainError(kind: string, message: string, elementId?: string): DomainError {
  return elementId === undefined
    ? { kind: kind as DomainError["kind"], message }
    : { kind: kind as DomainError["kind"], message, elementId };
}

function generateNodeId(definition: NodeDefinition): string {
  const slug = definition.id.split(".").join("-");
  const random = Math.random().toString(36).slice(2, 8);
  return `node-${slug}-${random}`;
}

/** Standard facade error builder re-exported for hosts. */
export { notFoundError };
