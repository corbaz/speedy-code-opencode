/**
 * The explorer as the host's side panel draws it (`session.panel`, opened by `ui.panel.open`): the disks
 * on top, the one shown underlined, ⊟ to collapse the tree, `↗ abrir en el sistema` and the close mark
 * beside them; under them a field a path is pasted in, Enter, and the tree opens down to it and marks it;
 * under a rule, the disk's tree, the session's folder marked ● and put in the middle when the explorer
 * opens. The tree scrolls under the disks and the field, which stay.
 *
 * Every file is yellow and opens in the viewer; at its right, its four tools. While the pointer is anywhere
 * on a file's row, its tools included, the name keeps a yellow fill: the row is marked as the one the
 * tools act on. The tools themselves never take a fill; a pressed one turns green for a second.
 */

import { For, createEffect, createMemo, createSignal } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"

import {
  FLASH_COLOR,
  FILE_TOOLS_WIDTH,
  collapseLabel,
  driveLabel,
  fileNameLabel,
  fileTools,
  rowAction,
  rowLabel,
  treeRows,
  windowTop,
  type ExplorerState,
  type FileToolKind,
  type TreeRow,
} from "./explorer"
import { FOLDER_COLOR, fit } from "./footer"
import type { IconSet } from "./icons"
import { Btn } from "./menus"

/** The name the explorer's panel is opened under: the slot draws it only while it is the panel shown. */
export const EXPLORER_PANEL = "speedy-code-explorer"

const DIR_COLOR = "#74c0fc"
const CLOSE_COLOR = "#ff6b6b"
// The text attributes, as @opentui/core numbers them.
const BOLD = 1
const DIM = 2
const ITALIC = 4
const UNDERLINE = 8

/** What the panel reads and what its presses ask for. */
export interface ExplorerPanelApi {
  readonly state: () => ExplorerState
  /** The panel's width in cells, as the host gives it. */
  readonly width: () => number
  /** Emoji or Nerd Fonts glyphs, as the settings say. */
  readonly icons: () => IconSet
  pickDrive(drive: string): void
  toggleFolder(path: string): void
  pressFile(path: string): void
  /** A file's tool pressed. */
  tool(kind: FileToolKind, path: string): void
  /** ⊟: the tree back to the session's folder. */
  collapse(): void
  /** A path pasted in the field, Enter: the tree opens down to it and marks it. */
  goTo(text: string): void
  openSystem(): void
  close(): void
}

/** A file the viewer opens: yellow, so it reads as one that does something when pressed. */
const VIEWABLE_COLOR = "#ffd43b"
/** The name's text while its row is under the pointer, on the yellow fill. */
const HOVER_TEXT = "#1a1a1a"

/** How a row other than a file's is drawn: folders in blue, the session's bold in the folder's color, the rest dim. */
function rowLook(row: TreeRow): { color?: string; attributes: number } {
  if (row.kind === "note") return { attributes: DIM | ITALIC }
  if (row.kind === "dir") return row.isHere ? { color: FOLDER_COLOR, attributes: BOLD } : { color: DIR_COLOR, attributes: 0 }
  if (row.isFound) return { color: HOVER_TEXT, attributes: BOLD }
  return rowAction(row) === "view" ? { color: VIEWABLE_COLOR, attributes: 0 } : { attributes: DIM }
}

