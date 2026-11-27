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
  /**
   * The dialogs of the explorer that are up: rename, delete, paste, new folder. Not the viewer's popup: with a
   * file shown the explorer goes on, and another file opened takes its place. While a dialog is up, the
   * explorer holds still (isHeld): its tree takes no press, fills no row
   * under the pointer and opens no menu, and its header and the wheel move nothing, so the one row marked is
   * the one the popup is about.
   */
  readonly held?: number
  /** Counts the collapses and the paths gone to: each one puts its row in the middle again, even with `top` already -1. */
  readonly turn?: number
  /** The key of the path pasted in the field under the disks and found, marked in the tree; absent: none. */
  readonly found?: string
  /** The filter, while one is on: the tree is its own. */
  readonly filter?: ExplorerFilter
  /** Counts the times the field was emptied, by the filter's × or by a path gone to. */
  readonly cleared?: number
  /**
   * The file or the folder last selected in the tree, or gone to by the field: the path's row under the disks
   * shows it; absent, it shows the session's folder.
   */
  readonly picked?: string
  /**
   * Counts the times the explorer picked that row by itself, not by a press: after 🗑, the folder that held what
   * went; after ✏, the file under its new name. The panel takes `picked` as its row selected each time it goes up.
   */
  readonly pickTurn?: number
  /** The file or the folder 📋 took last, which 📥 copies or moves into another folder; absent: none, and 📥 is grey. */
  readonly clip?: string
  /** Whether `clip` is a folder or a file, for 📥's label. */
  readonly clipKind?: "dir" | "file"
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
  /**
   * A dialog: `into` is the folder a paste goes into; a rename with `into` asks the new name of what is pasted
   * there, its fields at `offered`; a paste with `offered` shows that name, and `isCopyOnly` asks Copiar alone.
   */
  ask(mode: "rename" | "delete" | "paste" | "mkdir", native: string, kind?: "file" | "dir", into?: string, offered?: string, isCopyOnly?: boolean): Promise<string>
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

/** What the explorer's one field says while empty: it takes a filter's pattern, or a path to go to. */
export const FIELD_HINT = "filtrar *.pdf o pegar una ruta"

/** The filter's ×, at its field's right while a filter is on: an icon alone, named `limpiar filtro` under the pointer. */
export const UNFILTER_LABEL = " × "

/** Before it: holds a search that runs; held, it is the one that lets it go on from where it was. */
export const pauseLabel = (filter: ExplorerFilter | undefined) => (filter?.isPaused ? " ▸ " : " ‖ ")

/** ↗'s name, under the pointer: the system's file manager, by its own name. */
export const systemTip = (platform: string) => (platform === "win32" ? "Abrir con Explorer" : "Abrir con Finder")

/** Its name, under the pointer. */
export const pauseTip = (filter: ExplorerFilter | undefined) => (filter?.isPaused ? "seguir" : "pausar")

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
 * Each row's tools, in its menu: what a press does, its emoji, its Nerd Fonts glyph and its color. 📁, the
 * first, makes a folder there; 📍, the last, is a folder's alone: the session goes to work there. Both are for
 * this machine's folders alone.
 */
export const FILE_TOOLS: ReadonlyArray<readonly [FileToolKind, string, string, string]> = [
  ["mkdir", "📁", "\uea80", "#ffd43b"],
  ["copy", "📋", "", "#74c0fc"],
  ["paste", "📥", "\uf0ea", "#ffa94d"],
  ["path", "🔗", "", "#63e6be"],
  ["rename", "✏", "", "#b197fc"],
  ["trash", "🗑", "", "#ff8787"],
  ["work", "📍", "\uf041", "#51cf66"],
]

/**
 * What a tool of a row does, as its menu says at the tool's right: for a file or a folder, and 📥 for what 📋
 * took. A tool grey on a disk's root says why.
 */
