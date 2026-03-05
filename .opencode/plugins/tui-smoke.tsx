/** @jsxImportSource @opentui/solid */
import mytheme from "../themes/mytheme.json" with { type: "json" }
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import type { TuiApi, TuiPluginInput } from "@opencode-ai/plugin/tui"

const tabs = ["overview", "counter", "help"]

const pick = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback
  if (!value.trim()) return fallback
  return value
}

const cfg = (options: Record<string, unknown> | undefined) => {
  return {
    label: pick(options?.label, "smoke"),
    modal: pick(options?.modal, "ctrl+shift+m"),
    screen: pick(options?.screen, "ctrl+shift+o"),
    route: pick(options?.route, "workspace-smoke"),
  }
}

const names = (input: ReturnType<typeof cfg>) => {
  return {
    modal: `${input.route}.modal`,
    screen: `${input.route}.screen`,
  }
}

const ui = {
  panel: "#1d1d1d",
  border: "#4a4a4a",
  text: "#f0f0f0",
  muted: "#a5a5a5",
  accent: "#5f87ff",
}

const parse = (params: Record<string, unknown> | undefined) => {
  const tab = typeof params?.tab === "number" ? params.tab : 0
  const count = typeof params?.count === "number" ? params.count : 0
  const source = typeof params?.source === "string" ? params.source : "unknown"
  return {
    tab: Math.max(0, Math.min(tab, tabs.length - 1)),
    count,
    source,
  }
}

const current = (api: TuiApi, route: ReturnType<typeof names>) => {
  const value = api.route.current
  if (value.name !== route.screen && value.name !== route.modal) return parse(undefined)
  if (!("params" in value)) return parse(undefined)
  return parse(value.params)
}

const nav = (api: TuiApi, name: string, params: Record<string, unknown> | undefined, from: string) => {
  console.log("[smoke] nav", {
    from,
    to: name,
    params,
    current: api.route.current,
  })
  api.route.navigate(name, params)
}

const key = (api: TuiApi, where: string, evt: any) => {
  console.log("[smoke] key", {
    where,
    current: api.route.current.name,
    name: evt.name,
    ctrl: evt.ctrl,
    meta: evt.meta,
    shift: evt.shift,
    leader: evt.leader,
    defaultPrevented: evt.defaultPrevented,
    eventType: evt.eventType,
  })
}

const Probe = (props: { api: TuiApi; route: ReturnType<typeof names> }) => {
  useKeyboard((evt) => {
    const name = props.api.route.current.name
    if (name !== props.route.screen && name !== props.route.modal) return
    key(props.api, "probe", evt)
  })

  return null
}

const Screen = (props: {
  api: TuiApi
  input: ReturnType<typeof cfg>
  route: ReturnType<typeof names>
  params?: Record<string, unknown>
}) => {
  const dim = useTerminalDimensions()
  const value = parse(props.params)

  console.log("[smoke] render", {
    view: "screen",
    current: props.api.route.current,
    params: props.params,
  })

  useKeyboard((evt) => {
    key(props.api, "screen", evt)
    if (props.api.route.current.name !== props.route.screen) return

    const next = current(props.api, props.route)

    if (evt.name === "escape" || (evt.ctrl && evt.name === "h")) {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, "home", undefined, "screen:escape")
      return
    }

    if (evt.name === "left" || evt.name === "h") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.screen, { ...next, tab: (next.tab - 1 + tabs.length) % tabs.length }, "screen:left")
      return
    }

    if (evt.name === "right" || evt.name === "l") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.screen, { ...next, tab: (next.tab + 1) % tabs.length }, "screen:right")
      return
    }

    if (evt.name === "up" || evt.name === "k") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.screen, { ...next, count: next.count + 1 }, "screen:up")
      return
    }

    if (evt.name === "down" || evt.name === "j") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.screen, { ...next, count: next.count - 1 }, "screen:down")
      return
    }

    if (evt.ctrl && evt.name === "m") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.modal, next, "screen:ctrl+m")
    }
  })

  return (
    <box width={dim().width} height={dim().height} backgroundColor={ui.panel}>
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
          <text fg={ui.text}>
            <b>{props.input.label} screen</b>
            <span style={{ fg: ui.muted }}> plugin route</span>
          </text>
          <text fg={ui.muted}>esc or ctrl+h home</text>
        </box>

        <box flexDirection="row" gap={1} paddingBottom={1}>
          {tabs.map((item, i) => {
            const on = value.tab === i
            return (
              <box
                onMouseUp={() => nav(props.api, props.route.screen, { ...value, tab: i }, "screen:click-tab")}
                backgroundColor={on ? ui.accent : ui.border}
                paddingLeft={1}
                paddingRight={1}
              >
                <text fg={ui.text}>{item}</text>
              </box>
            )
          })}
        </box>

        <box
          border
          borderColor={ui.border}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          flexGrow={1}
        >
          {value.tab === 0 ? (
            <box flexDirection="column" gap={1}>
              <text fg={ui.text}>Route: {props.route.screen}</text>
              <text fg={ui.muted}>source: {value.source}</text>
              <text fg={ui.muted}>left/right or h/l switch tabs</text>
            </box>
          ) : null}

          {value.tab === 1 ? (
            <box flexDirection="column" gap={1}>
              <text fg={ui.text}>Counter: {value.count}</text>
              <text fg={ui.muted}>up/down or j/k change value</text>
            </box>
          ) : null}

          {value.tab === 2 ? (
            <box flexDirection="column" gap={1}>
              <text fg={ui.muted}>ctrl+m opens modal</text>
              <text fg={ui.muted}>esc or ctrl+h returns home</text>
            </box>
          ) : null}
        </box>

        <box flexDirection="row" gap={1} paddingTop={1}>
          <box
            onMouseUp={() => nav(props.api, "home", undefined, "screen:click-home")}
            backgroundColor={ui.border}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={ui.text}>go home</text>
          </box>
          <box
            onMouseUp={() => nav(props.api, props.route.modal, value, "screen:click-modal")}
            backgroundColor={ui.accent}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={ui.text}>open modal</text>
          </box>
        </box>
      </box>
    </box>
  )
}

