/**
 * The semantic version of this `@nodera/sdk` release.
 *
 * A plugin manifest declares `compatibility.sdkVersion` as a range against this
 * value, and the plugin manager resolves it against this constant by default
 * (Fase 8, D5): a host that does not pin a different SDK version is assumed to
 * run exactly this one, so the compatibility gate is real by default.
 */
export const SDK_VERSION = "1.0.0";