export function toolTip(kind: FileToolKind, isFolder: boolean, isDisk = false, clipKind?: "dir" | "file"): string {
  const what = isFolder ? "carpeta" : "archivo"
  if (isDisk && DISK_IDLE_TOOLS.includes(kind)) return "no se hace con un disco"
  switch (kind) {
    case "mkdir":
      return "Crear carpeta"
    case "copy":
      return `Copiar ${what}`
    case "path":
      return "Copiar path"
    case "rename":
      return `Renombrar ${what}`
    case "trash":
      return `Borrar ${what}`
    case "paste":
      return clipKind === "dir" ? "Pegar carpeta" : clipKind === "file" ? "Pegar archivo" : "Pegar"
    case "work":
      return "Cambiar espacio de trabajo"
  }
}

/** A tool as a row's menu lists it: what it does when pressed, its icon on two cells, what it says, and its color; `isIdle`: grey, it only says why. */
export interface ToolItem {
  readonly kind: FileToolKind
  readonly icon: string
  readonly text: string
  readonly color: string
  readonly isIdle?: true
}

/**
 * The menu of a row's tools, one under the other, each with what it does: a file's four; a folder's seven, 📍
 * on this machine alone (`isFar`: a folder of another one); a disk's root as a folder's, 📋, ✏ and 🗑 grey there.
 * 📥 is grey until 📋 took a file or a folder (`clip`, and which of the two). A grey one says why at its right.
 * `width` is the cells of the longest text, which all are filled to, so the menu's lines are one width.
 */
export function toolMenu(
  row: { isFolder: boolean; isDisk?: boolean; isFar?: boolean },
  clip: { kind?: "dir" | "file" } | undefined,
  icons: IconSet,
): { width: number; items: ToolItem[] } {
  const items = FILE_TOOLS.flatMap(([kind, emoji, glyph, color]): ToolItem[] => {
    if (!row.isFolder && (kind === "mkdir" || kind === "paste" || kind === "work")) return []
    if (kind === "work" && row.isFar) return []
    const isOff = row.isDisk === true && DISK_IDLE_TOOLS.includes(kind)
    const isEmpty = kind === "paste" && !clip
    const text = isOff
      ? `${toolTip(kind, true).split(" ")[0]}: ${toolTip(kind, true, true)}`
      : isEmpty
        ? "Pegar: primero copiá algo"
        : toolTip(kind, row.isFolder, false, clip?.kind)
    // An emoji, or a glyph with the cell it spills over: two cells, the tool's own.
    const icon = icons === "nerd" ? `${glyph}\u00a0` : isEmpty ? PASTE_IDLE_MARK : emoji
    return [{ kind, icon: icon + " ".repeat(Math.max(0, 2 - cells(icon))), text, color, ...(isOff || isEmpty ? { isIdle: true as const } : {}) }]
  })
  const width = Math.max(0, ...items.map((item) => cells(item.text)))
  return { width, items: items.map((item) => ({ ...item, text: item.text + " ".repeat(width - cells(item.text)) })) }
}

/** The cells a menu takes beside its texts: the frame's two, a space, the icon's two, two spaces and one at the end. */
export const MENU_EDGE = 8

/**
 * Where a row's menu stands, in the tree's cells: under its row (`at`, among the rows shown), or over it where
 * the room under is short, and from the cell it was asked at, kept within the tree.
 */
export function menuPlace(menu: { at: number; x: number; height: number; width: number; room: number; treeWidth: number }): { top: number; left: number } {
  const { at, height, room } = menu
  const top = at + 1 + height <= room ? at + 1 : at - height >= 0 ? at - height : Math.max(0, room - height)
  return { top, left: Math.max(0, Math.min(menu.treeWidth - menu.width, menu.x)) }
}

/**
 * The first name free in a folder for what 📥 pastes there, where its own is taken: `informe (2).txt`,
 * `informe (3).txt`...; a folder's, `fotos (2)`. `taken` holds the folder's names, in lower case.
 */
export function freeName(name: string, isFolder: boolean, taken: ReadonlySet<string>): string {
  const dot = isFolder ? -1 : name.lastIndexOf(".")
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  for (let number = 2; ; number++) {
    const one = `${base} (${number})${extension}`
    if (!taken.has(one.toLowerCase())) return one
  }
}