const Modal = (props: {
  api: TuiApi
  input: ReturnType<typeof cfg>
  route: ReturnType<typeof names>
  params?: Record<string, unknown>
}) => {
  const Dialog = props.api.ui.Dialog
  const value = parse(props.params)

  console.log("[smoke] render", {
    view: "modal",
    current: props.api.route.current,
    params: props.params,
  })

  useKeyboard((evt) => {
    key(props.api, "modal", evt)
    if (props.api.route.current.name !== props.route.modal) return

    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, props.route.screen, { ...value, source: "modal" }, "modal:enter")
      return
    }

    if (evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      nav(props.api, "home", undefined, "modal:escape")
    }
  })

  return (
    <box width="100%" height="100%" backgroundColor={ui.panel}>
      <Dialog onClose={() => nav(props.api, "home", undefined, "modal:onClose")}>
        <box paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
          <text fg={ui.text}>
            <b>{props.input.label} modal</b>
          </text>
          <text fg={ui.muted}>{props.api.keybind.print(props.input.modal)} modal command</text>
          <text fg={ui.muted}>{props.api.keybind.print(props.input.screen)} screen command</text>
          <text fg={ui.muted}>enter opens screen · esc closes</text>
          <box flexDirection="row" gap={1}>
            <box
              onMouseUp={() => nav(props.api, props.route.screen, { ...value, source: "modal" }, "modal:click-open")}
              backgroundColor={ui.accent}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={ui.text}>open screen</text>
            </box>
            <box
              onMouseUp={() => nav(props.api, "home", undefined, "modal:click-cancel")}
              backgroundColor={ui.border}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={ui.text}>cancel</text>
            </box>
          </box>
        </box>
      </Dialog>
    </box>
  )
}

const slot = (api: TuiApi, input: ReturnType<typeof cfg>, route: ReturnType<typeof names>) => ({
  id: "workspace-smoke",
  slots: {
    app() {
      return <Probe api={api} route={route} />
    },
    home_logo() {
      return <text>plugin logo:{input.label}</text>
    },
    sidebar_top(_ctx, value) {
      return (
        <text>
          plugin:{input.label} session:{value.session_id.slice(0, 8)}
        </text>
      )
    },
  },
})

const reg = (api: TuiApi, input: ReturnType<typeof cfg>) => {
  const route = names(input)
  api.command.register(() => [
    {
      title: `${input.label} modal`,
      value: "plugin.smoke.modal",
      keybind: input.modal,
      category: "Plugin",
      slash: {
        name: "smoke",
      },
      onSelect: () => {
        console.log("[smoke] command", { value: "plugin.smoke.modal", current: api.route.current })
        nav(api, route.modal, { source: "command" }, "command:modal")
      },
    },
    {
      title: `${input.label} screen`,
      value: "plugin.smoke.screen",
      keybind: input.screen,
      category: "Plugin",
      slash: {
        name: "smoke-screen",
      },
      onSelect: () => {
        console.log("[smoke] command", { value: "plugin.smoke.screen", current: api.route.current })
        nav(api, route.screen, { source: "command", tab: 0, count: 0 }, "command:screen")
      },
    },
    {
      title: `${input.label} go home`,
      value: "plugin.smoke.home",
      category: "Plugin",
      enabled: api.route.current.name !== "home",
      onSelect: () => {
        console.log("[smoke] command", { value: "plugin.smoke.home", current: api.route.current })
        nav(api, "home", undefined, "command:home")
      },
    },
    {
      title: `${input.label} toast`,
      value: "plugin.smoke.toast",
      category: "Plugin",
      onSelect: () => {
        console.log("[smoke] command", { value: "plugin.smoke.toast", current: api.route.current })
        api.ui.toast({
          variant: "info",
          title: "Smoke",
          message: "Plugin toast works",
          duration: 2000,
        })
      },
    },
  ])
}

const themes = {
  "workspace-plugin-smoke": mytheme,
}

const tui = async (input: TuiPluginInput, options?: Record<string, unknown>) => {
  if (options?.enabled === false) return

  const value = cfg(options)
  const route = names(value)

  console.log("[smoke] init", {
    route,
    keybind: {
      modal: value.modal,
      screen: value.screen,
    },
  })

  input.api.route.register([
    {
      name: route.screen,
      render: ({ params }) => <Screen api={input.api} input={value} route={route} params={params} />,
    },
    {
      name: route.modal,
      render: ({ params }) => <Modal api={input.api} input={value} route={route} params={params} />,
    },
  ])

  console.log("[smoke] routes registered", route)

  reg(input.api, value)
  input.slots.register(slot(input.api, value, route))
}

export default {
  themes,
  tui,
}
