import type { ReactNode } from "react";

import type { ThemeDefinition } from "@nodera/theme-engine";

import { themeStyle } from "../theme-style.js";

/** Props accepted by {@link ThemeProvider}. */
export interface ThemeProviderProps {
  readonly theme: ThemeDefinition;
  readonly children: ReactNode;
  /** Optional class name for host styling of the theme wrapper. */
  readonly className?: string;
}

/**
 * Applies a theme to its subtree without any provider or store.
 *
 * The wrapper carries the theme id, the color-scheme hint and the `--ndr-*`
 * custom properties (D2), so nested themes work and a host may use it exactly
 * where it needs a different visual identity.
 */
export function ThemeProvider(props: ThemeProviderProps): ReactNode {
  const { theme, children, className } = props;
  return (
    <div
      data-nodera-theme={theme.id}
      data-nodera-color-scheme={theme.colorScheme}
      style={themeStyle(theme)}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </div>
  );
}
