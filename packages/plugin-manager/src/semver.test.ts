import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isValidVersion,
  parseVersion,
  parseVersionRange,
  satisfiesRange,
  type SemverVersion,
} from "./semver.js";

function version(value: string): SemverVersion {
  const parsed = parseVersion(value);
  if (parsed === undefined) throw new Error(`expected a valid test version: ${value}`);
  return parsed;
}

describe("isValidVersion", () => {
  it("accepts major.minor.patch versions", () => {
    expect(isValidVersion("0.0.0")).toBe(true);
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("12.34.56")).toBe(true);
  });

  it("accepts versions with a prerelease suffix", () => {
    expect(isValidVersion("1.0.0-beta")).toBe(true);
    expect(isValidVersion("1.0.0-beta.1")).toBe(true);
    expect(isValidVersion("1.0.0-rc-1")).toBe(true);
  });

  it("rejects malformed versions", () => {
    expect(isValidVersion("1.0")).toBe(false);
    expect(isValidVersion("1")).toBe(false);
    expect(isValidVersion("1.0.0.0")).toBe(false);
    expect(isValidVersion("v1.0.0")).toBe(false);
    expect(isValidVersion("1.0.0-beta+exp.sha.5114f85")).toBe(false);
    expect(isValidVersion("01.0.0")).toBe(false);
    expect(isValidVersion("1.0.0-")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidVersion(1)).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
    expect(isValidVersion(null)).toBe(false);
    expect(isValidVersion({})).toBe(false);
  });
});

describe("parseVersion", () => {
  it("parses the numeric tuple of a release version", () => {
    expect(parseVersion("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
  });

  it("parses prerelease identifiers in order", () => {
    expect(parseVersion("2.0.1-rc.2")).toEqual({
      major: 2,
      minor: 0,
      patch: 1,
      prerelease: ["rc", "2"],
    });
  });

  it("returns undefined for an unparseable version", () => {
    expect(parseVersion("1.0")).toBeUndefined();
    expect(parseVersion("nope")).toBeUndefined();
  });
});

describe("compareVersions", () => {
  it("orders release versions numerically", () => {
    expect(compareVersions(version("1.0.0"), version("1.0.0"))).toBe(0);
    expect(compareVersions(version("1.0.0"), version("1.0.1"))).toBeLessThan(0);
    expect(compareVersions(version("1.1.0"), version("1.0.9"))).toBeGreaterThan(0);
    expect(compareVersions(version("2.0.0"), version("1.9.9"))).toBeGreaterThan(0);
  });

  it("orders a prerelease below its release", () => {
    expect(compareVersions(version("1.0.0-alpha"), version("1.0.0"))).toBeLessThan(0);
  });

  it("orders prerelease identifiers with semver precedence", () => {
    expect(compareVersions(version("1.0.0-alpha"), version("1.0.0-alpha.1"))).toBeLessThan(0);
    expect(compareVersions(version("1.0.0-alpha.1"), version("1.0.0-alpha.beta"))).toBeLessThan(0);
    expect(compareVersions(version("1.0.0-1"), version("1.0.0-alpha"))).toBeLessThan(0);
    expect(compareVersions(version("1.0.0-alpha"), version("1.0.0-beta"))).toBeLessThan(0);
  });
});

describe("parseVersionRange", () => {
  it("treats an absent range as any", () => {
    expect(parseVersionRange(undefined)).toEqual({ kind: "any" });
  });

  it("treats a star range as any", () => {
    expect(parseVersionRange("*")).toEqual({ kind: "any" });
  });

  it("parses an exact version range", () => {
    expect(parseVersionRange("1.2.3")).toEqual({ kind: "exact", version: version("1.2.3") });
  });

  it("parses caret and tilde ranges", () => {
    expect(parseVersionRange("^1.2.3")).toEqual({ kind: "caret", version: version("1.2.3") });
    expect(parseVersionRange("~1.2.3")).toEqual({ kind: "tilde", version: version("1.2.3") });
  });

  it("rejects range operators outside the supported grammar", () => {
    expect(parseVersionRange("")).toBeUndefined();
    expect(parseVersionRange(">=1.0.0")).toBeUndefined();
    expect(parseVersionRange(">1.0.0")).toBeUndefined();
    expect(parseVersionRange("1.x")).toBeUndefined();
    expect(parseVersionRange("1.0")).toBeUndefined();
    expect(parseVersionRange("^1.0")).toBeUndefined();
    expect(parseVersionRange("1.0.0 - 2.0.0")).toBeUndefined();
    expect(parseVersionRange("1.0.0 || 2.0.0")).toBeUndefined();
    expect(parseVersionRange(" ^1.0.0")).toBeUndefined();
    expect(parseVersionRange("^")).toBeUndefined();
  });
});

describe("satisfiesRange", () => {
  it("accepts any valid version for an absent or star range", () => {
    expect(satisfiesRange("1.2.3", undefined)).toBe(true);
    expect(satisfiesRange("9.9.9", "*")).toBe(true);
    expect(satisfiesRange("1.0.0-alpha", "*")).toBe(true);
  });

  it("matches an exact range only for that version", () => {
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
    expect(satisfiesRange("1.2.3-beta", "1.2.3")).toBe(false);
  });

  it("matches a caret range within the same major", () => {
    expect(satisfiesRange("1.2.3", "^1.2.3")).toBe(true);
    expect(satisfiesRange("1.9.9", "^1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.2", "^1.2.3")).toBe(false);
    expect(satisfiesRange("2.0.0", "^1.2.3")).toBe(false);
  });

  it("applies D9 caret semantics literally: same major, with no npm 0.x minor lock", () => {
    expect(satisfiesRange("0.3.0", "^0.2.1")).toBe(true);
    expect(satisfiesRange("0.1.9", "^0.2.1")).toBe(false);
    expect(satisfiesRange("1.0.0", "^0.2.1")).toBe(false);
  });

  it("matches a tilde range within the same minor", () => {
    expect(satisfiesRange("1.2.3", "~1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.2", "~1.2.3")).toBe(false);
    expect(satisfiesRange("1.3.0", "~1.2.3")).toBe(false);
  });

  it("does not accept a prerelease of a different tuple", () => {
    expect(satisfiesRange("1.2.3-beta", "^1.2.0")).toBe(false);
    expect(satisfiesRange("1.2.4-alpha", "^1.2.3")).toBe(false);
  });

  it("accepts prerelease versions only when the range opts in with the same tuple", () => {
    expect(satisfiesRange("1.2.3-beta", "^1.2.3-beta")).toBe(true);
    expect(satisfiesRange("1.2.3-beta.2", "^1.2.3-beta")).toBe(true);
    expect(satisfiesRange("1.2.3-beta", "~1.2.3-beta")).toBe(true);
    expect(satisfiesRange("1.2.4-alpha", "^1.2.3-beta")).toBe(false);
    expect(satisfiesRange("1.2.3-alpha", "^1.2.3-beta")).toBe(false);
  });

  it("is false for an invalid version or an invalid range instead of throwing", () => {
    expect(satisfiesRange("1.0", "^1.0.0")).toBe(false);
    expect(satisfiesRange("1.0.0", ">=1.0.0")).toBe(false);
  });
});
