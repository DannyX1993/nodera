# @nodera/document

The portable Generic Graph Document (GGD): contract, normalization, structural
validation, versioning/migrations and the mapping to and from the graph model.

- Contract — `GGD_FORMAT` (`"ggd"`), `GraphDocument`, `DocumentMetadata`,
  `DocumentNodeInstance`, `DocumentEdgeInstance`, `DocumentPortInstance`,
  `DocumentEdgeEndpoint`, `DocumentExtensionReference`, `DocumentGroup`,
  `DocumentGraphSettings` and `DocumentGraphContainer`. Instances reference
  declaration ids; they never embed definitions.
- `normalizeGraphDocument(raw)` → `Result<GraphDocument, ValidationIssue[]>` and
  `findDocumentIssues(raw)` — structural rules (required fields, shapes,
  versions, portability: no functions, symbols, class instances) plus `document.*`
  diagnostics. Unknown vendor fields are preserved for round-tripping.
- `validateGraphDocument(raw)` → `DocumentValidationReport`
  (`issues`, `documentValid`, `isValid`); validation never mutates or repairs.
- Mapping — `graphToDocument(graph, options)` and
  `documentToGraph(document)` (`GraphImportResult` = `Result<Graph,
  MappingIssues>`; every failure is a `document.*` issue, never a throw or a
  silent repair) with `DEFAULT_FORMAT_VERSION` (`"1.0.0"`);
  `extractCarriedDocumentData` / `CarriedDocumentData` carry what the domain
  cannot represent (format version, extension refs, groups) so an
  import/export round trip stays lossless.
- Versioning — `DocumentMigration`, `MigrationResult` and
  `documentVersionMigrator(targetVersion, migrations)`, which rejects
  conflicting migration tables eagerly and hops version to version. Migrations
  are host-supplied data transformations; the package ships none because GGD
  `1.0.0` is the first version.

`schema/ggd-1.0.0.schema.json` is the JSON Schema of the same contract.
