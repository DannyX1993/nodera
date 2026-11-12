# @nodera/domain

The domain facade: one entry point that composes the graph model, the
definition registries and validation, with no interface or framework dependency.

- `NoderaDomain` owns `nodes` (`NodeRegistry`), `edges` (`EdgeRegistry`),
  `validators` (`ValidatorRegistry`), `importers` (`ImporterRegistry`) and
  `exporters` (`ExporterRegistry`), all injectable so a composition root can
  share one set of registries across sessions.
- `createNode(graph, definitionId, options)` — builds a node instance from a
  registered, validated `NodeDefinition`: ports are materialized from the
  declarations and the definition is never embedded in the instance. It
  returns `Result<Node, DomainError>`.
- `createContext(graph)` and `validate(graph, { levels })` — run
  [`@nodera/validation`](../validation/README.md) against this facade's
  registries and return a `ValidationReport`.
- `DomainError` / `DomainErrorKind` — `node-definition-not-found`,
  `invalid-node-definition`, `duplicate-node-id`.
- Importers and exporters are registered as contracts (`Importer`,
  `ExportError`/`ExporterRegistry`, `ImportError`) with the standard
  `duplicate-id` / `not-found` registry semantics; implementations live in
  adapters, and imported payloads stay `unknown` until validated.

The core can create, validate and manage graphs with no graphical interface;
presentation is a later adapter over this facade.
