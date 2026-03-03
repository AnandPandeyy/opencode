type TuiJSXFactory = (...args: unknown[]) => unknown

export type TuiJSXRuntime = {
  Fragment: unknown
  jsx: TuiJSXFactory
  jsxs: TuiJSXFactory
  jsxDEV?: TuiJSXFactory
}

const key = Symbol.for("opencode.tui.jsx-runtime")

export function setTuiJSXRuntime(runtime: TuiJSXRuntime) {
  ;(globalThis as Record<PropertyKey, unknown>)[key] = runtime
}

export function getTuiJSXRuntime() {
  const runtime = (globalThis as Record<PropertyKey, unknown>)[key]
  if (!runtime || typeof runtime !== "object") {
    throw new Error("OpenCode TUI JSX runtime has not been initialized")
  }
  const jsx = (runtime as Record<string, unknown>).jsx
  const jsxs = (runtime as Record<string, unknown>).jsxs
  if (typeof jsx !== "function" || typeof jsxs !== "function") {
    throw new Error("OpenCode TUI JSX runtime has invalid factories")
  }
  return runtime as TuiJSXRuntime
}
