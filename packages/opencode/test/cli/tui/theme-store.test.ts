import { expect, mock, test } from "bun:test"

mock.module("@opentui/solid/jsx-runtime", () => ({
  Fragment: Symbol.for("Fragment"),
  jsx: () => null,
  jsxs: () => null,
  jsxDEV: () => null,
}))

const { DEFAULT_THEMES, allThemes, registerThemes } = await import("../../../src/cli/cmd/tui/context/theme")

test("registerThemes writes into module theme store", () => {
  const name = `plugin-theme-${Date.now()}`
  registerThemes({
    [name]: DEFAULT_THEMES.opencode,
  })

  expect(allThemes()[name]).toBeDefined()
})

test("registerThemes keeps first theme for duplicate names", () => {
  const name = `plugin-theme-keep-${Date.now()}`
  const one = structuredClone(DEFAULT_THEMES.opencode)
  const two = structuredClone(DEFAULT_THEMES.opencode)
  ;(one.theme as Record<string, unknown>).primary = "#101010"
  ;(two.theme as Record<string, unknown>).primary = "#fefefe"

  registerThemes({ [name]: one })
  registerThemes({ [name]: two })

  expect(allThemes()[name]).toBeDefined()
  expect(allThemes()[name]!.theme.primary).toBe("#101010")
})

test("registerThemes ignores entries without a theme object", () => {
  const name = `plugin-theme-invalid-${Date.now()}`
  registerThemes({ [name]: { defs: { a: "#ffffff" } } })
  expect(allThemes()[name]).toBeUndefined()
})