/**
 * Whether a file's name matches the filter's pattern, as find_files.py matches it: `*` any text, `?` any one
 * character, whatever the case; a pattern with neither is a part of the name.
 */
export function filterMatches(pattern: string, name: string): boolean {
  const text = pattern.trim()
  const glob = (text.includes("*") || text.includes("?") ? text : `*${text}*`).toLowerCase()
  const word = name.toLowerCase()
  let at = 0
  let from = 0
  let star = -1
  let mark = 0
  while (from < word.length) {
    if (at < glob.length && (glob[at] === "?" || glob[at] === word[from])) {
      at++
      from++
    } else if (at < glob.length && glob[at] === "*") {
      star = at++
      mark = from
    } else if (star >= 0) {
      at = star + 1
      from = ++mark
    } else {
      return false
    }
  }
  while (glob[at] === "*") at++
  return at === glob.length
}

/** The explorer after a file was pasted to `path`: with a filter on, it shows in the filter's tree when its name matches. */
export function filterAdded(state: ExplorerState, path: string): ExplorerState {
  if (!state.filter || !filterMatches(state.filter.pattern, path.split("/").pop() ?? path)) return state
  const key = pathKey(path, state.caseless)
  if (state.filter.paths.some(one => pathKey(one, state.caseless) === key)) return state
  return { ...state, filter: { ...state.filter, paths: [...state.filter.paths, path] } }
}

/** Whether a dialog of the explorer is up: the explorer holds still. */
export const isHeld = (state: ExplorerState) => (state.held ?? 0) > 0

/** The longest wait between the two clicks of a double click, in milliseconds. */
export const DOUBLE_CLICK_MS = 500

/**
 * A double click's watch: `click(key, now)` says whether a click on `key` makes a double click with the one
 * before it; a double click starts over. A row of the explorer opens on one.
 */
export function createDoubleClick(): (key: string, now: number) => boolean {
  let last = { key: "", at: 0 }
  return (key, now) => {
    const isDouble = last.key === key && now - last.at <= DOUBLE_CLICK_MS
    last = isDouble ? { key: "", at: 0 } : { key, at: now }
    return isDouble
  }
}

/** 📥 in a menu while 📋 took nothing: with emoji a plain mark, as an emoji keeps its own colors. */
export const PASTE_IDLE_MARK = "↧"
/** A tool of a menu that does nothing here: grey. */
export const TOOL_IDLE_COLOR = "#495057"

/** The tools that are grey on a disk's root, and do nothing there: a disk is not copied, renamed or trashed. */
export const DISK_IDLE_TOOLS: readonly FileToolKind[] = ["copy", "rename", "trash"]

/** At the end of the row selected: a press on it opens the row's menu. */
export const ROW_MORE = " ⋯ "

/** The fill a row takes for a second once a tool of its menu was pressed, and a file's while it opens: green, a sign the press was taken. */
export const FLASH_COLOR = "#51cf66"

/** How long a row stays green. */
export const FLASH_MS = 1000

/**
 * A file's or a folder's name as its row writes it: indented (a folder with its open mark), cut with … to the
 * tree's width and filled with spaces up to it, so its fill runs the whole row.
 */
export function fileNameLabel(row: TreeRow, width: number): string {
  const room = Math.max(4, width)
  const cut = cutCells(row.kind === "dir" ? rowLabel(row) : `${"  ".repeat(row.depth)}  ${row.name}`, room)
  return cut + " ".repeat(Math.max(0, room - cells(cut)))
}

/**
 * Whether a row is the one just pressed, green for a second: a tool of its menu (`<tool>:<path>`), or its file
 * on its way to the viewer (`view:<path>`).
 */
export function isRowFlashed(flashed: string, path: string): boolean {
  return flashed === `view:${path}` || FILE_TOOLS.some(([kind]) => flashed === `${kind}:${path}`)
}

