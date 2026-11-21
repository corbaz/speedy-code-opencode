/**
 * The explorer as the host's side panel draws it (`session.panel`, opened by `ui.panel.open`): the disks
 * on top, the one shown underlined, `↗ abrir en el sistema` and the close mark beside them; under a rule,
 * the disk's tree, the session's folder marked ● and put in the middle when the explorer opens. The tree
 * scrolls under the disks, which stay.
 */

import { For, createEffect, createMemo } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"

import { driveLabel, rowAction, rowLabel, treeRows, windowTop, type ExplorerState, type TreeRow } from "./explorer"
import { FOLDER_COLOR, fit } from "./footer"
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
  pickDrive(drive: string): void
  toggleFolder(path: string): void
  pressFile(path: string): void
  openSystem(): void
  close(): void
}

/** A file the viewer opens: yellow, so it reads as one that does something when pressed. */
const VIEWABLE_COLOR = "#ffd43b"

/** How a row is drawn: folders in blue, the session's bold in the folder's color, the rest by what a press does. */
function rowLook(row: TreeRow): { color?: string; attributes: number } {
  if (row.kind === "note") return { attributes: DIM | ITALIC }
  if (row.kind === "dir") return row.isHere ? { color: FOLDER_COLOR, attributes: BOLD } : { color: DIR_COLOR, attributes: 0 }
  return rowAction(row) === "view" ? { color: VIEWABLE_COLOR, attributes: 0 } : { attributes: DIM }
}

export function ExplorerPanel(props: { api: ExplorerPanelApi }) {
  const api = props.api
  const rows = createMemo(() => treeRows(api.state()))
  // The rule and the rows take the panel's width, less its margins and the scroll bar.
  const room = () => Math.max(8, api.width() - 3)
  let tree: ScrollBoxRenderable | undefined

  // A disk shown, or the explorer opened: the tree goes to its top, or puts the session's folder in the middle.
  const placed = createMemo(() => `${api.state().drive}|${api.state().top}`)
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
        <box flexGrow={1} />
        <Btn label=" ↗ abrir en el sistema " dim onPress={() => api.openSystem()} />
        <Btn label=" × " color={CLOSE_COLOR} bold onPress={() => api.close()} />
      </box>
      <text wrapMode="none" selectable={false} attributes={DIM} flexShrink={0}>
        {"─".repeat(room())}
      </text>
      <scrollbox ref={(box: ScrollBoxRenderable) => (tree = box)} flexGrow={1} minHeight={0} scrollY>
        <For each={rows()}>
          {(row) => {
            const look = rowLook(row)
            return (
              <box flexShrink={0} onMouseUp={rowAction(row) === "none" ? undefined : () => press(row)}>
                <text wrapMode="none" selectable={false} fg={look.color} attributes={look.attributes}>
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