export function ExplorerPanel(props: { api: ExplorerPanelApi }) {
  const api = props.api
  const rows = createMemo(() => treeRows(api.state()))
  // The rule and the rows take the panel's width, less its margins and the scroll bar.
  const room = () => Math.max(8, api.width() - 3)
  // The file whose row is under the pointer, its tools included.
  const [hovered, setHovered] = createSignal("")
  // The field for a path takes the keys only once pressed, and gives them back on Enter: the prompt keeps them.
  const [isTyping, setTyping] = createSignal(false)
  let field: { value?: string; plainText?: string } | undefined
  const typed = () => field?.value ?? field?.plainText ?? ""
  let tree: ScrollBoxRenderable | undefined

  // A disk shown, the explorer opened or the tree collapsed: the tree goes to its top, or puts the
  // session's folder in the middle.
  const placed = createMemo(() => `${api.state().drive}|${api.state().top}|${api.state().turn ?? 0}`)
  createEffect(() => {
    placed()
    const box = tree
    if (!box) return
    const place = () => {
      if (box.isDestroyed) return
      box.scrollTo(windowTop(rows(), api.state().top, Math.max(1, box.viewport.height)))
    }
    // After the layout, so the viewport's height is the one drawn.
    if (typeof box.afterLayout === "function") box.afterLayout(place)
    else setTimeout(place, 0)
  })

  const press = (row: TreeRow) => {
    const action = rowAction(row)
    if (action === "folder") api.toggleFolder(row.path)
    else if (action === "view") api.pressFile(row.path)
  }

  /** A file's row: its name, which opens the viewer, and its four tools, none with a fill under the pointer. */
  const fileRow = (row: TreeRow) => {
    // The path the field found keeps the fill until the pointer is on another file: the fill follows the pointer.
    const isHovered = () => hovered() === row.path || (row.isFound === true && hovered() === "")
    return (
      // The pointer's over and out reach the row from its name and its tools alike: an out from one part
      // comes before the over of the next, so the row stays marked while the pointer is anywhere on it.
      <box
        flexDirection="row"
        flexShrink={0}
        onMouseOver={() => setHovered(row.path)}
        onMouseOut={() => setHovered((now) => (now === row.path ? "" : now))}
      >
        <box flexShrink={0} onMouseUp={() => press(row)}>
          <text
            wrapMode="none"
            selectable={false}
            fg={isHovered() ? HOVER_TEXT : VIEWABLE_COLOR}
            bg={isHovered() ? VIEWABLE_COLOR : undefined}
          >
            {fileNameLabel(row, room())}
          </text>
        </box>
        <box flexDirection="row" flexShrink={0} width={FILE_TOOLS_WIDTH}>
          <For each={fileTools(api.icons(), api.state().flashed ?? "", row.path)}>
            {(tool) => (
              <box flexShrink={0} onMouseUp={() => api.tool(tool.kind, row.path)}>
                <text wrapMode="none" selectable={false} fg={tool.color} attributes={BOLD}>
                  {tool.label}
                </text>
              </box>
            )}
          </For>
        </box>
      </box>
    )
  }

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
        <For each={api.state().drives}>
          {(drive) => {
            const isShown = () => drive === api.state().drive
            return (
              <box flexShrink={0} onMouseUp={() => api.pickDrive(drive)}>
                <text
                  wrapMode="none"
                  selectable={false}
                  fg={isShown() ? FOLDER_COLOR : undefined}
                  attributes={isShown() ? BOLD | UNDERLINE : DIM}
                >
                  {` ${driveLabel(drive)} `}
                </text>
              </box>
            )
          }}
        </For>
        <box flexShrink={0} onMouseUp={() => api.collapse()}>
          <text
            wrapMode="none"
            selectable={false}
            fg={api.state().flashed === "collapse:" ? FLASH_COLOR : DIR_COLOR}
            attributes={BOLD}
          >
            {collapseLabel(api.icons())}
          </text>
        </box>
        <box flexGrow={1} />
        <Btn label=" ↗ abrir en el sistema " dim onPress={() => api.openSystem()} />
        <Btn label=" × " color={CLOSE_COLOR} bold onPress={() => api.close()} />
      </box>
      <box flexShrink={0} onMouseUp={() => setTyping(true)}>
        <input
          id="speedy-explorer-goto"
          ref={(one: unknown) => {
            field = one as typeof field
          }}
          focused={isTyping()}
          placeholder="pegá una ruta y Enter: D:\carpeta\archivo"
          placeholderColor="#868e96"
          textColor={VIEWABLE_COLOR}
          focusedTextColor={VIEWABLE_COLOR}
          cursorColor={VIEWABLE_COLOR}
          onSubmit={() => {
            setTyping(false)
            api.goTo(typed())
          }}
        />
      </box>
      <text wrapMode="none" selectable={false} attributes={DIM} flexShrink={0}>
        {"─".repeat(room())}
      </text>
      <scrollbox ref={(box: ScrollBoxRenderable) => (tree = box)} flexGrow={1} minHeight={0} scrollY>
        <For each={rows()}>
          {(row) => {
            // A row's kind never changes: a file's row is drawn with its tools, any other as its label.
            if (row.kind === "file") return fileRow(row)
            const look = rowLook(row)
            return (
              <box flexShrink={0} onMouseUp={rowAction(row) === "none" ? undefined : () => press(row)}>
                <text wrapMode="none" selectable={false} fg={row.isFound ? HOVER_TEXT : look.color} bg={row.isFound ? VIEWABLE_COLOR : undefined} attributes={row.isFound ? BOLD : look.attributes}>
                  {fit(rowLabel(row), room())}
                </text>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}
