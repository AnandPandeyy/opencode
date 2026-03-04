import {
  type TuiPlugin as TuiPluginFn,
  type TuiPluginInput,
  type TuiPluginModule,
  type TuiSlotContext,
  type TuiSlotMap,
  type TuiSlotPlugin,
  type TuiSlots,
} from "@opencode-ai/plugin/tui"
import { createSlot, createSolidSlotRegistry, type SolidPlugin } from "@opentui/solid"
import type { CliRenderer } from "@opentui/core"
import type { JSX } from "solid-js"
import "@opentui/solid/preload"

import { Config } from "@/config/config"
import { TuiConfig } from "@/config/tui"
import { Log } from "@/util/log"
import { BunProc } from "@/bun"
import { Instance } from "@/project/instance"
import { registerThemes } from "./context/theme"

type Slot = <K extends keyof TuiSlotMap>(props: { name: K } & TuiSlotMap[K]) => unknown

function empty<K extends keyof TuiSlotMap>(_props: { name: K } & TuiSlotMap[K]) {
  return null
}

export namespace TuiPlugin {
  const log = Log.create({ service: "tui.plugin" })
  let loaded: Promise<void> | undefined
  let view: Slot = empty

  export const Slot: Slot = (props) => view(props)

  export function slots(renderer: CliRenderer): TuiSlots {
    const reg = createSolidSlotRegistry<TuiSlotMap, TuiSlotContext>(
      renderer,
      {},
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
      register(plugin) {
        console.error("[tui.slot] register", plugin.id)
        return reg.register(plugin as SolidPlugin<TuiSlotMap, TuiSlotContext>)
      },
    }
  }

  export async function init(input: TuiPluginInput) {
    if (loaded) return loaded
    loaded = load(input)
    return loaded
  }

  async function resolve(spec: string) {
    if (spec.startsWith("file://")) return spec
    const lastAtIndex = spec.lastIndexOf("@")
    const pkg = lastAtIndex > 0 ? spec.substring(0, lastAtIndex) : spec
    const version = lastAtIndex > 0 ? spec.substring(lastAtIndex + 1) : "latest"
    return BunProc.install(pkg, version)
  }

  function pick(entry: unknown) {
    if (!entry || typeof entry !== "object") return
    if ("id" in entry && typeof entry.id === "string" && "slots" in entry && typeof entry.slots === "object") {
      return entry as TuiSlotPlugin<JSX.Element>
    }
    if (!("slots" in entry)) return
    const value = entry.slots
    if (!value || typeof value !== "object") return
    if (!("id" in value) || typeof value.id !== "string") return
    if (!("slots" in value) || typeof value.slots !== "object") return
    return value as TuiSlotPlugin<JSX.Element>
  }

  async function load(input: TuiPluginInput) {
    const dir = process.cwd()

    await Instance.provide({
      directory: dir,
      fn: async () => {
        const config = await TuiConfig.get()
        const plugins = config.plugin ?? []
        if (plugins.length) await TuiConfig.waitForDependencies()

        for (const item of plugins) {
          const spec = Config.pluginSpecifier(item)
          log.info("loading tui plugin", { path: spec })
          const target = await resolve(spec).catch((error) => {
            log.error("failed to resolve tui plugin", { path: spec, error })
            return
          })
          if (!target) continue

          const mod = await import(target).catch((error) => {
            log.error("failed to load tui plugin", { path: spec, error })
            return
          })
          if (!mod) continue

          const seen = new Set<unknown>()
          for (const [name, entry] of Object.entries(mod)) {
            if (seen.has(entry)) continue
            seen.add(entry)
            if (!entry || typeof entry !== "object") {
              log.warn("ignoring non-object tui plugin export", {
                path: spec,
                name,
                type: entry === null ? "null" : typeof entry,
              })
              continue
            }

            const pluginEntry = entry as TuiPluginModule
            if (pluginEntry.themes && typeof pluginEntry.themes === "object") {
              registerThemes(pluginEntry.themes as Record<string, unknown>)
            }

            const plugin = pick(pluginEntry)
            if (plugin) {
              input.slots.register(plugin)
            }

            if (!pluginEntry.tui || typeof pluginEntry.tui !== "function") continue
            await (pluginEntry.tui as TuiPluginFn)(input, Config.pluginOptions(item))
          }
        }
      },
    }).catch((error) => {
      log.error("failed to load tui plugins", { directory: dir, error })
    })
  }
}
