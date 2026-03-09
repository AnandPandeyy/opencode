import type { ParsedKey } from "@opentui/core"

export type PluginKeybindMap = Record<string, string>

type Base<Info> = {
  parse: (evt: ParsedKey) => Info
  match: (key: string, evt: ParsedKey) => boolean
  print: (key: string) => string
}

export type PluginKeybind<Info> = {
  readonly all: PluginKeybindMap
  get: (name: string) => string
  parse: (evt: ParsedKey) => Info
  match: (name: string, evt: ParsedKey) => boolean
  print: (name: string) => string
}

const txt = (value: unknown) => {
  if (typeof value !== "string") return
  if (!value.trim()) return
  return value
}

export function createPluginKeybind<Info>(
  base: Base<Info>,
  defaults: PluginKeybindMap,
  overrides?: Record<string, unknown>,
): PluginKeybind<Info> {
  const all = Object.freeze(
    Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, txt(overrides?.[name]) ?? value])),
  ) as PluginKeybindMap
  const get = (name: string) => all[name] ?? name

  return {
    get all() {
      return all
    },
    get,
    parse: (evt) => base.parse(evt),
    match: (name, evt) => base.match(get(name), evt),
    print: (name) => base.print(get(name)),
  }
}
