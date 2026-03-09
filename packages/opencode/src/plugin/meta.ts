import path from "path"
import { fileURLToPath } from "url"

import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

import { parsePluginSpecifier } from "./shared"

export namespace PluginMeta {
  type Source = "file" | "npm"

  export type Entry = {
    name: string
    source: Source
    spec: string
    target: string
    requested?: string
    version?: string
    modified?: number
    first_time: number
    last_time: number
    time_changed: number
    load_count: number
    fingerprint: string
  }

  export type State = "first" | "updated" | "same"

  type Store = Record<string, Entry>
  type Core = Omit<Entry, "first_time" | "last_time" | "time_changed" | "load_count" | "fingerprint">

  const cache = {
    ready: false,
    path: "",
    store: {} as Store,
    dirty: false,
  }

  function storePath() {
    return Flag.OPENCODE_PLUGIN_META_FILE ?? path.join(Global.Path.state, "plugin-meta.json")
  }

  function sourceKind(spec: string): Source {
    if (spec.startsWith("file://")) return "file"
    return "npm"
  }

  function entryKey(spec: string) {
    if (spec.startsWith("file://")) return `file:${fileURLToPath(spec)}`
    return `npm:${parsePluginSpecifier(spec).pkg}`
  }

  function entryName(spec: string) {
    if (spec.startsWith("file://")) return path.parse(fileURLToPath(spec)).name
    return parsePluginSpecifier(spec).pkg
  }

  function fileTarget(spec: string, target: string) {
    if (spec.startsWith("file://")) return fileURLToPath(spec)
    if (target.startsWith("file://")) return fileURLToPath(target)
    return
  }

  function modifiedAt(file: string) {
    const stat = Filesystem.stat(file)
    if (!stat) return
    const value = stat.mtimeMs
    return Math.floor(typeof value === "bigint" ? Number(value) : value)
  }

  function resolvedTarget(target: string) {
    if (target.startsWith("file://")) return fileURLToPath(target)
    return target
  }

  async function npmVersion(target: string) {
    const resolved = resolvedTarget(target)
    const stat = Filesystem.stat(resolved)
    const dir = stat?.isDirectory() ? resolved : path.dirname(resolved)
    return Filesystem.readJson<{ version?: string }>(path.join(dir, "package.json"))
      .then((item) => item.version)
      .catch(() => undefined)
  }

  async function entryCore(spec: string, target: string): Promise<Core> {
    const source = sourceKind(spec)
    if (source === "file") {
      const file = fileTarget(spec, target)
      return {
        name: entryName(spec),
        source,
        spec,
        target,
        modified: file ? modifiedAt(file) : undefined,
      }
    }

    return {
      name: entryName(spec),
      source,
      spec,
      target,
      requested: parsePluginSpecifier(spec).version,
      version: await npmVersion(target),
    }
  }

  function fingerprint(value: Core) {
    if (value.source === "file") return [value.target, value.modified ?? ""].join("|")
    return [value.target, value.requested ?? "", value.version ?? ""].join("|")
  }

  async function load() {
    const next = storePath()
    if (cache.ready && cache.path === next) return
    cache.path = next
    cache.store = await Filesystem.readJson<Store>(next).catch(() => ({}) as Store)
    cache.dirty = false
    cache.ready = true
  }

  export async function touch(spec: string, target: string): Promise<{ state: State; entry: Entry }> {
    await load()
    const now = Date.now()
    const id = entryKey(spec)
    const prev = cache.store[id]
    const core = await entryCore(spec, target)
    const entry: Entry = {
      ...core,
      first_time: prev?.first_time ?? now,
      last_time: now,
      time_changed: prev?.time_changed ?? now,
      load_count: (prev?.load_count ?? 0) + 1,
      fingerprint: fingerprint(core),
    }

    const state: State = !prev ? "first" : prev.fingerprint === entry.fingerprint ? "same" : "updated"
    if (state === "updated") entry.time_changed = now

    cache.store[id] = entry
    cache.dirty = true
    return {
      state,
      entry,
    }
  }

  export async function persist() {
    await load()
    if (!cache.dirty) return
    await Filesystem.writeJson(cache.path, cache.store)
    cache.dirty = false
  }

  export async function list(): Promise<Store> {
    await load()
    return { ...cache.store }
  }
}
