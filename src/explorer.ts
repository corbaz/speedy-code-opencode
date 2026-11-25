/**
 * The explorer the footer's folder opens beside the chat, in place of the system's file manager: the
 * disks on top, and under them the chosen disk's tree, open down to the session's folder.
 *
 * Everything here is pure or works through the `ExplorerIO` it is given, so the panel that draws it
 * (`explorer-panel.tsx`) is a view of `ExplorerState` and the tests drive it with a fake file system.
 * The helpers are the Claude Code plugin's own, ported as they are.
 *
 * Each file has five tools at its right: 📋 puts it on the clipboard and attaches it to the prompt as
 * `@path`, 🔗 puts its path in both, ✏ renames it, 🗑 sends it to the trash and 📥 copies or moves here what
 * 📋 took last, each of the last three after a dialog. 📥 is grey until 📋 took a file or a folder. ⊟ beside
 * the disks collapses every disk; the session's stays open down to its folder.
 *
 * Under the field for a path, the filter's: a pattern (`*.pdf`, `a*.docx`), Enter, and the disk shown is
 * searched; the tree holds only the files found, under their folders. × clears it and the whole tree is back.
 */

import { newNameOf } from "./file-tools"
import { cells } from "./footer"
import type { IconSet } from "./icons"
import { fileMention } from "./viewer"

/** An entry of a folder as the file system reports it. */
export interface FsEntry {
  readonly name: string
  readonly kind: "file" | "dir" | "other"
  readonly isLink: boolean
}

/** An entry as the tree lists it: links are shown, never followed. */
export interface ExplorerEntry {
  readonly name: string
  readonly kind: "dir" | "file" | "link"
}

/** A folder read for the tree: its entries, and how many were left out. */
export interface ExplorerListing {
  readonly entries: readonly ExplorerEntry[]
  readonly left: number
}

/** What the explorer shows. Folder keys are `pathKey`s: on Windows `C:/Users` and `c:/users` are one. */
export interface ExplorerState {
  readonly drives: readonly string[]
  /** The disk whose tree is shown. */
  readonly drive: string
  /** The keys of the folders open, on every disk: each disk keeps what was open in it. */
  readonly open: readonly string[]
  /** Each folder read, by key; `denied` when it could not be read. */
  readonly listed: Readonly<Record<string, ExplorerListing | "denied">>
  /** The session's folder, with `/` alone. */
  readonly here: string
  readonly caseless: boolean
  /** The tree row to show first; -1 puts the session's folder in the middle. */
  readonly top: number
  /** The tool just pressed (`copy:<path>`, `collapse:`), green for a second; empty or absent: none. */
  readonly flashed?: string
  /** Counts the collapses and the paths gone to: each one puts its row in the middle again, even with `top` already -1. */
  readonly turn?: number
  /** The key of the path pasted in the field under the disks and found, marked in the tree; absent: none. */
  readonly found?: string
  /** The filter, while one is on: the tree is its own. */
  readonly filter?: ExplorerFilter
  /** Counts the times the filter was cleared: each one empties its field. */
  readonly cleared?: number
  /** The file or the folder 📋 took last, which 📥 copies or moves into another folder; absent: none, and 📥 is grey. */
  readonly clip?: string
  /** The key of the file the viewer was last opened on, marked yellow until another press. */
  readonly viewed?: string
}

/** The explorer's filter: the files of the disk shown whose names match a pattern, as the search finds them. */
export interface ExplorerFilter {
  /** As typed: `*.pdf`. */
  readonly pattern: string
  /** The files found so far, each path with `/` alone. */
  readonly paths: readonly string[]
  /** The entries the search looked at. */
  readonly seen: number
  /** Whether the search still runs. */
  readonly isBusy: boolean
  /** Whether it stopped at the most files a filter shows. */
  readonly isCut: boolean
  /** The keys of the folders closed by hand in the filter's tree, where every folder is open. */
  readonly closed: readonly string[]
  /** Whether its search is held by hand, by ‖ pausar: it waits where it is, and ▶ seguir lets it go on. */
  readonly isPaused?: boolean
}

/** What the explorer reads and does outside itself. */
export interface ExplorerIO {
  list(path: string): Promise<readonly FsEntry[]>
  /** Whether a path is a folder that answers: a disk's root, for the drives. */
  isDir(path: string): Promise<boolean>
  /** Opens a folder in the system's file manager. */
  openFolder(folder: string): void
  /** Shows a file in the viewer popup; `onShown` hears when it is up (`true`), or that it never was (`false`). */
  view(path: string, onShown?: (isShown: boolean) => void): void
  /** Puts a file on the clipboard as a file, to paste in a folder; whether it went. */
  copyFile(native: string): Promise<boolean>
  /** Puts a text on the clipboard; whether it went. */
  copyText(text: string): Promise<boolean>
  /** Writes `text` into the prompt at the cursor, `separator` before it unless what is before ends apart: see promptInsertion. */
  insert(text: string, separator: " " | "\n"): Promise<void>
  /**
   * Asks in the dialog: `rename <base64 name>` or `name <name>`, `delete`, or `cancel`. A folder (`dir`) is
   * asked one name, with no extension, and goes to the trash with what it holds. 📥's (`paste`) asks whether
   * the file is copied or moved into the folder `into`, then whether for sure: `copy`, `move` or `cancel`.
   * 📁's (`mkdir`) asks the name of a folder to make in the folder `native`: `mkdir <base64 name>` or
   * `name <name>`, or `cancel`.
   */
  ask(mode: "rename" | "delete" | "paste" | "mkdir", native: string, kind?: "file" | "dir", into?: string): Promise<string>
  /**
   * Copies or moves a file or a folder to `nativeTarget`, its own name included, writing over nothing; whether
   * it did. `kept`: it was copied, but what was to move could not be removed where it was.
   */
  paste(verb: "copy" | "move", native: string, nativeTarget: string): Promise<boolean | "kept">
  /** Holds the search `find` started last where it is (`true`), or lets it go on from there (`false`). */
  hold?(isHeld: boolean): void
  /** Renames a file in its folder; whether it did. */
  rename(native: string, name: string, nativeTarget: string): Promise<boolean>
  /** Makes a folder, writing over nothing; whether it did. */
  mkdir(nativeTarget: string): Promise<boolean>
  /** Sends a file to the trash, where it can be got back; whether it went. */
  trash(native: string): Promise<boolean>
  /** Whether something is at a path. */
  exists(native: string): Promise<boolean>
  /** Says something to the person, an error or not. */
  toast(message: string, isError?: boolean): void
  /** Waits; the pressed tool is green for this long. */
  wait(ms: number): Promise<void>
  /**
   * Searches `root` (a native path) for the files whose names match `pattern`, `first` before the rest, up to
   * `most`: each line find_files.py says goes to `onLine`, and `onEnd` hears its end. What it gives back stops it.
   */
  find(ask: { root: string; first: string; pattern: string; most: number }, onLine: (line: string) => void, onEnd: () => void): () => void
  /**
   * The other machines reached by ssh, by the names ssh knows them: each one's disk stands after this
   * machine's, `mac:/`. Where there is none to ask, there are no such disks.
   */
  remotes?(): Promise<string[]>
  /** This machine's folders that are another machine's disk mounted over the network, as remote.py names them. */
  mounts?(): Promise<string[]>
  /** Where another machine's disk opens: its person's folder there, and `/` on one with Windows. Empty: it did not say. */
  home?(host: string): Promise<string>
}

