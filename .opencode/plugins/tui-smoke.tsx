/** @jsxImportSource ../../packages/opencode/node_modules/@opentui/solid */
import mytheme from "../themes/mytheme.json" with { type: "json" }

const slot = (label) => ({
  id: "workspace-smoke",
  slots: {
    home_hint() {
      console.error(`[workspace-smoke] render home_hint (${label})`)
      return <text> [plugin:{label}]</text>
    },
    home_footer() {
      console.error(`[workspace-smoke] render home_footer (${label})`)
      return <text> theme:workspace-plugin-smoke</text>
    },
    session_footer(_ctx, props) {
      console.error(`[workspace-smoke] render session_footer (${props.session_id.slice(0, 8)})`)
      return <text> session:{props.session_id.slice(0, 8)}</text>
    },
  },
})

const themes = {
  "workspace-plugin-smoke": mytheme,
}

const tui = async (input, options) => {
  if (options?.enabled === false) return
  const label = typeof options?.label === "string" ? options.label : "smoke"
  input.slots.register(slot(label))
  console.error(`[workspace-smoke] tui plugin initialized (${label})`)
}

export default {
  themes,
  tui,
}
