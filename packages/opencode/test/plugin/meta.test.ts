import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"

import { tmpdir } from "../fixture/fixture"

const { PluginMeta } = await import("../../src/plugin/meta")

afterEach(() => {
  delete process.env.OPENCODE_PLUGIN_META_FILE
})

describe("plugin.meta", () => {
  test("tracks file plugin loads and changes", async () => {
    await using tmp = await tmpdir<{ file: string }>({
      init: async (dir) => {
        const file = path.join(dir, "plugin.ts")
        await Bun.write(file, "export default async () => ({})\n")
        return { file }
      },
    })

    process.env.OPENCODE_PLUGIN_META_FILE = path.join(tmp.path, "state", "plugin-meta.json")
    const file = process.env.OPENCODE_PLUGIN_META_FILE!
    const spec = pathToFileURL(tmp.extra.file).href

    const one = await PluginMeta.touch(spec, spec)
    expect(one.state).toBe("new")
    expect(one.entry.source).toBe("file")
    expect(one.entry.modified).toBeDefined()

    const two = await PluginMeta.touch(spec, spec)
    expect(two.state).toBe("same")
    expect(two.entry.load_count).toBe(2)

    await Bun.sleep(20)
    await Bun.write(tmp.extra.file, "export default async () => ({ ok: true })\n")

    const three = await PluginMeta.touch(spec, spec)
    expect(three.state).toBe("changed")
    expect(three.entry.load_count).toBe(3)
    expect((three.entry.modified ?? 0) >= (one.entry.modified ?? 0)).toBe(true)

    await expect(fs.readFile(file, "utf8")).rejects.toThrow()
    await PluginMeta.persist()

    const all = await PluginMeta.list()
    expect(Object.values(all).some((item) => item.spec === spec && item.source === "file")).toBe(true)
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, { spec: string; load_count: number }>
    expect(Object.values(saved).some((item) => item.spec === spec && item.load_count === 3)).toBe(true)
  })

  test("tracks npm plugin versions", async () => {
    await using tmp = await tmpdir<{ mod: string; pkg: string }>({
      init: async (dir) => {
        const mod = path.join(dir, "node_modules", "acme-plugin")
        const pkg = path.join(mod, "package.json")
        await fs.mkdir(mod, { recursive: true })
        await Bun.write(pkg, JSON.stringify({ name: "acme-plugin", version: "1.0.0" }, null, 2))
        return { mod, pkg }
      },
    })

    process.env.OPENCODE_PLUGIN_META_FILE = path.join(tmp.path, "state", "plugin-meta.json")
    const file = process.env.OPENCODE_PLUGIN_META_FILE!

    const one = await PluginMeta.touch("acme-plugin@latest", tmp.extra.mod)
    expect(one.state).toBe("new")
    expect(one.entry.source).toBe("npm")
    expect(one.entry.requested).toBe("latest")
    expect(one.entry.version).toBe("1.0.0")

    await Bun.write(tmp.extra.pkg, JSON.stringify({ name: "acme-plugin", version: "1.1.0" }, null, 2))

    const two = await PluginMeta.touch("acme-plugin@latest", tmp.extra.mod)
    expect(two.state).toBe("changed")
    expect(two.entry.version).toBe("1.1.0")
    expect(two.entry.load_count).toBe(2)
    await PluginMeta.persist()

    const all = await PluginMeta.list()
    expect(Object.values(all).some((item) => item.name === "acme-plugin" && item.version === "1.1.0")).toBe(true)
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, { name: string; version?: string }>
    expect(Object.values(saved).some((item) => item.name === "acme-plugin" && item.version === "1.1.0")).toBe(true)
  })
})