/**
 * Whether what was typed in the explorer's field is a path to go to, not a filter's pattern: it has a folder
 * separator, or it is a disk (`D:`, `mac:`). A pattern matches names, which hold neither.
 */
export function isPathText(text: string): boolean {
  return pastedPath(text).includes("/")
}

/**
 * The path shown under the disks: the row selected (or the path gone to), or else the session's folder, where it
 * is on the disk shown; else the disk.
 */
export function crumbPath(state: ExplorerState): string {
  const disk = pathKey(state.drive, state.caseless)
  return [state.picked, state.here].find((one) => one !== undefined && one !== "" && isUnder(pathKey(one, state.caseless), disk)) ?? state.drive
}

/** A piece of the path's row: its text, its cells and the cell it starts at; `path`, on a folder alone. */
export interface Crumb {
  readonly text: string
  readonly width: number
  readonly at: number
  readonly path?: string
}

/**
 * The path's row, under the disks: each folder from the disk down to `path`, ` › ` between them, after one
 * empty cell. Where they do not fit `width`: the disk, `…` for the folders left out, and the last ones that
 * fit; where not even the last one does, it is cut.
 */
export function crumbsOf(path: string, drive: string, width: number): Crumb[] {
  const chain = chainOf(path, drive)
  const names = chain.map((one, index) => (index === 0 ? driveLabel(drive) : one.slice(one.lastIndexOf("/") + 1)))
  const between = " › "
  const lead = 1 + cells(names[0] ?? "")
  // How many of the last folders are shown, the disk aside; the others are left out.
  const taken = (tail: number) => {
    const left = names.length - 1 - tail
    return lead + (left > 0 ? cells(between) + 1 : 0) + names.slice(names.length - tail).reduce((sum, name) => sum + cells(between) + cells(name), 0)
  }
  let tail = names.length - 1
  while (tail > 1 && taken(tail) > width) tail--
  const left = names.length - 1 - tail
  const parts: Crumb[] = []
  let at = 0
  const add = (text: string, crumb?: string) => {
    parts.push({ text, width: cells(text), at, ...(crumb === undefined ? {} : { path: crumb }) })
    at += cells(text)
  }
  add(" ")
  add(names[0] ?? "", chain[0] ?? drive)
  if (left > 0) {
    add(between)
    add("…")
  }
  for (let index = names.length - tail; index < names.length; index++) {
    add(between)
    // The last one alone, too long for what is left of the row: cut.
    const name = names[index] ?? ""
    add(tail === 1 && taken(1) > width ? cutCells(name, Math.max(1, width - at)) : name, chain[index] ?? drive)
  }
  return parts
}

/**
 * What of a file's name a filter's pattern matched, for its row to mark: each run of the pattern's own letters,
 * as `[start, end]` in the name, not what `*` and `?` stood for. A pattern with neither is a part of the name:
 * where it first is. Whatever the case. Nothing where the name does not match.
 */
export function matchSpans(pattern: string, name: string): Array<[number, number]> {
  const text = pattern.trim()
  if (!text) return []
  if (!text.includes("*") && !text.includes("?")) {
    const at = name.toLowerCase().indexOf(text.toLowerCase())
    return at < 0 ? [] : [[at, at + text.length]]
  }
  // Each piece of the pattern is a group, one after the other from the name's start to its end: where each
  // one starts is the sum of those before it.
  const pieces = text.split(/([*?])/).filter(Boolean)
  const letters = (piece: string) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const found = new RegExp(`^${pieces.map((piece) => (piece === "*" ? "(.*?)" : piece === "?" ? "(.)" : `(${letters(piece)})`)).join("")}$`, "iu").exec(name)
  if (!found) return []
  const spans: Array<[number, number]> = []
  let at = 0
  pieces.forEach((piece, index) => {
    const length = (found[index + 1] ?? "").length
    if (piece !== "*" && piece !== "?" && length > 0) spans.push([at, at + length])
    at += length
  })
  return spans
}

