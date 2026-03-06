import { expect, mock, spyOn, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { CliRenderer } from "@opentui/core"
import { tmpdir } from "../../fixture/fixture"
import { Log } from "../../../src/util/log"
import { Global } from "../../../src/global"

mock.module("@opentui/solid/preload", () => ({}))
mock.module("@opentui/solid/jsx-runtime", () => ({
  Fragment: Symbol.for("Fragment"),
  jsx: () => null,
  jsxs: () => null,
  jsxDEV: () => null,
}))
const { allThemes } = await import("../../../src/cli/cmd/tui/context/theme")
const { TuiPlugin } = await import("../../../src/cli/cmd/tui/plugin")

async function waitForLog(text: string, timeout = 1000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const file = Log.file()
    if (file) {
      const content = await Bun.file(file)
        .text()
        .catch(() => "")
      if (content.includes(text)) return content
    }
    await Bun.sleep(25)
  }
  return Bun.file(Log.file())
    .text()
    .catch(() => "")
}

test("loads plugin theme API with scoped theme installation", async () => {
  const stamp = Date.now()
  const globalConfigPath = path.join(Global.Path.config, "tui.json")
  const backup = await Bun.file(globalConfigPath)
    .text()
    .catch(() => undefined)

  await using tmp = await tmpdir({
    init: async (dir) => {
      const localPluginPath = path.join(dir, "local-plugin.ts")
      const globalPluginPath = path.join(dir, "global-plugin.ts")
      const localThemeFile = `local-theme-${stamp}.json`
      const globalThemeFile = `global-theme-${stamp}.json`
      const localThemeName = localThemeFile.replace(/\.json$/, "")
      const globalThemeName = globalThemeFile.replace(/\.json$/, "")
      const localThemePath = path.join(dir, localThemeFile)
      const globalThemePath = path.join(dir, globalThemeFile)
      const localDest = path.join(dir, ".opencode", "themes", localThemeFile)
      const globalDest = path.join(Global.Path.config, "themes", globalThemeFile)
      const fnMarker = path.join(dir, "function-called.txt")
      const localMarker = path.join(dir, "local-called.json")
      const globalMarker = path.join(dir, "global-called.json")
      const localConfigPath = path.join(dir, "tui.json")

      await Bun.write(localThemePath, JSON.stringify({ theme: { primary: "#101010" } }, null, 2))
      await Bun.write(globalThemePath, JSON.stringify({ theme: { primary: "#202020" } }, null, 2))

      await Bun.write(
        localPluginPath,
        `export default async (_input, options) => {
  if (!options?.fn_marker) return
  await Bun.write(options.fn_marker, "called")
}

export const object_plugin = {
  tui: async (input, options) => {
    if (!options?.marker) return
    const before = input.api.theme.has(options.theme_name)
    const set_missing = input.api.theme.set(options.theme_name)
    await input.api.theme.install(options.theme_path)
    const after = input.api.theme.has(options.theme_name)
    const set_installed = input.api.theme.set(options.theme_name)
    const first = await Bun.file(options.dest).text()
    await Bun.write(options.source, JSON.stringify({ theme: { primary: "#fefefe" } }, null, 2))
    await input.api.theme.install(options.theme_path)
    const second = await Bun.file(options.dest).text()
    await Bun.write(
      options.marker,
      JSON.stringify({ before, set_missing, after, set_installed, selected: input.api.theme.selected, same: first === second }),
    )
  },
}
`,
      )

      await Bun.write(
        globalPluginPath,
        `export default {
  tui: async (input, options) => {
    if (!options?.marker) return
    await input.api.theme.install(options.theme_path)
    const has = input.api.theme.has(options.theme_name)
    const set_installed = input.api.theme.set(options.theme_name)
    await Bun.write(options.marker, JSON.stringify({ has, set_installed, selected: input.api.theme.selected }))
  },
}
`,
      )

      await Bun.write(
        globalConfigPath,
        JSON.stringify(
          {
            plugin: [
              [
                pathToFileURL(globalPluginPath).href,
                { marker: globalMarker, theme_path: `./${globalThemeFile}`, theme_name: globalThemeName },
              ],
            ],
          },
          null,
          2,
        ),
      )

      await Bun.write(
        localConfigPath,
        JSON.stringify(
          {
            plugin: [
              [
                pathToFileURL(localPluginPath).href,
                {
                  fn_marker: fnMarker,
                  marker: localMarker,
                  source: localThemePath,
                  dest: localDest,
                  theme_path: `./${localThemeFile}`,
                  theme_name: localThemeName,
                },
              ],
            ],
          },
          null,
          2,
        ),
      )

      return {
        localThemeFile,
        globalThemeFile,
        localThemeName,
        globalThemeName,
        localDest,
        globalDest,
        fnMarker,
        localMarker,
        globalMarker,
      }
    },
  })

  const cwd = spyOn(process, "cwd").mockImplementation(() => tmp.path)
  let selected = "opencode"

  const renderer = {
    ...Object.create(null),
    once(this: CliRenderer) {
      return this
    },
  } satisfies CliRenderer

  try {
    await TuiPlugin.init({
      client: createOpencodeClient({
        baseUrl: "http://localhost:4096",
      }),
      event: {
        on: () => () => {},
      },
      renderer,
      api: {
        command: {
          register: () => {},
          trigger: () => {},
        },
        route: {
          register: () => () => {},
          navigate: () => {},
          get current() {
            return { name: "home" as const }
          },
        },
        ui: {
          Dialog: () => null,
          DialogAlert: () => null,
          DialogConfirm: () => null,
          DialogPrompt: () => null,
          DialogSelect: () => null,
          toast: () => {},
        },
        keybind: {
          parse: () => ({
            name: "",
            ctrl: false,
            meta: false,
            shift: false,
            leader: false,
          }),
          match: () => false,
          print: () => "",
        },
        theme: {
          get current() {
            return {}
          },
          get selected() {
            return selected
          },
          has(name) {
            return allThemes()[name] !== undefined
          },
          set(name) {
            if (!allThemes()[name]) return false
            selected = name
            return true
          },
          async install() {
            throw new Error("base theme.install should not run")
          },
          mode() {
            return "dark" as const
          },
          get ready() {
            return true
          },
        },
      },
    })

    const local = JSON.parse(await fs.readFile(tmp.extra.localMarker, "utf8"))
    expect(local.before).toBe(false)
    expect(local.set_missing).toBe(false)
    expect(local.after).toBe(true)
    expect(local.set_installed).toBe(true)
    expect(local.selected).toBe(tmp.extra.localThemeName)
    expect(local.same).toBe(true)

    const global = JSON.parse(await fs.readFile(tmp.extra.globalMarker, "utf8"))
    expect(global.has).toBe(true)
    expect(global.set_installed).toBe(true)
    expect(global.selected).toBe(tmp.extra.globalThemeName)

    await expect(fs.readFile(tmp.extra.fnMarker, "utf8")).rejects.toThrow()

    const localInstalled = await fs.readFile(tmp.extra.localDest, "utf8")
    expect(localInstalled).toContain("#101010")
    expect(localInstalled).not.toContain("#fefefe")

    const globalInstalled = await fs.readFile(tmp.extra.globalDest, "utf8")
    expect(globalInstalled).toContain("#202020")

    expect(
      await fs
        .stat(path.join(Global.Path.config, "themes", tmp.extra.localThemeFile))
        .then(() => true)
        .catch(() => false),
    ).toBe(false)
    expect(
      await fs
        .stat(path.join(tmp.path, ".opencode", "themes", tmp.extra.globalThemeFile))
        .then(() => true)
        .catch(() => false),
    ).toBe(false)

    const log = await waitForLog("ignoring non-object tui plugin export")
    expect(log).toContain("ignoring non-object tui plugin export")
    expect(log).toContain("name=default")
    expect(log).toContain("type=function")
  } finally {
    cwd.mockRestore()
    if (backup === undefined) {
      await fs.rm(globalConfigPath, { force: true })
    } else {
      await Bun.write(globalConfigPath, backup)
    }
    await fs.rm(tmp.extra.globalDest, { force: true }).catch(() => {})
  }
})
