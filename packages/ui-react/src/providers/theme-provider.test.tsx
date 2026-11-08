import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DARK_THEME_ID, DEFAULT_THEME } from "@nodera/theme-engine";

import { ThemeProvider } from "./theme-provider.js";

afterEach(cleanup);

describe("ThemeProvider", () => {
  it("renders its children inside a themed wrapper with the theme variables", () => {
    const { container } = render(
      <ThemeProvider theme={DEFAULT_THEME}>
        <span>child</span>
      </ThemeProvider>,
    );

    const root = container.querySelector<HTMLElement>("[data-nodera-theme]");
    expect(root?.getAttribute("data-nodera-theme")).toBe(DEFAULT_THEME.id);
    expect(root?.getAttribute("data-nodera-color-scheme")).toBe("light");
    expect(root?.style.getPropertyValue("--ndr-colors-background")).toBe("#f8fafc");
    expect(screen.getByText("child")).toBeTruthy();
  });

  it("applies the color scheme hint and an optional class name", () => {
    const { container } = render(
      <ThemeProvider theme={{ ...DEFAULT_THEME, id: DARK_THEME_ID, colorScheme: "dark" }} className="host-theme">
        <span>child</span>
      </ThemeProvider>,
    );

    const root = container.querySelector<HTMLElement>("[data-nodera-theme]");
    expect(root?.getAttribute("data-nodera-theme")).toBe(DARK_THEME_ID);
    expect(root?.getAttribute("data-nodera-color-scheme")).toBe("dark");
    expect(root?.className).toBe("host-theme");
  });
});