/** The most entries a folder shows: a folder with thousands would bury the tree. */
export const EXPLORER_MOST = 500

/** The most files a filter shows: more would bury the tree, and the pattern can be made narrower. */
export const FILTER_MOST = 50000

/** The most rows a filter's tree shows: the search goes on past them, and the rule counts every file found. */
export const FILTER_ROWS_MOST = 300

/** What the filter's field says while empty. */
export const FILTER_HINT = "filtro: *.pdf, a*.docx"

/** The filter's ×, beside its field. */
export const UNFILTER_LABEL = " × limpiar "

/** Beside it: holds a search that runs; held, it is the one that lets it go on from where it was. */
export const pauseLabel = (filter: ExplorerFilter | undefined) => (filter?.isPaused ? " ▸ seguir " : " ‖ pausar ")

/** How long a file pressed stays green when its popup never says it is up. */
export const OPENING_MOST_MS = 20000

export const EMPTY_EXPLORER: ExplorerState = { drives: [], drive: "", open: [], listed: {}, here: "", caseless: false, top: 0 }

/** A path with `/` alone, as the explorer keeps every path. */
export const slashed = (path: string) => path.replace(/\\/g, "/")

/** A folder's entry under it: a disk's root ends in `/` already. */
const joinPath = (parent: string, name: string) => (parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`)

/** How the explorer knows a path again: on Windows `C:/Users` and `c:/users` are one folder. */
export const pathKey = (path: string, caseless: boolean) => (caseless ? slashed(path).toLowerCase() : slashed(path))

/** Whether `path` is `folder` or lies under it, both keys. */
const isUnder = (path: string, folder: string) =>
  path === folder || path.startsWith(folder.endsWith("/") ? folder : `${folder}/`)

/**
 * A path on another machine's disk, reached by ssh: `mac:/Users/ana` is the machine, as ssh knows it, and its
 * own path. A disk of Windows has one letter before its `:`, a machine two at least.
 */
export function remoteOf(path: string): { host: string; path: string } | undefined {
  const found = /^([A-Za-z][\w.-]+):(\/.*)$/.exec(slashed(path))
  return found ? { host: found[1] as string, path: found[2] as string } : undefined
}

/**
 * A path of another machine as that machine writes it: a Mac's as it is; one of Windows, under the machine's
 * root as `/C:/Users/ana`, is `C:\\Users\\ana`.
 */
export const thereOf = (path: string) => /^\/[A-Za-z]:/.test(path) ? (path.length === 3 ? `${path.slice(1)}\\` : path.slice(1).replace(/\//g, '\\')) : path

/** The disk a path is on: the longest of `drives` it lies under, or the first disk when none holds it. */
export function driveOf(path: string, drives: readonly string[], caseless: boolean): string {
  const key = pathKey(path, caseless)
  const holding = drives.filter((drive) => isUnder(key, pathKey(drive, caseless)))
  return holding.sort((a, b) => b.length - a.length)[0] ?? drives[0] ?? ""
}

/** Each folder from the disk down to `path`, both included; the disk alone for a path not on it. */
export function chainOf(path: string, drive: string): string[] {
  const plain = slashed(path)
  if (!isUnder(plain.toLowerCase(), drive.toLowerCase())) return [drive]
  const chain = [drive]
  for (const name of plain.slice(drive.length).split("/").filter(Boolean)) {
    chain.push(joinPath(chain[chain.length - 1] ?? drive, name))
  }
  return chain
}

/** A disk as its button names it: `C:` on Windows, `/` for the Mac's own and its name for another volume. */
export function driveLabel(drive: string): string {
  if (/^[A-Za-z]:\/?$/.test(drive)) return drive.slice(0, 2).toUpperCase()
  // Another machine's disk is named as the machine.
  const remote = remoteOf(drive)
  if (remote?.path === "/") return remote.host
  return drive === "/" ? "/" : (drive.split("/").filter(Boolean).pop() ?? drive)
}

/** A folder's entries as the tree lists them: folders and links first, then files, each by name whatever its case. */
export function listingOf(entries: readonly FsEntry[], most = EXPLORER_MOST): ExplorerListing {
  const kindOf = (entry: FsEntry): ExplorerEntry["kind"] => (entry.isLink ? "link" : entry.kind === "dir" ? "dir" : "file")
  const sorted = entries
    .map((entry) => ({ name: entry.name, kind: kindOf(entry) }))
    .sort(
      (a, b) =>
        Number(a.kind === "file") - Number(b.kind === "file") ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
    )
  return { entries: sorted.slice(0, most), left: Math.max(0, sorted.length - most) }
}

/** A row of the tree: an entry, or a note under a folder (not read yet, unreadable, empty, entries left). */
export interface TreeRow {
  readonly path: string
  readonly name: string
  readonly depth: number
  readonly kind: ExplorerEntry["kind"] | "note"
  readonly isOpen: boolean
  readonly isHere: boolean
  /** The path pasted in the field and found. */
  readonly isFound?: boolean
}

/**
 * The tree of a filter, flat: the disk, then only the folders that hold a file found, down to each one, all
 * open but those closed by hand. Folders first, then files, each by name, as the whole tree lists them.
 */
export function filterRows(state: ExplorerState, filter: ExplorerFilter): TreeRow[] {
  type Folder = { path: string; folders: Map<string, Folder>; files: string[] }
  const root: Folder = { path: state.drive, folders: new Map(), files: [] }
  const disk = pathKey(state.drive, state.caseless)
  for (const path of filter.paths) {
    if (!isUnder(pathKey(path, state.caseless), disk)) continue
    const names = path.slice(state.drive.length).split("/").filter(Boolean)
    const file = names.pop()
    if (!file) continue
    let folder = root
    for (const name of names) {
      const key = pathKey(name, state.caseless)
      let next = folder.folders.get(key)
      if (!next) folder.folders.set(key, (next = { path: joinPath(folder.path, name), folders: new Map(), files: [] }))
      folder = next
    }
    folder.files.push(file)
  }
  const here = pathKey(state.here, state.caseless)
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
  const last = (path: string) => path.slice(path.lastIndexOf("/") + 1)
  const rows: TreeRow[] = []
  const walk = (folder: Folder, name: string, depth: number): void => {
    const key = pathKey(folder.path, state.caseless)
    const isOpen = !filter.closed.includes(key)
    rows.push({ path: folder.path, name, depth, kind: "dir", isOpen, isHere: key === here })
    if (!isOpen) return
    for (const next of [...folder.folders.values()].sort((a, b) => byName(last(a.path), last(b.path)))) walk(next, last(next.path), depth + 1)
    for (const file of [...folder.files].sort(byName)) {
      rows.push({ path: joinPath(folder.path, file), name: file, depth: depth + 1, kind: "file", isOpen: false, isHere: false })
    }
  }
  const label = /^[A-Za-z]:\/$/.test(state.drive) ? `${driveLabel(state.drive)}\\` : state.drive
  walk(root, label, 0)
  const note = (name: string) => void rows.push({ path: `${state.drive}#${name}`, name, depth: 1, kind: "note", isOpen: false, isHere: false })
  if (rows.length === 1) note(filter.isBusy ? "buscando…" : "(ningún archivo coincide)")
  else if (filter.isCut) note(`… hay más: son los primeros ${filter.paths.length}`)
  // The panel draws every row it is given, and thousands of them stall it: the tree shows the first ones,
  // and says how many files more the search found.
  if (rows.length > FILTER_ROWS_MOST) {
    const shown = rows.slice(0, FILTER_ROWS_MOST)
    const left = filter.paths.length - shown.filter((row) => row.kind === "file").length
    shown.push({ path: `${state.drive}#más`, name: `… y ${left.toLocaleString("es-AR")} más: afiná el filtro para verlos`, depth: 1, kind: "note", isOpen: false, isHere: false })
    return shown
  }
  return rows
}