/**
 * A file's or a folder's row in pieces, for a filter to mark what its pattern matched of a file's name: the
 * matched ones `isMatch`, drawn white and bold. With no filter, or on a folder, the row is one piece. Nothing is
 * marked past where a long name is cut.
 */
export function namePieces(row: TreeRow, width: number, pattern?: string): Array<{ text: string; isMatch: boolean }> {
  const label = fileNameLabel(row, width)
  if (!pattern || row.kind !== "file") return [{ text: label, isMatch: false }]
  const nameAt = row.depth * 2 + 2
  const cut = label.trimEnd()
  const shown = cut.length < nameAt + row.name.trimEnd().length ? cut.length - 1 : label.length
  const pieces: Array<{ text: string; isMatch: boolean }> = []
  let from = 0
  for (const [start, end] of matchSpans(pattern, row.name)) {
    const [a, b] = [start + nameAt, Math.min(end + nameAt, shown)]
    if (a >= b) continue
    if (a > from) pieces.push({ text: label.slice(from, a), isMatch: false })
    pieces.push({ text: label.slice(a, b), isMatch: true })
    from = b
  }
  if (from < label.length) pieces.push({ text: label.slice(from), isMatch: false })
  return pieces
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

/**
 * The folder a file or a folder of the tree is in, as the tree writes it. A disk's root keeps its `/`: `C:/`
 * here, `mac:/` on another machine. A disk of Windows seen from another machine, `pc:/D:`, is a folder of
 * that machine's root, and has none.
 */
export const folderOf = (path: string) => {
  const parent = path.slice(0, path.lastIndexOf("/"))
  if (parent === "") return "/"
  return /^[A-Za-z][\w.-]*:$/.test(parent) ? `${parent}/` : parent
}

/** The explorer with the row selected picked by itself, not by a press: the path's row shows it, and the panel takes it. */
export const pickRow = (state: ExplorerState, path: string): ExplorerState => ({ ...state, picked: path, pickTurn: (state.pickTurn ?? 0) + 1 })

/**
 * The explorer after the row at `from` went away, renamed to `to` or sent to the trash: when the row selected
 * was that one, or one under it, the selection follows it to its new name, or goes to the folder that held it.
 * Another row selected meanwhile stays the one selected.
 */
export function pickAfter(state: ExplorerState, from: string, to?: string): ExplorerState {
  if (state.picked === undefined || !isUnder(pathKey(state.picked, state.caseless), pathKey(from, state.caseless))) return state
  return pickRow(state, to === undefined ? folderOf(from) : `${to}${slashed(state.picked).slice(from.length)}`)
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
  /**
   * ↗: the system's file manager opens where the person stands in the explorer, the folder the path's row shows
   * (crumbPath); a file selected, the folder it is in. A folder of another machine is not opened from here.
   */
  openSystem(): Promise<void>
  /** A file pressed: the viewer shows it, when it is one the viewer shows. */
  pressFile(path: string): void
  /** 📋: the file to the clipboard as a file, and attached to the prompt as `@path`. */
  copyFile(path: string): Promise<void>
  /** 🔗: the file's path, as the system writes it, to the clipboard and into the prompt. */
  copyPath(path: string): Promise<void>
  /** A row whose tool was pressed is green for a second: the press was taken. `key` is `<tool>:<path>`. */
  flash(key: string): void
  /**
   * ✏: the dialog asks the new name, then the file is renamed in its folder and the folder read again; the row
   * selected is the file under its new name.
   */
  rename(path: string): Promise<void>
  /**
   * 📁: the dialog asks the new folder's name, then the folder is made where the row is: in a folder, inside
   * it; on a file, in the folder it is in. That folder is read again and opened, to show it.
   */
  newFolder(path: string): Promise<void>
  /**
   * 🗑: the dialog asks, then the file goes to the trash and its folder is read again; the folder that held it is
   * the row selected, shown in the path's row, and the tree stays where it was.
   */
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
   * 📋 and 📥 go one right after the other: any other tool, or a control of the footer, lets go of what 📋 took,
   * and 📥 is grey again. The explorer's own tools do it by themselves; the rest calls this.
   */
  dropClip(): void
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
  /** The one field's Enter: a path (isPathText) is gone to, anything else filters the disk shown. */
  submit(text: string): Promise<void>
  /** A row selected in the tree, or let go of (`undefined`): the path's row shows it, or the session's folder. */
  pick(path: string | undefined): void
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
  // A dialog of the explorer is up, and then gone: the explorer holds still meanwhile.
  const hold = () => set((now) => ({ ...now, held: (now.held ?? 0) + 1 }))
  const release = () => set((now) => ({ ...now, held: Math.max(0, (now.held ?? 0) - 1) }))
  // A dialog, the explorer held still until it is answered.
  const ask: ExplorerIO["ask"] = async (...asked) => {
    hold()
    try {
      return await io.ask(...asked)
    } finally {
      release()
    }
  }
  // 📋 and 📥 go one right after the other: anything else pressed lets go of what 📋 took.
  const dropClip = () => {
    if (state.clip !== undefined) set((now) => ({ ...now, clip: undefined, clipKind: undefined }))
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
    // The row selected follows the file to its new name.
    set((now) => pickAfter(now, slashed(path), target))
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
      set((now) => ({ drives, drive, open: chainRead.map(([key]) => key), listed: Object.fromEntries(chainRead), here, caseless, top: -1, clip: now.clip, clipKind: now.clipKind, pickTurn: now.pickTurn }))
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
    async openSystem() {
      const shown = crumbPath(state)
      if (!shown) return io.openFolder(folder)
      if (remoteOf(shown)) return io.toast(`${shown} está en otra máquina: ${platform === "win32" ? "Explorer" : "Finder"} no la abre desde acá.`, true)
      const isFolder = pathKey(shown, state.caseless) === pathKey(state.drive, state.caseless) || (await io.isDir(shown).catch(() => false))
      io.openFolder(nativeOf(isFolder ? shown : folderOf(shown), platform))
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
        set((now) => ({ ...now, clip: slashed(path), clipKind: "dir" }))
        return io.toast(`la carpeta ${nameOf(path) || remote.host} de ${remote.host} está lista para pegar con 📥.`)
      }
      const isCopied = await io.copyFile(native)
      // A file of another machine: its copy here went to the clipboard, and its path there goes into the prompt.
      // 📥 pastes what was taken last: a file or a folder of this machine, or a file of another one.
      if (isCopied) {
        const clipKind = !remote && (await io.isDir(path).catch(() => false)) ? "dir" : "file"
        set((now) => ({ ...now, clip: slashed(path), clipKind }))
      }
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
      dropClip()
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
      dropClip()
      if (notOnDisk(path)) return
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      const name = newNameOf(await ask("rename", nativeOf(path, platform), kind))
      if (name) await renameTo(path, name)
    },
    async newFolder(path) {
      forget()
      dropClip()
      flash(`mkdir:${path}`)
      const folder = (await io.isDir(path).catch(() => false)) ? slashed(path) : folderOf(slashed(path))
      const name = newNameOf(await ask("mkdir", nativeOf(folder, platform), "dir")).trim()
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
      dropClip()
      if (notOnDisk(path)) return
      const native = nativeOf(path, platform)
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      if ((await ask("delete", native, kind)) !== "delete") return
      const name = nameOf(path)
      if (!(await io.trash(native))) return io.toast(`no pude mandar ${name} a la papelera.`, true)
      io.toast(`${name} fue a la papelera.`)
      set((now) => filterMoved(now, slashed(path)))
      await reread(folderOf(slashed(path)))
      // The folder that held it is the row selected from now on; the tree stays where it is.
      set((now) => pickAfter(now, slashed(path)))
    },
    async paste(path) {
      forget()
      const clip = state.clip
      if (!clip) return io.toast("primero copiá un archivo o una carpeta con 📋.", true)
      const own = nameOf(clip)
      let name = own
      if (!(await io.exists(nativeOf(clip, platform)))) {
        set((now) => ({ ...now, clip: undefined, clipKind: undefined }))
        return io.toast(`${name} ya no está donde se copió.`, true)
      }
      const isFolder = await io.isDir(clip).catch(() => false)
      const folder = (await io.isDir(path).catch(() => false)) ? slashed(path) : folderOf(slashed(path))
      // Across machines it goes by remote.py: from another machine here, from here to it, or within it.
      const from = remoteOf(clip)
      const to = remoteOf(folder)
      if (from && to && from.host !== to.host) return io.toast(`de ${from.host} a ${to.host} no se pega: traelo primero a esta máquina.`, true)
      const key = (one: string) => pathKey(one, state.caseless)
      // Into the folder it is in, it is copied alone: moved there, it would only be renamed, as ✏ does.
      const isSameFolder = key(folderOf(clip)) === key(folder)
      if (isFolder && !isSameFolder && isUnder(key(folder), key(clip))) return io.toast(`${name} no puede ir dentro de sí misma.`, true)
      // Where its name is taken (the folder it is in, or another with one of that name), a new name is asked
      // first, a free one offered; then whether to copy or move it, under that name.
      if (isSameFolder || (await io.exists(nativeOf(joinPath(folder, name), platform)))) {
        const listed = await readFolder(io, folder)
        const taken = new Set([name.toLowerCase(), ...(listed === "denied" ? [] : listed.entries.map((entry) => entry.name.toLowerCase()))])
        const offered = freeName(name, isFolder, taken)
        const wanted = newNameOf(await ask("rename", nativeOf(clip, platform), isFolder ? "dir" : "file", nativeOf(folder, platform), offered)).trim()
        if (!wanted) return
        const why = badFileName(wanted)
        if (why) return io.toast(`no pegué ${own}: ${why}.`, true)
        if (wanted.toLowerCase() === own.toLowerCase() || (await io.exists(nativeOf(joinPath(folder, wanted), platform)))) {
          return io.toast(`ya hay un ${wanted} en esa carpeta.`, true)
        }
        name = wanted
      }
      const target = joinPath(folder, name)
      const verb = await ask("paste", nativeOf(clip, platform), isFolder ? "dir" : "file", nativeOf(folder, platform), name === own ? "" : name, isSameFolder)
      if (verb !== "copy" && verb !== "move") return
      const isMove = verb === "move"
      // Across machines it takes a while: it says it started.
      if (from || to) io.toast(`${isMove ? "moviendo" : "copiando"} ${own}…`)
      const said = await io.paste(verb, nativeOf(clip, platform), nativeOf(target, platform))
      if (!said) return io.toast(`no pude ${isMove ? "mover" : "copiar"} ${own}.`, true)
      // Copied, but what was to move could not be removed where it was.
      const isMoved = isMove && said !== "kept"
      const as = name === own ? "" : ` como ${name}`
      if (said === "kept") io.toast(`${own} se copió a ${driveLabel(folder)}${as}, pero no pude quitarlo de donde estaba.`, true)
      else io.toast(`${own} se ${isMove ? "movió" : "copió"} a ${driveLabel(folder)}${as}.`)
      // The folder it went into is read again, and opened to show it; moved, the one it left too.
      set((now) => {
        const next = { ...now, open: now.open.includes(key(folder)) ? now.open : [...now.open, key(folder)] }
        const placed = isMoved ? filterMoved({ ...next, clip: undefined, clipKind: undefined }, clip, target) : next
        // With a filter on, a file pasted shows in its tree when its name matches.
        return isFolder ? placed : filterAdded(placed, target)
      })
      await reread(folder)
      if (isMoved) await reread(folderOf(clip))
    },
    flash(key) {
      flash(key)
    },
    dropClip,
    collapse() {
      dropClip()
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
        // The field empties: it is the filter's too.
        cleared: (now.cleared ?? 0) + 1,
        picked: path,
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
    async submit(text) {
      if (isPathText(text)) await explorer.goTo(text)
      else explorer.filter(text)
    },
    pick(path) {
      if (state.picked !== path) set((now) => ({ ...now, picked: path }))
    },
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
