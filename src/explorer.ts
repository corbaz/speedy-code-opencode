/**
 * The explorer the footer's folder opens beside the chat, in place of the system's file manager: the
 * disks on top, and under them the chosen disk's tree, open down to the session's folder.
 *
 * Everything here is pure or works through the `ExplorerIO` it is given, so the panel that draws it
 * (`explorer-panel.tsx`) is a view of `ExplorerState` and the tests drive it with a fake file system.
 * The helpers are the Claude Code plugin's own, ported as they are.
 *
 * Each file has four tools at its right: 📋 puts it on the clipboard and attaches it to the prompt as
 * `@path`, 🔗 puts its path in both, ✏ renames it and 🗑 sends it to the trash, each of the last two after a
 * dialog. ⊟ beside the disks collapses every disk; the session's stays open down to its folder.
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
}

/** What the explorer reads and does outside itself. */
export interface ExplorerIO {
  list(path: string): Promise<readonly FsEntry[]>
  /** Whether a path is a folder that answers: a disk's root, for the drives. */
  isDir(path: string): Promise<boolean>
  /** Opens a folder in the system's file manager. */
  openFolder(folder: string): void
  /** Shows a file in the viewer popup. */
  view(path: string): void
  /** Puts a file on the clipboard as a file, to paste in a folder; whether it went. */
  copyFile(native: string): Promise<boolean>
  /** Puts a text on the clipboard; whether it went. */
  copyText(text: string): Promise<boolean>
  /** Writes `text` into the prompt at the cursor, `separator` before it unless what is before ends apart: see promptInsertion. */
  insert(text: string, separator: " " | "\n"): Promise<void>
  /**
   * Asks in the dialog: `rename <base64 name>` or `name <name>`, `delete`, or `cancel`. A folder (`dir`) is
   * asked one name, with no extension, and goes to the trash with what it holds.
   */
  ask(mode: "rename" | "delete", native: string, kind?: "file" | "dir"): Promise<string>
  /** Renames a file in its folder; whether it did. */
  rename(native: string, name: string, nativeTarget: string): Promise<boolean>
  /** Sends a file to the trash, where it can be got back; whether it went. */
  trash(native: string): Promise<boolean>
  /** Whether something is at a path. */
  exists(native: string): Promise<boolean>
  /** Says something to the person, an error or not. */
  toast(message: string, isError?: boolean): void
  /** Waits; the pressed tool is green for this long. */
  wait(ms: number): Promise<void>
}

/** The most entries a folder shows: a folder with thousands would bury the tree. */
export const EXPLORER_MOST = 500

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

