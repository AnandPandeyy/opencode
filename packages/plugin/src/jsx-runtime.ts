import { getTuiJSXRuntime } from "./jsx"

const runtime = getTuiJSXRuntime()

export const Fragment = runtime.Fragment
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
