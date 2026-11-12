# `@nodera/adapter-storage-http` — reserved placeholder

Intentionally empty, `private` and not published: no `src`, no build, no tests,
no exports. Do not depend on it.

The core performs no network calls. A host that wants remote persistence
implements it over [`@nodera/document`](../document/README.md) and the
serializers, owning credentials, retries and transport policy. See
`odd/tasks/fase8-production-readiness.md` (D3/D11).
