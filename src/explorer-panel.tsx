/**
 * The explorer as the host's side panel draws it (`session.panel`, opened by `ui.panel.open`): the disks
 * on top, the one shown underlined, ⊟ to collapse every disk, `↗ abrir en el sistema` and the close mark
 * beside them; under them a field a path is pasted in, Enter, and the tree opens down to it and marks it;
 * under it the filter's field, with × to clear it: a pattern, Enter, and the tree holds only the disk's files
 * that match;
 * under a rule, the disk's tree, the session's folder marked ● and put in the middle when the explorer
 * opens. The tree scrolls under the disks and the field, which stay.
 *
 * Every file is yellow and every folder blue, each on a row of its own, the name alone on the tree's width.
 * While the pointer is on a row it takes a fill in its color. A click selects it: it keeps the fill, bold, with
 * ⋯ at its end; a second click in time opens it, a file in the viewer and a folder open or closed, which one
 * click on its ▸ or ▾ does too. The right button, Ctrl with a click, or ⋯ open the row's menu inside the tree,
 * under the row or over it: its tools one under the other, each with what it does at its right, 📥 grey until
 * 📋 took a file or a folder, 📍 on a folder of this machine alone. A press on a tool does it; a press anywhere
 * else, or the tree moved, closes the menu. The row whose tool was pressed is green for a second.
 *
 * While a popup of the explorer is up, a dialog's or the viewer's, the explorer holds still: no row fills under
 * the pointer, none is selected or opened, no menu opens, and the header and the wheel move nothing. The one
 * row filled is the one the popup is about.
 */

import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"

import {
  FLASH_COLOR,
  FILTER_HINT,
  MENU_EDGE,
  ROW_MORE,
  TOOL_IDLE_COLOR,
  UNFILTER_LABEL,
  pauseLabel,
  pathKey,
  remoteOf,
  ruleLabel,
  collapseLabel,
  driveLabel,
  fileNameLabel,
  isHeld,
  isRowFlashed,
  menuPlace,
  toolMenu,
  createDoubleClick,
  gotoHint,
  rowAction,
  rowLabel,
  treeRows,
  windowTop,
  type ExplorerState,
  type FileToolKind,
  type TreeRow,
} from "./explorer"
import { FOLDER_COLOR, cells, fit } from "./footer"
import type { IconSet } from "./icons"
import { Btn } from "./menus"

/** The name the explorer's panel is opened under: the slot draws it only while it is the panel shown. */
export const EXPLORER_PANEL = "speedy-code-explorer"

