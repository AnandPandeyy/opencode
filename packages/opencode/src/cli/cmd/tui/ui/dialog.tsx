import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createContext, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { MouseButton, Renderable, RGBA } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useToast } from "./toast"
import { Flag } from "@/flag/flag"
import { Selection } from "@tui/util/selection"

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large"
    onClose: () => void
  }>,
) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  let dismiss = false

  return (
    <box
      onMouseDown={() => {
        dismiss = !!renderer.getSelection()
        console.log("[dialog-debug] backdrop.mousedown", { dismiss })
      }}
      onMouseUp={() => {
        console.log("[dialog-debug] backdrop.mouseup", { dismiss })
        if (dismiss) {
          dismiss = false
          return
        }
        console.log("[dialog-debug] backdrop.close")
        props.onClose?.()
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      zIndex={3000}
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={(e) => {
          console.log("[dialog-debug] panel.mouseup")
          dismiss = false
          e.stopPropagation()
        }}
        width={props.size === "large" ? 80 : 60}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
      >
        {props.children}
      </box>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as {
      element: JSX.Element
      onClose?: () => void
    }[],
    size: "medium" as "medium" | "large",
  })

  const renderer = useRenderer()

  useKeyboard((evt) => {
    if (store.stack.length === 0) return
    console.log("[dialog-debug] key", {
      name: evt.name,
      ctrl: !!evt.ctrl,
      default_prevented: evt.defaultPrevented,
      stack: store.stack.length,
      has_selection: !!renderer.getSelection(),
    })
    if (evt.defaultPrevented) return
    if ((evt.name === "escape" || (evt.ctrl && evt.name === "c")) && renderer.getSelection()?.getSelectedText()) return
    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      if (renderer.getSelection()) {
        console.log("[dialog-debug] key.selection_clear")
        renderer.clearSelection()
      }
      console.log("[dialog-debug] key.close")
      const current = store.stack.at(-1)!
      current.onClose?.()
      setStore("stack", store.stack.slice(0, -1))
      evt.preventDefault()
      evt.stopPropagation()
      refocus()
    }
  })

  let focus: Renderable | null
  function refocus() {
    setTimeout(() => {
      if (!focus) return
      if (focus.isDestroyed) return
      function find(item: Renderable) {
        for (const child of item.getChildren()) {
          if (child === focus) return true
          if (find(child)) return true
        }
        return false
      }
      const found = find(renderer.root)
      if (!found) return
      focus.focus()
    }, 1)
  }

  return {
    clear() {
      console.log("[dialog-debug] clear", { stack: store.stack.length, size: store.size })
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      batch(() => {
        setStore("size", "medium")
        setStore("stack", [])
      })
      refocus()
    },
    replace(input: any, onClose?: () => void) {
      console.log("[dialog-debug] replace", { stack: store.stack.length, size: store.size })
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        focus?.blur()
      }
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      setStore("size", "medium")
      setStore("stack", [
        {
          element: input,
          onClose,
        },
      ])
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large") {
      console.log("[dialog-debug] setSize", { from: store.size, to: size })
      setStore("size", size)
    },
  }
}

export type DialogContext = ReturnType<typeof init>

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  const renderer = useRenderer()
  const toast = useToast()
  return (
    <ctx.Provider value={value}>
      {props.children}
      <box
        position="absolute"
        zIndex={3000}
        onMouseDown={(evt) => {
          if (!Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
          if (evt.button !== MouseButton.RIGHT) return

          if (!Selection.copy(renderer, toast)) return
          evt.preventDefault()
          evt.stopPropagation()
        }}
        onMouseUp={
          !Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? () => Selection.copy(renderer, toast) : undefined
        }
      >
        <Show when={value.stack.length}>
          <Dialog onClose={() => value.clear()} size={value.size}>
            {value.stack.at(-1)!.element}
          </Dialog>
        </Show>
      </box>
    </ctx.Provider>
  )
}

export function useDialog() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
