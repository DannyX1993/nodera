/**
 * Vitest setup file for jsdom environment.
 *
 * Polyfills missing browser APIs that @xyflow/react (React Flow v12)
 * depends on but jsdom does not provide by default.
 */

/** Minimal ResizeObserver polyfill for jsdom. */
class ResizeObserverPolyfill {
  callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
  private observers = new Set<Element>();

  constructor(callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.observers.add(target);
    this.callback(
      [
        {
          target,
          contentRect: { width: 0, height: 0, x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, toJSON: () => ({}) },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  }

  unobserve(_target: Element) {
    this.observers.delete(_target);
  }

  disconnect() {
    this.observers.clear();
  }
}

// eslint-disable-next-line no-undef
if (typeof globalThis.ResizeObserver === "undefined") {
  // eslint-disable-next-line no-undef
  globalThis.ResizeObserver = ResizeObserverPolyfill;
}

/** Minimal DOMMatrixReadOnly polyfill for jsdom. */
class DOMMatrixReadOnlyPolyfill {
  readonly a = 1;
  readonly b = 0;
  readonly c = 0;
  readonly d = 0;
  readonly e = 0;
  readonly f = 0;
  readonly m11 = 1;
  readonly m12 = 0;
  readonly m13 = 0;
  readonly m14 = 0;
  readonly m21 = 0;
  readonly m22 = 1;
  readonly m23 = 0;
  readonly m24 = 0;
  readonly m31 = 0;
  readonly m32 = 0;
  readonly m33 = 1;
  readonly m34 = 0;
  readonly m41 = 0;
  readonly m42 = 0;
  readonly m43 = 0;
  readonly m44 = 1;
  readonly is2D = true;
  readonly isIdentity = true;

  multiply(_other?: DOMMatrix): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  flipX(): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  flipY(): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  inverse(): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  rotate(_rotX?: number, _rotY?: number, _rotZ?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  rotateFromVector(_x?: number, _y?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  rotateAxisAngle(_x?: number, _y?: number, _z?: number, _angle?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  scale(_scaleX?: number, _scaleY?: number, _scaleZ?: number, _scaleXOrigin?: number, _scaleYOrigin?: number, _scaleZOrigin?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  scale3d(_scale?: string, _originX?: number, _originY?: number, _originZ?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  skewX(_sX?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  skewY(_sY?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  toFloat32Array(): Float32Array {
    return new Float32Array(16);
  }
  toFloat64Array(): Float64Array {
    return new Float64Array(16);
  }
  transformPoint(_point: DOMPoint): DOMPoint {
    return _point;
  }
  translate(_translateX?: number, _translateY?: number, _translateZ?: number): DOMMatrixReadOnlyPolyfill {
    return this;
  }
  toString(): string {
    return "matrix(1,0,0,1,0,0)";
  }
}

// eslint-disable-next-line no-undef
if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  // eslint-disable-next-line no-undef
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyPolyfill as any;
}

/** Polyfill HTMLCanvasElement for jsdom. */
if (typeof globalThis.HTMLCanvasElement === "undefined") {
  // eslint-disable-next-line no-undef
  globalThis.HTMLCanvasElement = class HTMLCanvasElement {
    getContext(): null {
      return null;
    }
    toDataURL(): string {
      return "";
    }
  } as any;
}