/** The tree of the disk shown, flat: the disk, then what each open folder holds under it. */
export function treeRows(state: ExplorerState): TreeRow[] {
  if (!state.drive) return []
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
    if (listed === "denied") return note(path, "(sin acceso)", depth + 1)
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
export type FileToolKind = "copy" | "path" | "rename" | "trash"

/** Each file's tools: what a press does, its emoji, its Nerd Fonts glyph and its color. */
export const FILE_TOOLS: ReadonlyArray<readonly [FileToolKind, string, string, string]> = [
  ["copy", "📋", "", "#74c0fc"],
  ["path", "🔗", "", "#63e6be"],
  ["rename", "✏", "", "#b197fc"],
  ["trash", "🗑", "", "#ff8787"],
]

/**
 * The cells the four tools take at a row's right: each icon on its own two cells, a plain gap of two before
 * each but the first, which has one. A press a little off an icon lands on a gap and does nothing.
 */
export const FILE_TOOLS_WIDTH = 15

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

/** A file's tools as its row draws them: each its glyph or emoji and its color, the one just pressed green. */
export function fileTools(
  icons: IconSet,
  flashed: string,
  path: string,
): Array<{ kind: FileToolKind; label: string; gap: number; color: string }> {
  return FILE_TOOLS.map(([kind, emoji, glyph, color], index) => {
    // An emoji, or a glyph with the cell it spills over: two cells, the tool's own.
    const icon = icons === "nerd" ? `${glyph}\u00a0` : emoji
    return {
      kind,
      label: icon + " ".repeat(Math.max(0, 2 - cells(icon))),
      gap: index === 0 ? 1 : 2,
      color: flashed === `${kind}:${path}` ? FLASH_COLOR : color,
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
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

/** A path as the system writes it: with `\` on Windows. */
const nativeOf = (path: string, platform: string) => (platform === "win32" ? path.replace(/\//g, "\\") : path)

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

/** The disks there are: each lettered root that answers on Windows; `/` and each volume mounted elsewhere. */
async function readDrives(io: ExplorerIO, platform: string): Promise<string[]> {
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
  /** A disk pressed: its tree, its root open. The session's disk shows the session's folder in the middle again. */
  pickDrive(drive: string): Promise<void>
  /** `↗ abrir en el sistema`: the session's folder in the system's file manager. */
  openSystem(): void
  /** A file pressed: the viewer shows it, when it is one the viewer shows. */
  pressFile(path: string): void
  /** 📋: the file to the clipboard as a file, and attached to the prompt as `@path`. */
  copyFile(path: string): Promise<void>
  /** 🔗: the file's path, as the system writes it, to the clipboard and into the prompt. */
  copyPath(path: string): Promise<void>
  /** ✏: the dialog asks the new name, then the file is renamed in its folder and the folder read again. */
  rename(path: string): Promise<void>
  /** 🗑: the dialog asks, then the file goes to the trash and its folder is read again. */
  trash(path: string): Promise<void>
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
  // Any press in the explorer takes the mark off the path the field found: the yellow fill follows the pointer again.
  const forget = () => {
    if (state.found !== undefined) set((now) => ({ ...now, found: undefined }))
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
    await reread(folder)
  }
  return {
    state: () => state,
    async open(where) {
      folder = where
      const here = slashed(where)
      const drives = await readDrives(io, platform)
      const drive = driveOf(here, drives, caseless)
      const chain = drive ? chainOf(here, drive) : []
      const chainRead = await Promise.all(chain.map(async (path) => [pathKey(path, caseless), await readFolder(io, path)] as const))
      set(() => ({ drives, drive, open: chainRead.map(([key]) => key), listed: Object.fromEntries(chainRead), here, caseless, top: -1 }))
    },
    async toggleFolder(path) {
      forget()
      const key = pathKey(path, state.caseless)
      if (state.open.includes(key)) {
        set((now) => ({ ...now, open: now.open.filter((one) => one !== key) }))
        return
      }
      set((now) => ({ ...now, open: [...now.open, key] }))
      const listed = await readFolder(io, path)
      set((now) => ({ ...now, listed: { ...now.listed, [key]: listed } }))
    },
    async pickDrive(drive) {
      forget()
      const key = pathKey(drive, state.caseless)
      const top = driveOf(state.here, state.drives, state.caseless) === drive ? -1 : 0
      set((now) => ({ ...now, drive, top, open: now.open.includes(key) ? now.open : [...now.open, key] }))
      if (state.listed[key] !== undefined) return
      const listed = await readFolder(io, drive)
      set((now) => ({ ...now, listed: { ...now.listed, [key]: listed } }))
    },
    openSystem() {
      io.openFolder(folder)
    },
    pressFile(path) {
      forget()
      if (isViewable(nameOf(path))) io.view(path)
    },
    async copyFile(path) {
      forget()
      flash(`copy:${path}`)
      const native = nativeOf(path, platform)
      const isCopied = await io.copyFile(native)
      // Attached to the prompt too, as a file is mentioned there: @path.
      await io.insert(fileMention(native), " ")
      const name = nameOf(path)
      if (isCopied) io.toast(`${name} está adjunto en el prompt y en el portapapeles; pegalo en una carpeta.`)
      else io.toast(`${name} está adjunto en el prompt; no pude copiarlo al portapapeles.`, true)
    },
    async copyPath(path) {
      forget()
      flash(`path:${path}`)
      const native = nativeOf(path, platform)
      const isCopied = await io.copyText(native)
      // Into the prompt as well, so it need not be pasted; the clipboard keeps it for elsewhere.
      await io.insert(native, " ")
      if (isCopied) io.toast(`la ruta ${native} está en el prompt y en el portapapeles`)
      else io.toast(`la ruta ${native} está en el prompt; no pude copiarla al portapapeles.`, true)
    },
    async rename(path) {
      forget()
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      const name = newNameOf(await io.ask("rename", nativeOf(path, platform), kind))
      if (name) await renameTo(path, name)
    },
    async trash(path) {
      forget()
      const native = nativeOf(path, platform)
      const kind = (await io.isDir(path).catch(() => false)) ? "dir" : "file"
      if ((await io.ask("delete", native, kind)) !== "delete") return
      const name = nameOf(path)
      if (!(await io.trash(native))) return io.toast(`no pude mandar ${name} a la papelera.`, true)
      io.toast(`${name} fue a la papelera.`)
      await reread(folderOf(slashed(path)))
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
      const isAbsolute = /^[A-Za-z]:\//.test(pasted) || pasted.startsWith("/")
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
      set((now) => ({
        ...now,
        drive,
        open: [...now.open.filter((one) => !opened.includes(one)), ...opened],
        listed: { ...now.listed, ...listed },
        found: key,
        top: -1,
        turn: (now.turn ?? 0) + 1,
      }))
    },
  }
}
