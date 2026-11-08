/**
 * Vitest setup file for the jsdom environment.
 *
 * ui-react never renders React Flow, so no canvas or matrix polyfills are
 * needed here: only React's act environment flag has to be declared, because
 * `@testing-library/react` runs without a test-runner-provided global.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