const DIR_COLOR = "#74c0fc"
const CLOSE_COLOR = "#ff6b6b"
// A menu's frame, and what it stands on: the rows under it do not show through.
const MENU_FRAME = "#868e96"
const MENU_FILL = "#141414"
// The buttons, as @opentui/core numbers them.
const LEFT = 0
const RIGHT = 2
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
  /** A tool of a row's menu pressed. */
  tool(kind: FileToolKind, path: string): void
  /** ⊟: every disk collapses; the session's stays open down to its folder. */
  collapse(): void
  /** A path pasted in the field, Enter: the tree opens down to it and marks it. */
  goTo(text: string): void
  /** A pattern typed in the filter's field, Enter: the tree holds only the disk's files that match. */
  filter(text: string): void
  /** The filter's ×: the whole tree is back. */
  clearFilter(): void
  /** ‖ pausar: a search that still runs stops, and the tree keeps what it found. */
  pauseFilter(): void
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
  // A row that did not change is the one drawn before: while a filter's search adds files, or only counts
  // what it saw, the rows already there are left as they are.
  const rowKey = (row: TreeRow) => `${row.kind}|${row.depth}|${row.isOpen}|${row.isHere}|${row.isFound === true}|${row.name}|${row.path}`
  const rows = createMemo<TreeRow[]>((before) => {
    const drawn = new Map(before.map((row) => [rowKey(row), row]))
    const next = treeRows(api.state()).map((row) => drawn.get(rowKey(row)) ?? row)
    return next.length === before.length && next.every((row, index) => row === before[index]) ? before : next
  }, [])
  // The rule and the rows take the panel's width, less its margins and the scroll bar.
  const room = () => Math.max(8, api.width() - 3)
  // A row's name takes the room less the empty cell that parts it from the scroll bar.
  const treeWidth = () => room() - 1
  // A popup of the explorer is up: the explorer holds still.
  const isFrozen = () => isHeld(api.state())
  // What a press on the header does, unless the explorer holds still.
  const unlessFrozen = (run: () => void) => () => {
    if (!isFrozen()) run()
  }
  // The file or the folder whose row is under the pointer: followed always, shown only while nothing holds the explorer.
  const [pointedRow, setHovered] = createSignal("")
  const hovered = () => (isFrozen() ? "" : pointedRow())
  // The one selected, by a click: its row keeps its fill, with ⋯ at its end.
  const [selected, setSelected] = createSignal("")
  const doubleClick = createDoubleClick()
  // The row whose menu is open, and where the menu stands against it: rows down from the row, cells from the tree's left.
  const [menu, setMenu] = createSignal<{ path: string; top: number; left: number } | undefined>()
  // The tool of the menu under the pointer.
  const [pointed, setPointed] = createSignal("")
  // A popup up closes the menu it was asked from.
  createEffect(() => {
    if (isFrozen()) setMenu(undefined)
  })
  // A row's menu: a file's, a folder's or a disk's root's; 📍 on this machine alone.
  const menuOf = (row: TreeRow) =>
    toolMenu(
      { isFolder: row.kind === "dir", isDisk: row.kind === "dir" && row.depth === 0, isFar: remoteOf(row.path) !== undefined },
      api.state().clip ? { kind: api.state().clipKind } : undefined,
      api.icons(),
    )
  // The menu opens under its row, or over it where the tree's room under is short, from the cell asked.
  const openMenu = (row: TreeRow, x: number) => {
    const tools = menuOf(row)
    const height = tools.items.length + 2
    const at = rows().findIndex((one) => one.path === row.path) - Math.round(tree?.scrollTop ?? 0)
    const place = menuPlace({ at, x, height, width: Math.min(treeWidth(), tools.width + MENU_EDGE), room: Math.max(1, tree?.viewport.height ?? at + 1 + height), treeWidth: treeWidth() })
    setSelected(row.path)
    setPointed("")
    setMenu({ path: row.path, top: place.top - at, left: place.left })
  }
  // The field for a path takes the keys only once pressed, and gives them back on Enter: the prompt keeps them.
  const [typing, setTyping] = createSignal<"" | "goto" | "filter">("")
  type Field = { value?: string; plainText?: string }
  let field: Field | undefined
  let filterField: Field | undefined
  const typed = (one: Field | undefined) => one?.value ?? one?.plainText ?? ""
  // The filter cleared, by its × or by a path gone to: its field empties.
  createEffect(() => {
    if ((api.state().cleared ?? 0) > 0 && filterField) filterField.value = ""
  })
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

  const openRow = (row: TreeRow) => {
    const action = rowAction(row)
    if (action === "folder") api.toggleFolder(row.path)
    else if (action === "view") api.pressFile(row.path)
  }

  /**
   * A press on a file's or a folder's row. The right button, Ctrl with a click, or ⋯ at the end of the row
   * selected open its menu. A click selects the row, and the second one in time opens it; a folder's ▸ or ▾
   * opens or closes it with one. While a menu is open, a press outside it closes it and does nothing else.
   */
  const pressRow = (row: TreeRow, event: MouseEvent) => {
    if (event.button !== LEFT && event.button !== RIGHT) return
    event.stopPropagation()
    if (isFrozen()) return
    const x = event.x - (tree?.x ?? 0)
    const asksMenu = event.button === RIGHT || event.modifiers.ctrl
    if (menu() && !asksMenu) return void setMenu(undefined)
    if (asksMenu) return openMenu(row, x)
    if (selected() === row.path && x >= treeWidth() - cells(ROW_MORE)) return openMenu(row, treeWidth())
    setSelected(row.path)
    if (row.kind === "dir" && x >= row.depth * 2 && x < row.depth * 2 + 2) return api.toggleFolder(row.path)
    if (doubleClick(`row:${row.path}`, Date.now())) openRow(row)
  }

  /** A row's menu, over the rows: its tools one under the other, each with what it does at its right. */
  const rowMenu = (row: TreeRow) => (
    <box
      position="absolute"
      top={menu()?.top ?? 1}
      left={menu()?.left ?? 0}
      zIndex={60}
      width={Math.min(treeWidth(), menuOf(row).width + MENU_EDGE)}
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={MENU_FRAME}
      backgroundColor={MENU_FILL}
      // The frame takes no press, and the row under the menu none either.
      onMouseDown={(event: MouseEvent) => event.stopPropagation()}
    >
      <For each={menuOf(row).items}>
        {(item) => {
          const isPointed = () => !item.isIdle && pointed() === item.kind
          return (
            <box
              flexDirection="row"
              flexShrink={0}
              // One press does it, and the menu closes; a grey tool says why it does nothing.
              onMouseDown={(event: MouseEvent) => {
                event.stopPropagation()
                if (event.button !== LEFT || event.modifiers.ctrl) return
                setMenu(undefined)
                api.tool(item.kind, row.path)
              }}
              onMouseOver={() => setPointed(item.kind)}
              onMouseOut={() => setPointed((now) => (now === item.kind ? "" : now))}
            >
              <text wrapMode="none" selectable={false} fg={isPointed() ? HOVER_TEXT : item.isIdle ? TOOL_IDLE_COLOR : item.color} bg={isPointed() ? item.color : undefined} attributes={BOLD}>
                {` ${item.icon}  `}
              </text>
              <text wrapMode="none" selectable={false} fg={isPointed() ? HOVER_TEXT : item.isIdle ? TOOL_IDLE_COLOR : undefined} bg={isPointed() ? item.color : undefined}>
                {`${item.text} `}
              </text>
            </box>
          )
        }}
      </For>
    </box>
  )

  /**
   * A file's or a folder's row: its name on the tree's width. A file's is yellow and fills yellow; a folder's
   * is blue and fills blue: under the pointer, and while it is the row selected, which has ⋯ at its end.
   */
  const fileRow = (row: TreeRow) => {
    const isFolder = row.kind === "dir"
    const tint = isFolder ? (row.isHere ? FOLDER_COLOR : DIR_COLOR) : VIEWABLE_COLOR
    const fill = isFolder ? DIR_COLOR : VIEWABLE_COLOR
    // The path the field found keeps the fill until the pointer is on another row: the fill follows the pointer.
    // So does the file the viewer was last opened on.
    const isViewed = () => api.state().viewed !== undefined && api.state().viewed === pathKey(row.path, api.state().caseless)
    const isFound = () => (row.isFound === true || isViewed()) && hovered() === ""
    const isSelected = () => selected() === row.path
    const isFilled = () => hovered() === row.path || isSelected() || isFound()
    // The row whose tool was pressed, or whose file is on its way to the viewer, is green: the press was taken.
    const isPressed = () => isRowFlashed(api.state().flashed ?? "", row.path)
    const back = () => (isPressed() ? FLASH_COLOR : isFilled() ? (isFound() && !isSelected() ? VIEWABLE_COLOR : fill) : undefined)
    return (
      <box
        flexDirection="row"
        flexShrink={0}
        // The row whose menu is open is drawn after the others: its menu stands over the rows under it.
        zIndex={menu()?.path === row.path ? 50 : 0}
        onMouseOver={() => setHovered(row.path)}
        onMouseOut={() => setHovered((now) => (now === row.path ? "" : now))}
        onMouseDown={(event: MouseEvent) => pressRow(row, event)}
      >
        <text
          wrapMode="none"
          selectable={false}
          fg={back() ? HOVER_TEXT : tint}
          bg={back()}
          attributes={isSelected() || (isFolder && row.isHere) ? BOLD : 0}
        >
          {fileNameLabel(row, treeWidth())}
        </text>
        {/* ⋯ at the end of the row selected opens its menu: the one mark that says the tools are there. */}
        <Show when={isSelected()}>
          <box position="absolute" top={0} left={treeWidth() - cells(ROW_MORE)} zIndex={1} flexShrink={0}>
            <text wrapMode="none" selectable={false} fg={HOVER_TEXT} bg={back() ?? fill} attributes={BOLD}>
              {ROW_MORE}
            </text>
          </box>
        </Show>
        <Show when={menu()?.path === row.path}>{rowMenu(row)}</Show>
      </box>
    )
  }

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} paddingLeft={1} paddingRight={1} onMouseDown={() => setMenu(undefined)}>
      {/* The header's presses do nothing while a popup of the explorer is up; ↗ and × are not the explorer's own moves. */}
      <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
        <For each={api.state().drives}>
          {(drive) => {
            const isShown = () => drive === api.state().drive
            return (
              <box flexShrink={0} onMouseUp={unlessFrozen(() => api.pickDrive(drive))}>
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
        <box flexShrink={0} onMouseUp={unlessFrozen(() => api.collapse())}>
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
      <box flexShrink={0} onMouseUp={unlessFrozen(() => setTyping("goto"))}>
        <input
          id="speedy-explorer-goto"
          ref={(one: unknown) => {
            field = one as typeof field
          }}
          focused={typing() === "goto"}
          placeholder={gotoHint(process.platform)}
          placeholderColor="#868e96"
          textColor={VIEWABLE_COLOR}
          focusedTextColor={VIEWABLE_COLOR}
          cursorColor={VIEWABLE_COLOR}
          onSubmit={() => {
            setTyping("")
            api.goTo(typed(field))
          }}
        />
      </box>
      <box flexDirection="row" flexShrink={0}>
        <box flexGrow={1} flexShrink={1} onMouseUp={unlessFrozen(() => setTyping("filter"))}>
          <input
            id="speedy-explorer-filter"
            ref={(one: unknown) => {
              filterField = one as Field
            }}
            focused={typing() === "filter"}
            placeholder={FILTER_HINT}
            placeholderColor="#868e96"
            textColor={VIEWABLE_COLOR}
            focusedTextColor={VIEWABLE_COLOR}
            cursorColor={VIEWABLE_COLOR}
            onSubmit={() => {
              setTyping("")
              api.filter(typed(filterField))
            }}
          />
        </box>
        <Btn
          label={UNFILTER_LABEL}
          color={api.state().filter ? CLOSE_COLOR : "#868e96"}
          bold={api.state().filter !== undefined}
          onPress={unlessFrozen(() => {
            setTyping("")
            api.clearFilter()
          })}
        />
        <Btn
          label={pauseLabel(api.state().filter)}
          color={api.state().filter?.isPaused ? FLASH_COLOR : api.state().filter?.isBusy ? VIEWABLE_COLOR : "#868e96"}
          bold={api.state().filter?.isBusy === true || api.state().filter?.isPaused === true}
          onPress={unlessFrozen(() => api.pauseFilter())}
        />
      </box>
      <text
        wrapMode="none"
        selectable={false}
        fg={api.state().filter ? VIEWABLE_COLOR : undefined}
        attributes={api.state().filter ? 0 : DIM}
        flexShrink={0}
      >
        {ruleLabel(api.state(), room())}
      </text>
      {/* A press on a note, a link or the room left under the rows closes the menu, or lets go of the row
          selected; the tree moved closes the menu, which would no longer stand by its row. */}
      <scrollbox
        ref={(box: ScrollBoxRenderable) => (tree = box)}
        flexGrow={1}
        minHeight={0}
        // The wheel moves nothing while the explorer holds still.
        scrollY={!isFrozen()}
        onMouseDown={(event: MouseEvent) => {
          event.stopPropagation()
          if (isFrozen()) return
          if (menu()) setMenu(undefined)
          else setSelected("")
        }}
        onMouseScroll={() => setMenu(undefined)}
      >
        <For each={rows()}>
          {(row) => {
            // A row's kind never changes: a file's or a folder's row is one that is selected and has a menu, a
            // disk's root too (to paste into it); any other is its label.
            if (row.kind === "file" || row.kind === "dir") return fileRow(row)
            const look = rowLook(row)
            return (
              <box flexShrink={0}>
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
