import { describe, expect, it } from "vitest";
import { SUPPORTED_FEATURES, resolveFeatures } from "./features.js";

describe("resolveFeatures", () => {
  it("enables every supported feature when the host declares none", () => {
    const result = resolveFeatures();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(SUPPORTED_FEATURES).toEqual(["minimap", "history", "validation"]);
    expect(result.value).toEqual({ minimap: true, history: true, validation: true });
  });

  it("keeps the flags the host declares for supported features", () => {
    const result = resolveFeatures({ minimap: false, validation: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ minimap: false, history: true, validation: false });
  });

  it("rejects an enabled feature the SDK does not implement", () => {
    const result = resolveFeatures({ grouping: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toMatchObject({
      code: "sdk.feature-unsupported",
      severity: "error",
      path: ["features", "grouping"],
    });
  });

  it("accepts a disabled feature the SDK does not implement", () => {
    const result = resolveFeatures({ grouping: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ minimap: true, history: true, validation: true });
    expect(Object.keys(result.value).sort()).toEqual([...SUPPORTED_FEATURES].sort());
  });

  it("reports every unsupported enabled feature at once", () => {
    const result = resolveFeatures({ grouping: true, execution: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((issue) => issue.path)).toEqual([
      ["features", "grouping"],
      ["features", "execution"],
    ]);
  });
});
