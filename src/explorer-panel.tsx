/**
 * The explorer as the host's side panel draws it (`session.panel`, opened by `ui.panel.open`). Its header,
 * which stays while the tree scrolls: × to close the panel, on a row of its own; the disks as tabs, the one
 * shown filled, with ⊟ to collapse every disk and ↗ to open the system's file manager at their row's end; the
 * path, each folder from the disk down to the row selected, one pressed gone to; the one field, where a path
 * is gone to and anything else filters the disk shown, with ‖ and × at its right while a filter is on; and a
 * rule, which says what a filter found. Under it the disk's tree, the session's folder marked ● and put in the
 * middle when the explorer opens.
 *
 * Every file is yellow and every folder blue, each on a row of its own, the name alone on the tree's width.
 * While the pointer is on a row it takes a fill in its color. A click selects it: it keeps the fill, bold, with
 * ⋯ at its end; a second click in time opens it, a file in the viewer and a folder open or closed, which one
 * click on its ▸ or ▾ does too. The right button, Ctrl with a click, or ⋯ open the row's menu inside the tree,
 * under the row or over it: its tools one under the other, each with what it does at its right, 📥 grey until
 * 📋 took a file or a folder, 📍 on a folder of this machine alone. A press on a tool does it; a press anywhere
 * else, or the tree moved, closes the menu. The row whose tool was pressed is green for a second.
 *
 * While a dialog of the explorer is up, the explorer holds still, not while the viewer's popup is: no row fills under
 * the pointer, none is selected or opened, no menu opens, and the header and the wheel move nothing. The one
 * row filled is the one the popup is about. The explorer picks the row selected by itself too (`pickTurn`): after
 * 🗑, the folder that held what went; after ✏, the file under its new name.
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"

import {
  FLASH_COLOR,
  FIELD_HINT,
  MENU_EDGE,
  ROW_MORE,
  TOOL_IDLE_COLOR,
  UNFILTER_LABEL,
  pauseLabel,
  pauseTip,
  systemTip,
  crumbPath,
  crumbsOf,
  namePieces,
  pathKey,
  remoteOf,
  ruleLabel,
  collapseLabel,
  driveLabel,
  isHeld,
  isRowFlashed,
  menuPlace,
  toolMenu,
  createDoubleClick,
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
// A header control that only waits, and ↗.
const IDLE_COLOR = "#868e96"
// The path's row: a folder of it, and what stands between two.
const CRUMB_COLOR = "#adb5bd"
const BETWEEN_COLOR = "#495057"
// A header control's name, while the pointer is on it: dark on yellow, as the footer's.
const TIP_FILL = "#ffd43b"
// What a filter's pattern matched of a name.
const MATCH_COLOR = "#ffffff"
// The field's ⏎, which searches for what the field holds; and the cells the magnifier before the field takes.
const SEARCH_LABEL = " ⏎ "
const FIELD_MARK_CELLS = 3
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
  /** ⚙ → Ver labels: a header control's name shows while the pointer is on it. */
  readonly labels: () => boolean
  pickDrive(drive: string): void
  toggleFolder(path: string): void
  pressFile(path: string): void
  /** A tool of a row's menu pressed. */
  tool(kind: FileToolKind, path: string): void
  /** ⊟: every disk collapses; the session's stays open down to its folder. */
  collapse(): void
  /** A folder of the path's row pressed: the tree opens down to it and marks it. */
  goTo(text: string): void
  /** The one field's Enter: a path is gone to, anything else filters the disk shown. */
  submit(text: string): void
  /** ⏎ after the field's text: what the field holds is searched for, as Enter does, and ⏎ is green for a second. */
  search(text: string): void
  /** A row's menu opened, or closed: Escape closes one that is open. */
  menuShown(isShown: boolean): void
  /** The times Escape closed a row's menu: the panel closes its menu each time it goes up. */
  readonly menuCloses: () => number
  /** A row selected, or let go of: the path's row shows it, or the session's folder. */
  pick(path: string | undefined): void
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
  // The explorer picked the row selected by itself: after 🗑, the folder that held what went; after ✏, the file
  // under its new name.
  const pickTurn = createMemo(() => api.state().pickTurn ?? 0)
  createEffect((before: number) => {
    const now = pickTurn()
    if (now !== before) setSelected(api.state().picked ?? "")
    return now
  }, pickTurn())
  const doubleClick = createDoubleClick()
  // The row whose menu is open, and where the menu stands against it: rows down from the row, cells from the tree's left.
  const [menu, setMenu] = createSignal<{ path: string; top: number; left: number } | undefined>()
  // The tool of the menu under the pointer.
  const [pointed, setPointed] = createSignal("")
  // A popup up closes the menu it was asked from.
  createEffect(() => {
    if (isFrozen()) setMenu(undefined)
  })
  // Escape closes the menu: the host hears whether one is open, and says when Escape was pressed on it.
  createEffect(() => api.menuShown(menu() !== undefined))
  onCleanup(() => api.menuShown(false))
  createEffect((before: number) => {
    const now = api.menuCloses()
    if (now !== before) setMenu(undefined)
    return now
  }, api.menuCloses())
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
    api.pick(row.path)
    setPointed("")
    setMenu({ path: row.path, top: place.top - at, left: place.left })
  }
  // The field takes the keys only once pressed, and gives them back on Enter: the prompt keeps them.
  const [typing, setTyping] = createSignal(false)
  type Field = { value?: string; plainText?: string }
  let field: Field | undefined
  const typed = (one: Field | undefined) => one?.value ?? one?.plainText ?? ""
  // The filter cleared by its ×, or a path gone to: the field empties. A pattern typed stays while its filter is on.
  const cleared = createMemo(() => api.state().cleared ?? 0)
  // What the field holds, as it is typed: ⏎ stands right after it.
  const [fieldText, setFieldText] = createSignal("")
  createEffect((before: number) => {
    const now = cleared()
    if (now !== before && field) {
      field.value = ""
      setFieldText("")
    }
    return now
  }, cleared())
  // Where ⏎ stands, in cells from the line's start: right after the field's text, or its hint, a cell left
  // for the cursor. Never past the field's end, before ‖ and × while a filter is on.
  const searchAt = () => {
    const fieldWidth = room() - FIELD_MARK_CELLS - (api.state().filter ? cells(pauseLabel(api.state().filter)) + cells(UNFILTER_LABEL) : 0)
    return FIELD_MARK_CELLS + Math.max(0, Math.min(cells(fieldText() || FIELD_HINT) + 1, fieldWidth - cells(SEARCH_LABEL)))
  }
  // The path's row: each folder from the disk down to the row selected, or to the session's folder. The same
  // pieces are the ones drawn before, so the pointer on one stays on it while the explorer's state moves.
  const crumbs = createMemo(() => (api.state().drive ? crumbsOf(crumbPath(api.state()), api.state().drive, room()) : []), undefined, {
    equals: (before, now) => JSON.stringify(before) === JSON.stringify(now),
  })
  const lastCrumb = () => crumbs().filter((part) => part.path !== undefined).at(-1)?.path
  // The folder of the path under the pointer.
  const [crumb, setCrumb] = createSignal("")
  // The header control under the pointer: with ⚙ → Ver labels its name shows by it.
  const [tipped, setTipped] = createSignal("")
  /**
   * A control of the header: its icon alone. With ⚙ → Ver labels, its name while the pointer is on it: a row
   * under it (`tipTop` 1, the disks' row) or over it (-1, the field's), ending where the control ends, so a
   * name covers no other control.
   */
  const icon = (
    id: string,
    look: { label: () => string; color: () => string | undefined; isBold?: () => boolean; tip: () => string; tipTop: number },
    press: () => void,
  ) => (
    <box flexShrink={0} onMouseUp={press} onMouseOver={() => setTipped(id)} onMouseOut={() => setTipped((now) => (now === id ? "" : now))}>
      <text wrapMode="none" selectable={false} fg={look.color()} attributes={look.isBold?.() === false ? 0 : BOLD}>
        {look.label()}
      </text>
      <Show when={api.labels() && tipped() === id}>
        <box position="absolute" top={look.tipTop} left={cells(look.label()) - cells(` ${look.tip()} `)} zIndex={70} width={cells(` ${look.tip()} `)} flexShrink={0}>
          <text wrapMode="none" selectable={false} fg={HOVER_TEXT} bg={TIP_FILL} attributes={BOLD}>
            {` ${look.tip()} `}
          </text>
        </box>
      </Show>
    </box>
  )
  let tree: ScrollBoxRenderable | undefined
  // Where the tree stood when the explorer began to hold still. The wheel and the bar are undone from there until
  // it lets go: the scrollbox with its scroll switched off would go to its top, and stay there.
  let heldTop: number | undefined
  createEffect(() => {
    if (!isFrozen()) heldTop = undefined
    else heldTop ??= tree?.scrollTop
  })
  const stay = () => {
    const box = tree
    const top = heldTop
    if (!box || top === undefined) return
    queueMicrotask(() => {
      if (!box.isDestroyed && box.scrollTop !== top) box.scrollTo(top)
    })
  }

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
    api.pick(row.path)
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
    // The name, in pieces while a filter is on: what its pattern matched is white and bold. The same pieces are
    // the ones drawn before, so a search that only adds files leaves the rows already there as they are.
    const pieces = createMemo(() => namePieces(row, treeWidth(), api.state().filter?.pattern), undefined, {
      equals: (before, now) => before.length === now.length && before.every((piece, index) => piece.text === now[index]?.text && piece.isMatch === now[index]?.isMatch),
    })
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
        <For each={pieces()}>
          {(piece) => (
            <text
              wrapMode="none"
              selectable={false}
              flexShrink={0}
              fg={back() ? HOVER_TEXT : piece.isMatch ? MATCH_COLOR : tint}
              bg={back()}
              attributes={piece.isMatch || (isFolder && row.isHere) || (isSelected() && pieces().length === 1) ? BOLD : 0}
            >
              {piece.text}
            </text>
          )}
        </For>
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
      {/* × closes the panel, on a row of its own at the right, apart from the explorer's own controls. */}
      <box flexDirection="row" flexShrink={0}>
        <box flexGrow={1} />
        <Btn label=" × " color={CLOSE_COLOR} bold onPress={() => api.close()} />
      </box>
      {/* The disks, as tabs: the one shown filled. At the row's end, two icons alone, a cell apart: ⊟ collapses
          every disk, ↗ opens in the system's file manager the folder the path's row shows. The row is drawn
          after the path's under it, so a control's name stands over the path. The header's presses do nothing
          while a popup of the explorer is up; ↗ and × are not the explorer's own moves. */}
      <box flexDirection="row" flexWrap="wrap" flexShrink={0} zIndex={10}>
        <For each={api.state().drives}>
          {(drive) => {
            const isShown = () => drive === api.state().drive
            return (
              <box flexShrink={0} onMouseUp={unlessFrozen(() => api.pickDrive(drive))}>
                <text
                  wrapMode="none"
                  selectable={false}
                  fg={isShown() ? HOVER_TEXT : undefined}
                  bg={isShown() ? FOLDER_COLOR : undefined}
                  attributes={isShown() ? BOLD : DIM}
                >
                  {` ${driveLabel(drive)} `}
                </text>
              </box>
            )
          }}
        </For>
        <box flexGrow={1} />
        {icon("collapse", { label: () => collapseLabel(api.icons()), color: () => (api.state().flashed === "collapse:" ? FLASH_COLOR : DIR_COLOR), tip: () => "colapsar", tipTop: 1 }, unlessFrozen(() => api.collapse()))}
        <text wrapMode="none" selectable={false} flexShrink={0}>
          {" "}
        </text>
        {icon("system", { label: () => " ↗ ", color: () => IDLE_COLOR, tip: () => systemTip(process.platform), tipTop: 1 }, () => api.openSystem())}
      </box>
      {/* The path: each folder from the disk down to the row selected, or to the session's; one pressed is gone to. */}
      <box flexDirection="row" flexShrink={0}>
        <For each={crumbs()}>
          {(part) => {
            const path = part.path
            if (path === undefined) {
              return (
                <text wrapMode="none" selectable={false} fg={BETWEEN_COLOR} flexShrink={0}>
                  {part.text}
                </text>
              )
            }
            const isPointed = () => !isFrozen() && crumb() === path
            return (
              <box
                flexShrink={0}
                onMouseDown={(event: MouseEvent) => {
                  event.stopPropagation()
                  setMenu(undefined)
                  if (!isFrozen() && event.button === LEFT) api.goTo(path)
                }}
                onMouseOver={() => setCrumb(path)}
                onMouseOut={() => setCrumb((now) => (now === path ? "" : now))}
              >
                <text
                  wrapMode="none"
                  selectable={false}
                  fg={isPointed() ? DIR_COLOR : lastCrumb() === path ? FOLDER_COLOR : CRUMB_COLOR}
                  attributes={(lastCrumb() === path ? BOLD : 0) | (isPointed() ? UNDERLINE : 0)}
                >
                  {part.text}
                </text>
              </box>
            )
          }}
        </For>
      </box>
      {/* The one field: a pattern, Enter, and the tree holds only the disk's files that match; a path, and the
          tree opens down to it. With a filter on, ‖ holds its search and × brings the whole tree back. */}
      <box flexDirection="row" flexShrink={0}>
        {/* The magnifier, in the color of what the field finds, is the field's too: a press on it, or anywhere
            on the field's line, gives the field the keys. */}
        <box flexShrink={0} onMouseUp={unlessFrozen(() => setTyping(true))}>
          <text wrapMode="none" selectable={false} fg={VIEWABLE_COLOR} flexShrink={0}>
            {api.icons() === "nerd" ? "  " : " 🔎"}
          </text>
        </box>
        <box flexGrow={1} flexShrink={1} onMouseUp={unlessFrozen(() => setTyping(true))}>
          <input
            id="speedy-explorer-field"
            ref={(one: unknown) => {
              field = one as Field
            }}
            focused={typing()}
            placeholder={FIELD_HINT}
            placeholderColor="#868e96"
            textColor={VIEWABLE_COLOR}
            focusedTextColor={VIEWABLE_COLOR}
            cursorColor={VIEWABLE_COLOR}
            onInput={(value: string) => setFieldText(value)}
            onSubmit={() => {
              setTyping(false)
              api.submit(typed(field))
            }}
          />
        </box>
        <Show when={api.state().filter !== undefined}>
          {icon(
            "pause",
            {
              label: () => pauseLabel(api.state().filter),
              color: () => (api.state().filter?.isPaused ? FLASH_COLOR : api.state().filter?.isBusy ? VIEWABLE_COLOR : IDLE_COLOR),
              isBold: () => api.state().filter?.isBusy === true || api.state().filter?.isPaused === true,
              tip: () => pauseTip(api.state().filter),
              tipTop: -1,
            },
            unlessFrozen(() => api.pauseFilter()),
          )}
          {icon(
            "unfilter",
            { label: () => UNFILTER_LABEL, color: () => CLOSE_COLOR, tip: () => "limpiar filtro", tipTop: -1 },
            unlessFrozen(() => {
              setTyping(false)
              api.clearFilter()
            }),
          )}
        </Show>
        {/* ⏎ searches for what the field holds, as Enter does: drawn over the field, right after its text, the
            one ⏎ of the line, green for a second as a press taken. The field keeps the whole line: a press
            anywhere else on it gives it the keys. */}
        <box position="absolute" top={0} left={searchAt()} zIndex={20} flexShrink={0}>
          {icon(
            "search",
            { label: () => SEARCH_LABEL, color: () => (api.state().flashed === "search:" ? FLASH_COLOR : VIEWABLE_COLOR), tip: () => "buscar", tipTop: -1 },
            unlessFrozen(() => {
              setTyping(false)
              api.search(typed(field))
            }),
          )}
        </box>
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
        // The wheel and the bar move nothing while the explorer holds still.
        onMouseDrag={stay}
        onMouseUp={stay}
        onMouseDown={(event: MouseEvent) => {
          event.stopPropagation()
          if (isFrozen()) return void stay()
          if (menu()) return void setMenu(undefined)
          setSelected("")
          api.pick(undefined)
        }}
        onMouseScroll={() => {
          setMenu(undefined)
          stay()
        }}
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
