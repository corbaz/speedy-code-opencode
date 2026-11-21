/**
 * The explorer the footer's folder opens beside the chat, in place of the system's file manager: the
 * disks on top, and under them the chosen disk's tree, open down to the session's folder.
 *
 * Everything here is pure or works through the `ExplorerIO` it is given, so the panel that draws it
 * (`explorer-panel.tsx`) is a view of `ExplorerState` and the tests drive it with a fake file system.
 * The helpers are the Claude Code plugin's own, ported as they are.
 */

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
}

/** The tree of the disk shown, flat: the disk, then what each open folder holds under it. */
export function treeRows(state: ExplorerState): TreeRow[] {
  if (!state.drive) return []
  const here = pathKey(state.here, state.caseless)
  const rows: TreeRow[] = []
  const note = (path: string, name: string, depth: number) =>
    void rows.push({ path: `${path}#${name}`, name, depth, kind: "note", isOpen: false, isHere: false })
  const walk = (path: string, name: string, kind: ExplorerEntry["kind"], depth: number): void => {
    const key = pathKey(path, state.caseless)
    const isOpen = kind === "dir" && state.open.includes(key)
    rows.push({ path, name, depth, kind, isOpen, isHere: kind === "dir" && key === here })
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
 * at the bottom; -1, just opened, puts the session's folder in the middle.
 */
export function windowTop(rows: readonly TreeRow[], top: number, room: number): number {
  const last = Math.max(0, rows.length - room)
  if (top >= 0) return Math.min(last, top)
  const here = rows.findIndex((row) => row.isHere)
  return Math.min(last, Math.max(0, here - Math.floor(room / 2)))
}

/** The files the explorer opens in the viewer when pressed: text, scripts, PDF and pictures. */
const VIEWABLE_EXTENSIONS = new Set(["md", "markdown", "txt", "sh", "bat", "pdf", "png", "jpg", "jpeg", "gif", "bmp", "ico", "tif", "tiff"])
const VIEWABLE_NAMES = new Set([".gitignore"])

/** Whether the explorer opens a file of this name in the viewer. */
export function isViewable(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf(".")
  return VIEWABLE_NAMES.has(lower) || (dot > 0 && VIEWABLE_EXTENSIONS.has(lower.slice(dot + 1)))
}

/** A row as the panel writes it: indented by its depth, a folder with its open mark, the session's marked ●. */
export function rowLabel(row: TreeRow): string {
  const indent = "  ".repeat(row.depth)
  if (row.kind === "note") return `${indent}${row.name}`
  if (row.kind === "dir") return `${indent}${row.isOpen ? "▾" : "▸"} ${row.name}${row.isHere ? " ●" : ""}`
  return `${indent}${row.kind === "link" ? "↪ " : "  "}${row.name}`
}

/** What a press on a row does: a folder opens or closes, a file the viewer shows opens it, the rest nothing. */
export function rowAction(row: TreeRow): "folder" | "view" | "none" {
  if (row.kind === "dir") return "folder"
  if (row.kind === "file" && isViewable(row.name)) return "view"
  return "none"
}

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
      const name = slashed(path).split("/").pop() ?? ""
      if (isViewable(name)) io.view(path)
    },
  }
}
