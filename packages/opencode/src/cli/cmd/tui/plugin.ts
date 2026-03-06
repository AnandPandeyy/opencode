import {
  type TuiPlugin as TuiPluginFn,
  type TuiPluginInput,
  type TuiSlotContext,
  type TuiSlotMap,
  type TuiSlots,
  type SlotMode,
  type TuiApi,
} from "@opencode-ai/plugin/tui"
import { createSlot, createSolidSlotRegistry, type JSX, type SolidPlugin } from "@opentui/solid"
import type { CliRenderer } from "@opentui/core"
import "@opentui/solid/preload"
import path from "path"
import { fileURLToPath } from "url"

import { Config } from "@/config/config"
import { TuiConfig } from "@/config/tui"
import { Log } from "@/util/log"
import { isRecord } from "@/util/record"
import { Instance } from "@/project/instance"
import { resolvePluginTarget, uniqueModuleEntries } from "@/plugin/shared"
import { addTheme, hasTheme } from "./context/theme"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

type SlotProps<K extends keyof TuiSlotMap> = {
  name: K
  mode?: SlotMode
  children?: JSX.Element
} & TuiSlotMap[K]

type Slot = <K extends keyof TuiSlotMap>(props: SlotProps<K>) => JSX.Element | null
type InitInput = Omit<TuiPluginInput<CliRenderer>, "slots">

function empty<K extends keyof TuiSlotMap>(_props: SlotProps<K>) {
  return null
}

function isTuiSlotPlugin(value: unknown): value is SolidPlugin<TuiSlotMap, TuiSlotContext> {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string") return false
  if (!isRecord(value.slots)) return false
  return true
}

function getTuiSlotPlugin(value: unknown) {
  if (isTuiSlotPlugin(value)) return value
  if (!isRecord(value)) return
  if (!isTuiSlotPlugin(value.slots)) return
  return value.slots
}

function isTuiPlugin(value: unknown): value is TuiPluginFn<CliRenderer> {
  return typeof value === "function"
}

function getTuiPlugin(value: unknown) {
  if (!isRecord(value) || !("tui" in value)) return
  if (!isTuiPlugin(value.tui)) return
  return value.tui
}

function isTheme(value: unknown) {
  if (!isRecord(value)) return false
  if (!isRecord(value.theme)) return false
  return true
}

function localThemeDir(file: string) {
  const dir = path.dirname(file)
  if (path.basename(dir) === ".opencode") return path.join(dir, "themes")
  return path.join(dir, ".opencode", "themes")
}

function themeDir(meta?: TuiConfig.PluginMeta) {
  if (meta?.scope === "local") return localThemeDir(meta.source)
  return path.join(Global.Path.config, "themes")
}

function pluginDir(spec: string, target: string) {
  if (spec.startsWith("file://")) return path.dirname(fileURLToPath(spec))
  if (target.startsWith("file://")) return path.dirname(fileURLToPath(target))
  return target
}

function themePath(root: string, filepath: string) {
  if (filepath.startsWith("file://")) return fileURLToPath(filepath)
  if (path.isAbsolute(filepath)) return filepath
  return path.resolve(root, filepath)
}

function themeName(filepath: string) {
  return path.basename(filepath, path.extname(filepath))
}

function themeApi(
  api: TuiApi<JSX.Element>,
  options: {
    root: string
    meta?: TuiConfig.PluginMeta
  },
) {
  return {
    get current() {
      return api.theme.current
    },
    get selected() {
      return api.theme.selected
    },
    mode() {
      return api.theme.mode()
    },
    get ready() {
      return api.theme.ready
    },
    has(name: string) {
      return api.theme.has(name)
    },
    set(name: string) {
      return api.theme.set(name)
    },
    async install(filepath: string) {
      const source = themePath(options.root, filepath)
      const name = themeName(source)
      if (hasTheme(name)) return

      const text = await Bun.file(source)
        .text()
        .catch((error) => {
          throw new Error(`failed to read theme at ${source}: ${error}`)
        })
      const data = JSON.parse(text)
      if (!isTheme(data)) {
        throw new Error(`invalid theme at ${source}`)
      }

      const dest = path.join(themeDir(options.meta), `${name}.json`)
      if (!(await Filesystem.exists(dest))) {
        await Filesystem.write(dest, text)
      }

      addTheme(name, data)
    },
  }
}

export namespace TuiPlugin {
  const log = Log.create({ service: "tui.plugin" })
  let loaded: Promise<void> | undefined
  let view: Slot = empty

  export const Slot: Slot = (props) => view(props)

  function setupSlots(input: InitInput): TuiSlots {
    const reg = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(
      input.renderer,
      {
        theme: input.api.theme,
      },
      {
        onPluginError(event) {
          console.error("[tui.slot] plugin error", {
            plugin: event.pluginId,
            slot: event.slot,
            phase: event.phase,
            source: event.source,
            message: event.error.message,
          })
        },
      },
    )

    const slot = createSlot<TuiSlotMap, TuiSlotContext>(reg)
    view = (props) => slot(props)
    return {
      register(pluginSlot) {
        if (!isTuiSlotPlugin(pluginSlot)) return () => {}
        return reg.register(pluginSlot)
      },
    }
  }

  export async function init(input: InitInput) {
    if (loaded) return loaded
    loaded = load({
      ...input,
      slots: setupSlots(input),
    })
    return loaded
  }

  async function load(input: TuiPluginInput<CliRenderer>) {
    const dir = process.cwd()

    await Instance.provide({
      directory: dir,
      fn: async () => {
        const config = await TuiConfig.get()
        const plugins = config.plugin ?? []
        let deps: Promise<void> | undefined
        const wait = async () => {
          if (deps) {
            await deps
            return
          }
          deps = TuiConfig.waitForDependencies().catch((error) => {
            log.warn("failed waiting for tui plugin dependencies", { error })
          })
          await deps
        }

        const loadOne = async (item: (typeof plugins)[number], retry = false) => {
          const spec = Config.pluginSpecifier(item)
          const meta = config.plugin_meta?.[Config.getPluginName(item)]
          log.info("loading tui plugin", { path: spec, retry })
          const target = await resolvePluginTarget(spec).catch((error) => {
            log.error("failed to resolve tui plugin", { path: spec, retry, error })
            return
          })
          if (!target) return false

          const mod = await import(target).catch((error) => {
            log.error("failed to load tui plugin", { path: spec, retry, error })
            return
          })
          if (!mod) return false

          for (const [name, entry] of uniqueModuleEntries(mod)) {
            if (!entry || typeof entry !== "object") {
              log.warn("ignoring non-object tui plugin export", {
                path: spec,
                name,
                type: entry === null ? "null" : typeof entry,
              })
              continue
            }

            const slotPlugin = getTuiSlotPlugin(entry)
            if (slotPlugin) input.slots.register(slotPlugin)

            const tuiPlugin = getTuiPlugin(entry)
            if (!tuiPlugin) continue
            const root = pluginDir(spec, target)
            await tuiPlugin(
              {
                ...input,
                api: {
                  command: input.api.command,
                  route: input.api.route,
                  ui: input.api.ui,
                  keybind: input.api.keybind,
                  theme: themeApi(input.api, { root, meta }),
                },
              },
              Config.pluginOptions(item),
            )
          }

          return true
        }

        for (const item of plugins) {
          const ok = await loadOne(item)
          if (ok) continue

          const spec = Config.pluginSpecifier(item)
          if (!spec.startsWith("file://")) continue

          await wait()
          await loadOne(item, true)
        }
      },
    }).catch((error) => {
      log.error("failed to load tui plugins", { directory: dir, error })
    })
  }
}
