# @nodera/serialization-yaml

YAML serialization for the Generic Graph Document (GGD) — an alternative
serialization of exactly the same logical model as JSON.

- `serializeYaml(document)` → `SerializationResult`
  (`Result<string, ValidationIssue[]>`) emits YAML text.
- `parseYamlDocument(text)` → `ParseResult`
  (`Result<GraphDocument, ValidationIssue[]>`).
- The shared structural checks from [`@nodera/document`](../document/README.md)
  run before serialization and after parsing, so non-portable values and
  malformed documents produce the same `document.*` diagnostics as the JSON
  path; non-object payloads are rejected too.
- Failures are structured: `parse.invalid-yaml` and
  `serialize.non-portable-value`.
- The only runtime dependency beyond `@nodera/document` and
  `@nodera/contracts` is the `yaml` package.

The two serializers are interchangeable: parsing either output yields the same
normalized `GraphDocument`.
