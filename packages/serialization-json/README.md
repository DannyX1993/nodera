# @nodera/serialization-json

JSON serialization for the Generic Graph Document (GGD).

- `serializeJson(document)` → `SerializationResult`
  (`Result<string, ValidationIssue[]>`) returns pretty-printed JSON
  (two-space indent).
- `parseJsonDocument(text)` → `ParseResult`
  (`Result<GraphDocument, ValidationIssue[]>`).
- Both run the shared structural checks from
  [`@nodera/document`](../document/README.md) first, so a non-portable value is
  rejected with the same `document.*` diagnostics the rest of the system uses
  instead of being dropped silently.
- Failures are structured: `parse.invalid-json` for text the parser rejects and
  `serialize.non-portable-value` for a value JSON cannot represent.

JSON is the canonical representation of the contract; the YAML package
serializes exactly the same logical model.
