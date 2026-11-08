# @nodera/theme-engine

Design tokens, theme definitions and the CSS custom property projection of the
Nodera UI layer.

The package is framework-agnostic: it holds data and pure functions only — no
React, no DOM, no CSS files.

## Model

- `DesignTokens` — eleven required token groups: `colors`, `spacing`,
  `typography`, `borders`, `shadows`, `icons`, `node`, `edge`, `handle`,
  `selection`, `canvas`. Every group is an open `Record<string, string>`, so a
  host may add its own token keys and they still reach the UI.
- `ThemeDefinition` — `{ id, name, description?, colorScheme?, tokens, metadata? }`,
  frozen by `createTheme`.
- `ThemeRegistry` — the same registry semantics as every Nodera registry:
  duplicate ids are explicit conflicts, unknown ids are explicit not-found
  results, never silent overwrites. It ships `nodera.light` and `nodera.dark`.

## Projection

```ts
import { DEFAULT_THEME, themeToCssVariables } from "@nodera/theme-engine";

themeToCssVariables(DEFAULT_THEME);
// { "--ndr-colors-background": "#f8fafc", "--ndr-node-border-color": "#c7d2e0", ... }
```

- `tokenVariableName(group, key)` — `("node", "borderColorSelected")` →
  `--ndr-node-border-color-selected`.
- `cssVariables(tokens)` — flattens a full token set in group order.
- `mergeDesignTokens(base, patch)` — overrides only patched keys and keeps
  untouched groups by identity.
- `freezeDesignTokens(tokens)` — deep freezes the groups.

The React binding (`@nodera/ui-react`) writes these variables as inline custom
properties on the provider wrapper, which is how theming works without a
stylesheet pipeline: every component style reads `var(--ndr-*, fallback)`.

## Built-in presets

`DEFAULT_THEME_ID` (`nodera.light`), `DARK_THEME_ID` (`nodera.dark`),
`DEFAULT_THEME`, `DARK_THEME`. They cover node/edge/handle/selection/canvas
styles, typography, spacing, borders, shadows and icons.

## Canvas tokens

The `canvas` group describes the surface the canvas paints behind the graph:

| Token | CSS variable | Consumer |
| --- | --- | --- |
| `canvas.background` | `--ndr-canvas-background` | `CanvasContainer` (`@nodera/ui-react`) paints the surface colour |
| `canvas.backgroundDot` | `--ndr-canvas-background-dot` | `canvasBackgroundOptions()` in `@nodera/canvas-react-flow` colours the dot pattern |
| `canvas.backgroundDotSize` | `--ndr-canvas-background-dot-size` | the dot gap, as a numeric string (`"16"` = 16px) |

`canvas.background` and `canvas.backgroundDot` reach the canvas as CSS variable
references, so switching the theme (or overriding the variables in a host
stylesheet) restyles the canvas without re-rendering the adapter. The gap is
the exception: React Flow's `<Background gap>` is a number and a CSS custom
property can never feed a numeric prop, so the adapter keeps the token's value
(`16`) as the documented numeric default in `canvasBackgroundOptions()`.

The former `gridColor` and `gridSize` tokens were removed: nothing consumed them,
and the canvas paints a dot pattern rather than grid lines.

## Scripts

`pnpm --filter @nodera/theme-engine test`, `typecheck`.
