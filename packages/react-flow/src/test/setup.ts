/**
 * Vitest setup file for the jsdom environment.
 *
 * Three things are needed here, and only three:
 *
 * 1. React's act environment flag, because `@testing-library/react` runs
 *    without a test-runner-provided global.
 * 2. A `PointerEvent` stand-in: jsdom 26 ships none, so `fireEvent.pointer*`
 *    would create a plain `Event` and drop the coordinates the shell maths
 *    reads. `MouseEvent` already carries `clientX`/`clientY`.
 * 3. The browser APIs the graph engine relies on and jsdom does not implement.
 *    The SDK binding of this package reaches the engine through the canvas
 *    layer next door, and the editor renders a real canvas, so the polyfills the
 *    canvas layer needs are required here too. They are test infrastructure, not
 *    a source dependency: no product module touches them.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.PointerEvent !== "function") {
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    writable: true,
    value: class TestPointerEvent extends MouseEvent {},
  });
}

/** Zero-sized entry the polyfill reports, matching an unmeasured jsdom element. */
function unmeasuredEntry(target: Element): ResizeObserverEntry {
  return {
    target,
    contentRect: {
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
    },
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  };
}

/** Minimal `ResizeObserver` for jsdom. */
class ResizeObserverPolyfill implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.observed.add(target);
    this.callback([unmeasuredEntry(target)], this);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverPolyfill;
}

/**
 * Minimal identity `DOMMatrixReadOnly` for jsdom.
 *
 * Installed through `defineProperty` because it implements only the transforms
 * the engine performs during pointer maths; the full DOM interface is neither
 * available nor needed in a headless test.
 */
const identityMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  m11: 1,
  m12: 0,
  m13: 0,
  m14: 0,
  m21: 0,
  m22: 1,
  m23: 0,
  m24: 0,
  m31: 0,
  m32: 0,
  m33: 1,
  m34: 0,
  m41: 0,
  m42: 0,
  m43: 0,
  m44: 1,
  is2D: true,
  isIdentity: true,
  multiply: () => identityMatrix,
  inverse: () => identityMatrix,
  translate: () => identityMatrix,
  scale: () => identityMatrix,
  rotate: () => identityMatrix,
  transformPoint: (point: DOMPoint) => point,
  toString: () => "matrix(1,0,0,1,0,0)",
};

if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  Object.defineProperty(globalThis, "DOMMatrixReadOnly", {
    value: function DOMMatrixReadOnlyPolyfill(): typeof identityMatrix {
      return identityMatrix;
    },
    configurable: true,
    writable: true,
  });
}