/** What the rule under the filter says of it: the pattern, the files found, and the entries seen while it searches. */
export function filterNote(filter: ExplorerFilter): string {
  const count = filter.paths.length
  const found = `${count} ${count === 1 ? "archivo" : "archivos"}`
  if (filter.isBusy) return ` ${filter.pattern}: ${found}, buscando… (${filter.seen.toLocaleString("es-AR")} vistos) `
  return filter.isPaused ? ` ${filter.pattern}: ${found}, en pausa ` : ` ${filter.pattern}: ${found} `
}

/** The rule under the fields, `width` cells: plain, or with what the filter found written on it. */
export function ruleLabel(state: ExplorerState, width: number): string {
  if (!state.filter) return "─".repeat(width)
  return `─${cutCells(filterNote(state.filter), Math.max(1, width - 2))}`.padEnd(width, "─")
}

/** A pattern as typed in the filter's field: its spaces and quotes off. Empty: no filter. */
export function filterPattern(text: string): string {
  return text.trim().replace(/^["']+|["']+$/g, "").trim()
}

/** A line find_files.py said: the files found since the one before, the entries seen, whether it ended and whether cut short. */
export function filterLine(line: string): { paths: string[]; seen: number; isDone: boolean; isCut: boolean } | undefined {
  try {
    const said = JSON.parse(line) as { paths?: unknown; seen?: unknown; done?: unknown; cut?: unknown } | null
    if (!said || typeof said !== "object") return undefined
    const paths = Array.isArray(said.paths) ? said.paths.filter((one): one is string => typeof one === "string") : []
    return { paths, seen: typeof said.seen === "number" ? said.seen : 0, isDone: said.done === true, isCut: said.cut === true }
  } catch {
    return undefined
  }
}

/** The explorer after a file or a folder was renamed (`to`) or sent to the trash: a filter's files follow it. */
export function filterMoved(state: ExplorerState, from: string, to?: string): ExplorerState {
  if (!state.filter) return state
  const key = pathKey(from, state.caseless)
  const paths = state.filter.paths.flatMap((path) =>
    !isUnder(pathKey(path, state.caseless), key) ? [path] : to ? [`${to}${path.slice(from.length)}`] : [],
  )
  return { ...state, filter: { ...state.filter, paths } }
}

/** The tree of the disk shown, flat: the disk, then what each open folder holds under it; with a filter on, its tree. */
export function treeRows(state: ExplorerState): TreeRow[] {
  if (!state.drive) return []
  if (state.filter) return filterRows(state, state.filter)
  const here = pathKey(state.here, state.caseless)
  const found = state.found ?? ""
  const rows: TreeRow[] = []
  const note = (path: string, name: string, depth: number) =>
    void rows.push({ path: `${path}#${name}`, name, depth, kind: "note", isOpen: false, isHere: false })
  const walk = (path: string, name: string, kind: ExplorerEntry["kind"], depth: number): void => {
    const key = pathKey(path, state.caseless)
    const isOpen = kind === "dir" && state.open.includes(key)
    rows.push({ path, name, depth, kind, isOpen, isHere: kind === "dir" && key === here, isFound: key === found })
    if (!isOpen) return
    const listed = state.listed[key]
    if (listed === undefined) return note(path, "leyendo…", depth + 1)
    // Another machine's disk that does not answer was not reached by ssh.
    if (listed === "denied") return note(path, depth === 0 && remoteOf(path) ? "(sin conexión por ssh)" : "(sin acceso)", depth + 1)
    if (listed.entries.length === 0) return note(path, "(vacía)", depth + 1)
    for (const entry of listed.entries) walk(joinPath(path, entry.name), entry.name, entry.kind, depth + 1)
    if (listed.left > 0) note(path, `… y ${listed.left} más`, depth + 1)
  }
  const label = /^[A-Za-z]:\/$/.test(state.drive) ? `${driveLabel(state.drive)}\\` : state.drive
  walk(state.drive, label, "dir", 0)
  return rows
}

/**
 * The first tree row to show in a window of `room` rows: `top` kept within the tree, so its last row stays
 * at the bottom; -1 puts in the middle the path pasted in the field and found, or else the session's folder.
 */
export function windowTop(rows: readonly TreeRow[], top: number, room: number): number {
  const last = Math.max(0, rows.length - room)
  if (top >= 0) return Math.min(last, top)
  const found = rows.findIndex((row) => row.isFound)
  const here = found >= 0 ? found : rows.findIndex((row) => row.isHere)
  return Math.min(last, Math.max(0, here - Math.floor(room / 2)))
}

/**
 * Whether the explorer opens a file of this name in the viewer: every file. The viewer draws the kinds it
 * knows (text and code, pages, PDF, pictures, documents, sound and video, databases, shortcuts), reads any
 * other as text when it is text, and describes it when it is not.
 */
export function isViewable(name: string): boolean {
  return name.length > 0
}

/** A text cut to `most` cells, ending in … when it is longer: a name on one row, whatever its length. */
export function cutCells(text: string, most: number): string {
  if (cells(text) <= most) return text
  let out = ""
  for (const char of Array.from(text)) {
    if (cells(out + char) > most - 1) break
    out += char
  }
  return `${out}…`
}

/** Why a new file name cannot be used, or empty when it can: not empty, no folder separators, none of Windows' forbidden characters. */
export function badFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "el nombre está vacío"
  if (trimmed === "." || trimmed === "..") return "ese nombre no es válido"
  if (/[\\/:*?"<>|]/.test(trimmed) || /\p{Cc}/u.test(trimmed)) return 'el nombre no puede tener \\ / : * ? " < > |'
  return ""
}

/** What each file's tool does. */
export type FileToolKind = "mkdir" | "copy" | "path" | "rename" | "trash" | "paste" | "work"

/**
 * Each file's tools: what a press does, its emoji, its Nerd Fonts glyph and its color. 📁, the first, makes a
 * folder there; 📍, the last, is a folder's alone: the session goes to work there. Both are for this machine's
 * folders alone.
 */
export const FILE_TOOLS: ReadonlyArray<readonly [FileToolKind, string, string, string]> = [
  ["mkdir", "📁", "\uea80", "#ffd43b"],
  ["copy", "📋", "", "#74c0fc"],
  ["path", "🔗", "", "#63e6be"],
  ["rename", "✏", "", "#b197fc"],
  ["trash", "🗑", "", "#ff8787"],
  ["paste", "📥", "\uf0ea", "#ffa94d"],
  ["work", "📍", "\uf041", "#51cf66"],
]

/** 📥 while 📋 took nothing: grey, and with emoji a plain mark, as an emoji keeps its own colors. */
export const PASTE_IDLE_MARK = "↧"
export const PASTE_IDLE_COLOR = "#495057"

/** The tools that are grey on a disk's root, and do nothing there: a disk is not copied, renamed or trashed. */
export const DISK_IDLE_TOOLS: readonly FileToolKind[] = ["copy", "rename", "trash"]

/**
 * The cells the seven tools take at a row's right: each icon on its own two cells, a plain gap of two before
 * each but the first, which has one, and two empty cells after the last, which part it from the scroll bar.
 * A press a little off an icon lands on a gap and does nothing.
 */
export const FILE_TOOLS_WIDTH = 29

/** The color a pressed tool takes for a second, as a sign the press was taken: green, with no fill. */
export const FLASH_COLOR = "#51cf66"

/** How long a pressed tool stays green. */
export const FLASH_MS = 1000

/**
 * A file's or a folder's name as its row writes it: indented (a folder with its open mark), cut with … to
 * its room, and filled with spaces up to its tools.
 */
export function fileNameLabel(row: TreeRow, width: number): string {
  const room = Math.max(4, width - FILE_TOOLS_WIDTH)
  const cut = cutCells(row.kind === "dir" ? rowLabel(row) : `${"  ".repeat(row.depth)}  ${row.name}`, room)
  return cut + " ".repeat(Math.max(0, room - cells(cut)))
}

/**
 * A file's tools as its row draws them: each its glyph or emoji and its color, the one just pressed green.
 * 📥 is lit only while 📋 has taken a file or a folder to paste (`hasClip`). On a disk's root (`isDisk`) 📋, ✏
 * and 🗑 are grey. 📍 is on a folder of this machine alone (`isWorkable`); elsewhere its two cells are empty,
 * `isNone`, and a press there does nothing.
 */
export function fileTools(
  icons: IconSet,
  flashed: string,
  path: string,
  hasClip = false,
  isDisk = false,
  isWorkable = false,
): Array<{ kind: FileToolKind; label: string; gap: number; color: string; isNone: boolean }> {
  return FILE_TOOLS.map(([kind, emoji, glyph, color], index) => {
    if (kind === "work" && !isWorkable) return { kind, label: "  ", gap: 2, color: PASTE_IDLE_COLOR, isNone: true }
    const isIdle = (kind === "paste" && !hasClip) || (isDisk && DISK_IDLE_TOOLS.includes(kind))
    // An emoji, or a glyph with the cell it spills over: two cells, the tool's own.
    const icon = icons === "nerd" ? `${glyph}\u00a0` : kind === "paste" && isIdle ? PASTE_IDLE_MARK : emoji
    return {
      kind,
      label: icon + " ".repeat(Math.max(0, 2 - cells(icon))),
      gap: index === 0 ? 1 : 2,
      color: flashed === `${kind}:${path}` ? FLASH_COLOR : isIdle ? PASTE_IDLE_COLOR : color,
      isNone: false,
    }
  })
}

/** What the explorer's field says while empty: a path as the system writes one. */
export function gotoHint(platform: string): string {
  return `pegá una ruta y Enter: ${platform === "win32" ? "D:\\carpeta\\archivo" : "/Users/carpeta/archivo"}`
}

/** ⊟ beside the disks, as the icon set draws it. */
export function collapseLabel(icons: IconSet): string {
  return ` ${icons === "nerd" ? "" : "⊟"} `
}

/** A row as the panel writes it: indented by its depth, a folder with its open mark, the session's marked ●. */
export function rowLabel(row: TreeRow): string {
  const indent = "  ".repeat(row.depth)
  if (row.kind === "note") return `${indent}${row.name}`
  if (row.kind === "dir") return `${indent}${row.isOpen ? "▾" : "▸"} ${row.name}${row.isHere ? " ●" : ""}`
  return `${indent}${row.kind === "link" ? "↪ " : "  "}${row.name}`
}

/** What a press on a row does: a folder opens or closes, a file opens the viewer, the rest (links, notes) nothing. */
export function rowAction(row: TreeRow): "folder" | "view" | "none" {
  if (row.kind === "dir") return "folder"
  if (row.kind === "file" && isViewable(row.name)) return "view"
  return "none"
}

/**
 * A path as pasted in the explorer's field, `D:\Excel\rand.xlsx` or `"C:/a b/c"`: its quotes, its spaces and
 * a mention's `@` off, `/` for `\`, a disk's root ending in `/` and any other folder without one.
 */
export function pastedPath(text: string): string {
  const path = slashed(text.trim().replace(/^@/, "").replace(/^["']+|["']+$/g, "").trim())
  if (/^[A-Za-z]:\/?$/.test(path)) return `${path.slice(0, 2)}/`
  // Another machine's disk, `mac:` or `mac:/`: its root too ends in `/`.
  if (/^[A-Za-z][\w.-]+:\/*$/.test(path)) return `${path.slice(0, path.indexOf(":"))}:/`
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

/** A path as the system writes it: with `\` on Windows. A path of another machine stays as the explorer writes it. */
const nativeOf = (path: string, platform: string) => (platform === "win32" && !remoteOf(path) ? path.replace(/\//g, "\\") : path)

/** The folder a file of the tree is in: a disk's root keeps its `/`. */
const folderOf = (path: string) => {
  const parent = path.slice(0, path.lastIndexOf("/"))
  if (parent === "") return "/"
  return parent.endsWith(":") ? `${parent}/` : parent
}

/** A file's name, the last part of its path. */
const nameOf = (path: string) => slashed(path).split("/").pop() ?? path

/** A folder read for the tree; `denied` when it cannot be read. */
async function readFolder(io: ExplorerIO, path: string): Promise<ExplorerListing | "denied"> {
  try {
    return listingOf(await io.list(path))
  } catch {
    return "denied"
  }
}

/**
 * A folder read afresh with every folder still open under it, all at once, here or on another machine: what
 * came and went on the disk while it was closed shows when it opens again.
 */
async function readOpenTree(io: ExplorerIO, path: string, state: ExplorerState): Promise<ExplorerState["listed"]> {
  const fresh: Record<string, ExplorerListing | "denied"> = {}
  const walk = async (folder: string): Promise<void> => {
    const listed = await readFolder(io, folder)
    fresh[pathKey(folder, state.caseless)] = listed
    if (listed === "denied") return
    const open = listed.entries.filter(
      (entry) => entry.kind === "dir" && state.open.includes(pathKey(joinPath(folder, entry.name), state.caseless)),
    )
    await Promise.all(open.map((entry) => walk(joinPath(folder, entry.name))))
  }
  await walk(path)
  return fresh
}

/** A Mac's disks without those that are another machine's disk mounted over the network. */
export function withoutMounted(own: readonly string[], mounted: readonly string[]): string[] {
  const left = new Set(mounted.map((one) => one.replace(/\/+$/, "")))
  return own.filter((drive) => drive === "/" || !left.has(drive.replace(/\/+$/, "")))
}

/**
 * The disks there are: this machine's, then those of the other machines reached by ssh. Where there is one of
 * those, a Mac's folders that are another machine's disk mounted over the network are left out: that disk is
 * shown once, under its machine.
 */
async function readDrives(io: ExplorerIO, platform: string): Promise<string[]> {
  const [own, remote] = await Promise.all([ownDrives(io, platform), io.remotes?.().catch(() => [] as string[]) ?? []])
  const disks = remote.map((host) => `${host}:/`)
  if (platform === "win32" || disks.length === 0) return [...own, ...disks]
  return [...withoutMounted(own, (await io.mounts?.().catch(() => [] as string[])) ?? []), ...disks]
}

/** This machine's disks: each lettered root that answers on Windows; `/` and each volume mounted elsewhere. */
async function ownDrives(io: ExplorerIO, platform: string): Promise<string[]> {
  if (platform === "win32") {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    const found = await Promise.all(
      letters.map((letter) => io.isDir(`${letter}:/`).then((isDir) => (isDir ? `${letter}:/` : ""), () => "")),
    )
    return found.filter(Boolean)
  }
  // The Mac's own disk is under /Volumes too, as a link to /: it is / already.
  const volumes = await io.list("/Volumes").catch(() => [] as readonly FsEntry[])
  return ["/", ...volumes.filter((volume) => volume.kind === "dir" && !volume.isLink).map((volume) => `/Volumes/${volume.name}`)]
}

export interface Explorer {
  state(): ExplorerState
  /** Reads the disks and the tree down to `folder` afresh, the folder in the middle. */
  open(folder: string): Promise<void>
  /** A folder of the tree pressed: open, it closes; closed, it opens and is read afresh. */
  toggleFolder(path: string): Promise<void>
  /**
   * A disk pressed: its tree, its root open. The session's disk shows the session's folder in the middle again.
   * Another machine's opens down to its person's folder, in the middle and marked; one with Windows at its
   * root, where its disks are.
   */
  pickDrive(drive: string): Promise<void>
  /** `↗ abrir en el sistema`: the session's folder in the system's file manager. */
  openSystem(): void
  /** A file pressed: the viewer shows it, when it is one the viewer shows. */
  pressFile(path: string): void
  /** 📋: the file to the clipboard as a file, and attached to the prompt as `@path`. */
  copyFile(path: string): Promise<void>
  /** 🔗: the file's path, as the system writes it, to the clipboard and into the prompt. */
  copyPath(path: string): Promise<void>
  /** A tool pressed turns green for a second, with no fill: the press was taken. `key` is `<tool>:<path>`. */
  flash(key: string): void
  /** ✏: the dialog asks the new name, then the file is renamed in its folder and the folder read again. */
  rename(path: string): Promise<void>
  /**
   * 📁: the dialog asks the new folder's name, then the folder is made where the row is: in a folder, inside
   * it; on a file, in the folder it is in. That folder is read again and opened, to show it.
   */
  newFolder(path: string): Promise<void>
  /** 🗑: the dialog asks, then the file goes to the trash and its folder is read again. */
  trash(path: string): Promise<void>
  /**
   * 📥: what 📋 took last is copied or moved into a row's folder (a file's row: the folder it is in), once the
   * dialog asked which, and whether for sure. Nothing is written over, a folder does not go into itself, and
   * another machine's folders take nothing. Moved, nothing is taken any more.
   */
  paste(path: string): Promise<void>
  /**
   * ⊟: every disk collapses. On the session's, every folder closes but those down to its folder; on the others,
   * all close but the root. The disk shown stays shown: the session's puts its folder in the middle, another its top.
   */
  collapse(): void
  /**
   * A path pasted in the field under the disks: the tree opens down to it, on its disk, and puts it in the
   * middle, marked; for a file its folder opens and the file is the row marked. A path not absolute is taken
   * from the session's folder.
   */
  goTo(text: string): Promise<void>
  /**
   * A pattern typed in the filter's field, Enter: the disk shown is searched for the files whose names match,
   * the session's folder first, and the tree holds those alone as they are found. An empty one clears it.
   */
  filter(text: string): void
  /** The filter's ×: the search ends, the field empties and the whole tree is back. */
  clearFilter(): void
  /** ‖ pausar: a search that runs waits where it is, the tree keeping the files found; pressed again, it goes on. */
  pauseFilter(): void
}

/** The explorer's state and what its presses do; `onChange` hears every new state. */
export function createExplorer(io: ExplorerIO, platform: string, onChange?: (state: ExplorerState) => void): Explorer {
  let state = EMPTY_EXPLORER
  // The folder as the session gave it, for the system's file manager.
  let folder = ""
  const set = (next: (now: ExplorerState) => ExplorerState) => {
    state = next(state)
    onChange?.(state)
  }
  const caseless = platform === "win32"
  // The tool pressed turns green, and back to its color a second later unless another was pressed meanwhile.
  const flash = (key: string) => {
    set((now) => ({ ...now, flashed: key }))
    void io.wait(FLASH_MS).then(() => {
      if (state.flashed === key) set((now) => ({ ...now, flashed: "" }))
    })
  }
  // The search a filter runs, while it does: called, it stops.
  let stopFinding: (() => void) | undefined
  const endFinding = () => {
    stopFinding?.()
    stopFinding = undefined
  }
  const find = (pattern: string) => {
    endFinding()
    if (!state.drive) return
    set((now) => ({ ...now, top: 0, found: undefined, turn: (now.turn ?? 0) + 1, filter: { pattern, paths: [], seen: 0, isBusy: true, isCut: false, closed: [] } }))
    // The lines of a search another one took the place of are not heard.
    let isOver = false
    const stop = io.find(
      { root: nativeOf(state.drive, platform), first: nativeOf(state.here, platform), pattern, most: FILTER_MOST },
      (line) => {
        const said = filterLine(line)
        if (!said || isOver) return
        set((now) =>
          now.filter
            ? // A search held only says it is still there: it stays held until let go, or until it ends.
              { ...now, filter: { ...now.filter, paths: said.paths.length > 0 ? [...now.filter.paths, ...said.paths] : now.filter.paths, seen: Math.max(said.seen, now.filter.seen), isBusy: !said.isDone && !now.filter.isPaused, isPaused: !said.isDone && now.filter.isPaused === true, isCut: said.isCut } }
            : now,
        )
      },
      () => {
        if (isOver) return
        set((now) => (now.filter?.isBusy || now.filter?.isPaused ? { ...now, filter: { ...now.filter, isBusy: false, isPaused: false } } : now))
      },
    )
    stopFinding = () => {
      isOver = true
      stop()
    }
  }
  const clearFilter = () => {
    endFinding()
    set((now) => ({ ...now, filter: undefined, cleared: (now.cleared ?? 0) + 1, top: -1, turn: (now.turn ?? 0) + 1 }))
  }
  // Any press in the explorer takes the mark off the path the field found: the yellow fill follows the pointer again.
  const forget = () => {
    if (state.found !== undefined || state.viewed !== undefined) set((now) => ({ ...now, found: undefined, viewed: undefined }))
  }
  // A folder of the tree read again, after a file in it was renamed or sent to the trash.
  const reread = async (path: string) => {
    const key = pathKey(path, state.caseless)
    const listed = await readFolder(io, path)
    set((now) => ({ ...now, listed: { ...now.listed, [key]: listed } }))
  }
  const renameTo = async (path: string, wanted: string) => {
    const name = wanted.trim()
    const old = nameOf(path)
    if (!name || name === old) return
    const why = badFileName(name)
    if (why) return io.toast(`no renombré ${old}: ${why}.`, true)
    const folder = folderOf(slashed(path))
    const target = joinPath(folder, name)
    // The same file in another case is a rename too; another file is never overwritten.
    if (name.toLowerCase() !== old.toLowerCase() && (await io.exists(nativeOf(target, platform)))) {
      return io.toast(`ya hay un archivo ${name} en esa carpeta.`, true)
    }
    if (!(await io.rename(nativeOf(path, platform), name, nativeOf(target, platform)))) {
      return io.toast(`no pude renombrar ${old}.`, true)
    }
    io.toast(`${old} ahora se llama ${name}.`)
    set((now) => filterMoved(now, slashed(path), target))
    await reread(folder)
  }
  // Where each other machine's disk opens, once it said; empty when it did not, and it is asked again the next time.
  const homes = new Map<string, string>()
  const homeOf = async (drive: string) => {
    const remote = remoteOf(drive)
    if (!remote || !io.home) return ""
    const known = homes.get(remote.host)
    if (known !== undefined) return known
    const home = await io.home(remote.host).catch(() => "")
    if (!home.startsWith("/")) return ""
    homes.set(remote.host, home)
    return home
  }
  // A disk is not copied, renamed or trashed: 📋, ✏ and 🗑 do nothing on its root but say so.
  const notOnDisk = (path: string) => {
    const isDisk = state.drives.some((drive) => pathKey(drive, state.caseless) === pathKey(path, state.caseless))
    if (isDisk) io.toast("un disco no se copia, no se renombra ni se borra.", true)
    return isDisk
  }
  const explorer: Explorer = {
    state: () => state,
    async open(where) {
      endFinding()
      folder = where
      const here = slashed(where)
      const drives = await readDrives(io, platform)
      const drive = driveOf(here, drives, caseless)
      const chain = drive ? chainOf(here, drive) : []
      const chainRead = await Promise.all(chain.map(async (path) => [pathKey(path, caseless), await readFolder(io, path)] as const))
      // What 📋 took stays taken while the explorer is closed.
      set((now) => ({ drives, drive, open: chainRead.map(([key]) => key), listed: Object.fromEntries(chainRead), here, caseless, top: -1, clip: now.clip }))
    },
    async toggleFolder(path) {
      forget()
      const key = pathKey(path, state.caseless)
      // In a filter's tree every folder is open: a press closes it, and another opens it again.
      if (state.filter) {
        set((now) =>
          now.filter
            ? { ...now, filter: { ...now.filter, closed: now.filter.closed.includes(key) ? now.filter.closed.filter((one) => one !== key) : [...now.filter.closed, key] } }
            : now,
        )
        return
      }
      if (state.open.includes(key)) {
        set((now) => ({ ...now, open: now.open.filter((one) => one !== key) }))
        return
      }
      set((now) => ({ ...now, open: [...now.open, key] }))
      const fresh = await readOpenTree(io, path, state)
      set((now) => ({ ...now, listed: { ...now.listed, ...fresh } }))
    },
    async pickDrive(drive) {
      forget()
      const key = pathKey(drive, state.caseless)
      const top = driveOf(state.here, state.drives, state.caseless) === drive ? -1 : 0
      const isAnother = drive !== state.drive
      set((now) => ({ ...now, drive, top, open: now.open.includes(key) ? now.open : [...now.open, key] }))
      // A filter follows the disk: it is searched as the one before was.
      const home = remoteOf(drive) && !state.filter ? homeOf(drive) : undefined
      if (state.filter && isAnother) find(state.filter.pattern)
      if (state.listed[key] === undefined) {
        const listed = await readFolder(io, drive)
        set((now) => ({ ...now, listed: { ...now.listed, [key]: listed } }))
      }
      const where = await home
      // Unless another disk was pressed meanwhile.
      if (where && where !== "/" && state.drive === drive) await explorer.goTo(`${drive.slice(0, -1)}${where}`)
    },
    openSystem() {
      io.openFolder(folder)
    },
    pressFile(path) {
      forget()
      if (!isViewable(nameOf(path))) return
      // The name is green from the press until the popup is up, however long that takes; then the file stays
      // marked yellow, as the one being looked at, until another press.
      const key = `view:${path}`
      set((now) => ({ ...now, flashed: key }))
      const over = (isShown: boolean) => {
        if (state.flashed !== key) return
        set((now) => ({ ...now, flashed: "", viewed: isShown ? pathKey(path, now.caseless) : now.viewed }))
      }
      void io.wait(OPENING_MOST_MS).then(() => over(false))
      io.view(path, over)
    },
    async copyFile(path) {
      forget()
      if (notOnDisk(path)) return
      flash(`copy:${path}`)
      const native = nativeOf(path, platform)
      // A folder of another machine is not brought here to be taken: 📥 brings it where it is pasted.
      const remote = remoteOf(path)
      if (remote && (await io.isDir(path).catch(() => false))) {
        set((now) => ({ ...now, clip: slashed(path) }))
        return io.toast(`la carpeta ${nameOf(path) || remote.host} de ${remote.host} está lista para pegar con 📥.`)
      }
      const isCopied = await io.copyFile(native)
      // A file of another machine: its copy here went to the clipboard, and its path there goes into the prompt.
      // 📥 pastes what was taken last: a file or a folder of this machine, or a file of another one.
      if (isCopied) set((now) => ({ ...now, clip: slashed(path) }))
      if (remote) {
        await io.insert(slashed(path), " ")
        if (isCopied) io.toast(`la ruta de ${nameOf(path)} en ${remote.host} está en el prompt y una copia suya en el portapapeles; pegala en una carpeta.`)
        else io.toast(`la ruta de ${nameOf(path)} en ${remote.host} está en el prompt; no pude copiar el archivo al portapapeles.`, true)
        return
      }
      // Attached to the prompt too, as a file is mentioned there: @path.
      await io.insert(fileMention(native), " ")
      const name = nameOf(path)
      if (isCopied) io.toast(`${name} está adjunto en el prompt y en el portapapeles; pegalo en una carpeta.`)
      else io.toast(`${name} está adjunto en el prompt; no pude copiarlo al portapapeles.`, true)
    },
    async copyPath(path) {
      forget()
      flash(`path:${path}`)
      // A path of another machine is copied as that machine writes it.
      const there = remoteOf(path)
      const native = there ? thereOf(there.path) : nativeOf(path, platform)
      const isCopied = await io.copyText(native)
      // Into the prompt as well, so it need not be pasted; the clipboard keeps it for elsewhere.
      await io.insert(native, " ")
      if (isCopied) io.toast(`la ruta ${native} está en el prompt y en el portapapeles`)
      else io.toast(`la ruta ${native} está en el prompt; no pude copiarla al portapapeles.`, true)
    },
    async rename(path) {
      forget()
      if (notOnDisk(path)) return
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      const name = newNameOf(await io.ask("rename", nativeOf(path, platform), kind))
      if (name) await renameTo(path, name)
    },
    async newFolder(path) {
      forget()
      flash(`mkdir:${path}`)
      const folder = (await io.isDir(path).catch(() => false)) ? slashed(path) : folderOf(slashed(path))
      const name = newNameOf(await io.ask("mkdir", nativeOf(folder, platform), "dir")).trim()
      if (!name) return
      const why = badFileName(name)
      if (why) return io.toast(`no creé la carpeta: ${why}.`, true)
      const target = joinPath(folder, name)
      // Nothing there is written over.
      if (await io.exists(nativeOf(target, platform))) return io.toast(`ya hay un ${name} en esa carpeta.`, true)
      if (!(await io.mkdir(nativeOf(target, platform)))) return io.toast(`no pude crear la carpeta ${name}.`, true)
      io.toast(`se creó la carpeta ${name} en ${driveLabel(folder)}.`)
      const key = pathKey(folder, state.caseless)
      set((now) => ({ ...now, open: now.open.includes(key) ? now.open : [...now.open, key] }))
      await reread(folder)
    },
    async trash(path) {
      forget()
      if (notOnDisk(path)) return
      const native = nativeOf(path, platform)
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      if ((await io.ask("delete", native, kind)) !== "delete") return
      const name = nameOf(path)
      if (!(await io.trash(native))) return io.toast(`no pude mandar ${name} a la papelera.`, true)
      io.toast(`${name} fue a la papelera.`)
      set((now) => filterMoved(now, slashed(path)))
      await reread(folderOf(slashed(path)))
    },
    async paste(path) {
      forget()
      const clip = state.clip
      if (!clip) return io.toast("primero copiá un archivo o una carpeta con 📋.", true)
      const name = nameOf(clip)
      if (!(await io.exists(nativeOf(clip, platform)))) {
        set((now) => ({ ...now, clip: undefined }))
        return io.toast(`${name} ya no está donde se copió.`, true)
      }
      const isFolder = await io.isDir(clip).catch(() => false)
      const folder = (await io.isDir(path).catch(() => false)) ? slashed(path) : folderOf(slashed(path))
      // Across machines it goes by remote.py: from another machine here, from here to it, or within it.
      const from = remoteOf(clip)
      const to = remoteOf(folder)
      if (from && to && from.host !== to.host) return io.toast(`de ${from.host} a ${to.host} no se pega: traelo primero a esta máquina.`, true)
      const target = joinPath(folder, name)
      const key = (one: string) => pathKey(one, state.caseless)
      if (key(folderOf(clip)) === key(folder)) return io.toast(`${name} ya está en esa carpeta.`, true)
      if (isFolder && isUnder(key(folder), key(clip))) return io.toast(`${name} no puede ir dentro de sí misma.`, true)
      if (await io.exists(nativeOf(target, platform))) return io.toast(`ya hay un ${name} en esa carpeta.`, true)
      const verb = await io.ask("paste", nativeOf(clip, platform), isFolder ? "dir" : "file", nativeOf(folder, platform))
      if (verb !== "copy" && verb !== "move") return
      const isMove = verb === "move"
      // Across machines it takes a while: it says it started.
      if (from || to) io.toast(`${isMove ? "moviendo" : "copiando"} ${name}…`)
      const said = await io.paste(verb, nativeOf(clip, platform), nativeOf(target, platform))
      if (!said) return io.toast(`no pude ${isMove ? "mover" : "copiar"} ${name}.`, true)
      // Copied, but what was to move could not be removed where it was.
      const isMoved = isMove && said !== "kept"
      if (said === "kept") io.toast(`${name} se copió a ${driveLabel(folder)}, pero no pude quitarlo de donde estaba.`, true)
      else io.toast(`${name} se ${isMove ? "movió" : "copió"} a ${driveLabel(folder)}.`)
      // The folder it went into is read again, and opened to show it; moved, the one it left too.
      set((now) => {
        const next = { ...now, open: now.open.includes(key(folder)) ? now.open : [...now.open, key(folder)] }
        return isMoved ? filterMoved({ ...next, clip: undefined }, clip, target) : next
      })
      await reread(folder)
      if (isMoved) await reread(folderOf(clip))
    },
    flash(key) {
      flash(key)
    },
    collapse() {
      flash("collapse:")
      set((now) => {
        const home = driveOf(now.here, now.drives, now.caseless)
        const chain = home ? chainOf(now.here, home).map((path) => pathKey(path, now.caseless)) : []
        const drive = now.drive || home
        const root = pathKey(drive, now.caseless)
        const open = chain.includes(root) || !drive ? chain : [...chain, root]
        return { ...now, drive, open, top: drive === home ? -1 : 0, turn: (now.turn ?? 0) + 1, found: undefined }
      })
    },
    async goTo(text) {
      const pasted = pastedPath(text)
      if (!pasted) return
      const isAbsolute = /^[A-Za-z]:\//.test(pasted) || pasted.startsWith("/") || remoteOf(pasted) !== undefined
      const path = isAbsolute ? pasted : joinPath(state.here, pasted)
      if (!(await io.exists(nativeOf(path, platform)))) return io.toast(`no existe ${pasted}.`, true)
      const key = pathKey(path, state.caseless)
      const drive = state.drives
        .filter((one) => isUnder(key, pathKey(one, state.caseless)))
        .sort((a, b) => b.length - a.length)[0]
      if (!drive) return io.toast(`${pasted} no está en ninguno de los discos del explorador.`, true)
      const isFolder = key === pathKey(drive, state.caseless) || (await io.isDir(path).catch(() => false))
      const folder = isFolder ? path : folderOf(path)
      // Each folder down to it read afresh: what was pasted may be new.
      const chainRead = await Promise.all(
        chainOf(folder, drive).map(async (one) => [pathKey(one, state.caseless), await readFolder(io, one)] as const),
      )
      const listed: Record<string, ExplorerListing | "denied"> = Object.fromEntries(chainRead)
      // A file past the entries a big folder shows is shown all the same: it is the one asked for.
      const folderKey = pathKey(folder, state.caseless)
      const name = nameOf(path)
      const holding = listed[folderKey]
      if (!isFolder && holding && holding !== "denied" && !holding.entries.some((entry) => pathKey(entry.name, state.caseless) === pathKey(name, state.caseless))) {
        listed[folderKey] = { entries: [...holding.entries, { name, kind: "file" }], left: Math.max(0, holding.left - 1) }
      }
      const opened = chainRead.map(([one]) => one)
      // A path gone to is shown in the whole tree: a filter is cleared.
      endFinding()
      set((now) => ({
        ...now,
        filter: undefined,
        cleared: now.filter ? (now.cleared ?? 0) + 1 : now.cleared,
        drive,
        open: [...now.open.filter((one) => !opened.includes(one)), ...opened],
        listed: { ...now.listed, ...listed },
        found: key,
        top: -1,
        turn: (now.turn ?? 0) + 1,
      }))
    },
    filter(text) {
      const pattern = filterPattern(text)
      if (pattern) find(pattern)
      else clearFilter()
    },
    clearFilter,
    pauseFilter() {
      const filter = state.filter
      if (!filter || !(filter.isBusy || filter.isPaused)) return
      const isHeld = !filter.isPaused
      set((now) => (now.filter ? { ...now, filter: { ...now.filter, isBusy: !isHeld, isPaused: isHeld } } : now))
      io.hold?.(isHeld)
    },
  }
  return explorer
}
