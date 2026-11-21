import { describe, expect, test } from "bun:test"

import {
  chainOf,
  createExplorer,
  driveLabel,
  driveOf,
  isViewable,
  listingOf,
  rowAction,
  rowLabel,
  treeRows,
  windowTop,
  type ExplorerIO,
  type FsEntry,
} from "../src/explorer"
import { folderCommand } from "../src/footer"

describe("explorer helpers", () => {
  test("driveOf, chainOf and driveLabel: the disk a folder is on, each folder from the disk down to it, and the disk's name", () => {
    expect(driveOf("C:/Users/test/proyectos", ["C:/", "D:/"], true)).toBe("C:/")
    expect(driveOf("d:/datos", ["C:/", "D:/"], true)).toBe("D:/")
    expect(driveOf("/Volumes/USB/fotos", ["/", "/Volumes/USB"], false)).toBe("/Volumes/USB")
    expect(driveOf("/Users/test", ["/", "/Volumes/USB"], false)).toBe("/")
    expect(driveOf("E:/x", ["C:/"], true)).toBe("C:/")
    expect(driveOf("", [], true)).toBe("")
    expect(chainOf("C:/Users/test", "C:/")).toEqual(["C:/", "C:/Users", "C:/Users/test"])
    expect(chainOf("C:/", "C:/")).toEqual(["C:/"])
    expect(chainOf("/Volumes/USB/fotos", "/Volumes/USB")).toEqual(["/Volumes/USB", "/Volumes/USB/fotos"])
    expect(chainOf("E:/x", "C:/")).toEqual(["C:/"])
    expect([driveLabel("C:/"), driveLabel("/"), driveLabel("/Volumes/USB")]).toEqual(["C:", "/", "USB"])
  })

  test("listingOf: folders and links first, then files, each by name whatever its case; past the most, how many are left", () => {
    const listing = listingOf([
      { name: "zeta.txt", kind: "file", isLink: false },
      { name: "beta", kind: "dir", isLink: false },
      { name: "Alfa.txt", kind: "file", isLink: false },
      { name: "Atajo", kind: "other", isLink: true },
      { name: "Gamma", kind: "dir", isLink: false },
    ])
    expect(listing).toEqual({
      entries: [
        { name: "Atajo", kind: "link" },
        { name: "beta", kind: "dir" },
        { name: "Gamma", kind: "dir" },
        { name: "Alfa.txt", kind: "file" },
        { name: "zeta.txt", kind: "file" },
      ],
      left: 0,
    })
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `f${i}`, kind: "file" as const, isLink: false }))
    expect(listingOf(many, 5)).toEqual({ entries: many.slice(0, 5).map((f) => ({ name: f.name, kind: "file" })), left: 2 })
  })

  test("treeRows: the disk, then what each open folder holds under it; a folder not read yet, one that could not be read, an empty one and the entries left say so", () => {
    const rows = treeRows({
      drives: ["C:/"],
      drive: "C:/",
      open: ["c:/", "c:/users", "c:/vacia", "c:/cerrada"],
      listed: {
        "c:/": {
          entries: [
            { name: "Cerrada", kind: "dir" },
            { name: "Users", kind: "dir" },
            { name: "Vacia", kind: "dir" },
            { name: "Leer", kind: "dir" },
            { name: "a.txt", kind: "file" },
          ],
          left: 3,
        },
        "c:/users": { entries: [], left: 0 },
        "c:/cerrada": "denied",
      },
      here: "C:/Users",
      caseless: true,
      top: 0,
    })
    expect(rows.map((row) => [row.depth, row.kind, row.name, row.isOpen, row.isHere])).toEqual([
      [0, "dir", "C:\\", true, false],
      [1, "dir", "Cerrada", true, false],
      [2, "note", "(sin acceso)", false, false],
      [1, "dir", "Users", true, true],
      [2, "note", "(vacía)", false, false],
      [1, "dir", "Vacia", true, false],
      [2, "note", "leyendo…", false, false],
      [1, "dir", "Leer", false, false],
      [1, "file", "a.txt", false, false],
      [1, "note", "… y 3 más", false, false],
    ])
    expect(rows[3]?.path).toBe("C:/Users")
  })

  test("windowTop: the first tree row in the window, kept so the last row stays at the bottom; just opened, the session's folder in the middle", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      path: `C:/${i}`,
      name: String(i),
      depth: 1,
      kind: "dir" as const,
      isOpen: false,
      isHere: i === 12,
    }))
    expect(windowTop(rows, -1, 6)).toBe(9)
    expect(windowTop(rows, 0, 6)).toBe(0)
    expect(windowTop(rows, 30, 6)).toBe(14)
    expect(windowTop(rows.slice(0, 4), 2, 6)).toBe(0)
    expect(windowTop(rows.map((row) => ({ ...row, isHere: false })), -1, 6)).toBe(0)
    expect(windowTop(rows.map((row, i) => ({ ...row, isHere: i === 19 })), -1, 6)).toBe(14)
  })

  test("isViewable: text, scripts, PDF and pictures open in the viewer, whatever their case; .gitignore too; other files do not", () => {
    for (const name of ["a.md", "b.MARKDOWN", "c.txt", "d.sh", "e.bat", "install.PS1", "f.pdf", "g.png", "h.JPG", "i.jpeg", "j.gif", "k.bmp", "l.ico", "m.tif", "n.tiff", ".gitignore", ".GITIGNORE"]) {
      expect([name, isViewable(name)]).toEqual([name, true])
    }
    for (const name of ["pagefile.sys", "a.exe", "md", ".md", "notes.md.bak", ".env", "Makefile"]) {
      expect([name, isViewable(name)]).toEqual([name, false])
    }
  })
})

/** A disk tree the fake file system answers; any other folder cannot be read. */
const TREE: Record<string, Array<{ name: string; kind: FsEntry["kind"]; isLink?: boolean }>> = {
  "C:/": [
    { name: "Windows", kind: "dir" },
    { name: "pagefile.sys", kind: "file" },
    { name: "Users", kind: "dir" },
    { name: "Documents and Settings", kind: "other", isLink: true },
  ],
  "C:/Users": [
    { name: "test", kind: "dir" },
    { name: "Public", kind: "dir" },
  ],
  "C:/Users/test": [{ name: "proyectos", kind: "dir" }],
  "C:/Users/test/proyectos": [
    { name: "facturas", kind: "dir" },
    { name: "notas.txt", kind: "file" },
    { name: "app.exe", kind: "file" },
  ],
  "C:/Windows": [{ name: "System32", kind: "dir" }],
  "D:/": [{ name: "fotos", kind: "dir" }],
}

function fakeIO() {
  const opened: string[] = []
  const viewed: string[] = []
  const io: ExplorerIO = {
    list: async (path) => {
      const entries = TREE[path.replace(/\\/g, "/")]
      if (!entries) throw new Error("EPERM")
      return entries.map((entry) => ({ isLink: false, ...entry }))
    },
    isDir: async (path) => /^[CD]:\/$/.test(path),
    openFolder: (folder) => void opened.push(folder),
    view: (path) => void viewed.push(path),
  }
  return { io, opened, viewed }
}

describe("the explorer the footer's folder opens", () => {
  test("opens on the disks, the tree open down to the session's folder; a folder opens and closes, a disk shows its own, files open the viewer", async () => {
    const { io, opened, viewed } = fakeIO()
    const explorer = createExplorer(io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    const labels = () => treeRows(explorer.state()).map(rowLabel)
    expect(explorer.state().drives).toEqual(["C:/", "D:/"])
    expect(explorer.state().drive).toBe("C:/")
    expect(labels()).toEqual([
      "▾ C:\\",
      "  ↪ Documents and Settings",
      "  ▾ Users",
      "    ▸ Public",
      "    ▾ test",
      "      ▾ proyectos ●",
      "        ▸ facturas",
      "          app.exe",
      "          notas.txt",
      "  ▸ Windows",
      "    pagefile.sys",
    ])
    // Just opened, the session's folder is asked to be in the middle.
    expect(explorer.state().top).toBe(-1)

    // A folder closed opens, read then; pressed again, it closes.
    await explorer.toggleFolder("C:/Windows")
    expect(labels().slice(-3)).toEqual(["  ▾ Windows", "    ▸ System32", "    pagefile.sys"])
    await explorer.toggleFolder("C:/Windows")
    expect(labels().slice(-2)).toEqual(["  ▸ Windows", "    pagefile.sys"])
    // One that cannot be read says so.
    await explorer.toggleFolder("C:/Users/test/proyectos/facturas")
    expect(labels()).toContain("          (sin acceso)")

    // Another disk shows its own tree, from its top, and the first keeps what was open.
    await explorer.pickDrive("D:/")
    expect(labels()).toEqual(["▾ D:\\", "  ▸ fotos"])
    expect(explorer.state().top).toBe(0)
    await explorer.pickDrive("C:/")
    expect(labels()).toContain("      ▾ proyectos ●")
    expect(explorer.state().top).toBe(-1)

    // What a press on each row does: a folder toggles, a viewable file opens the viewer, the rest nothing.
    const rows = treeRows(explorer.state())
    const byLabel = (label: string) => rows.find((row) => rowLabel(row) === label)!
    expect(rowAction(byLabel("      ▾ proyectos ●"))).toBe("folder")
    expect(rowAction(byLabel("          notas.txt"))).toBe("view")
    expect(rowAction(byLabel("          app.exe"))).toBe("none")
    expect(rowAction(byLabel("  ↪ Documents and Settings"))).toBe("none")
    expect(rowAction(byLabel("          (sin acceso)"))).toBe("none")
    explorer.pressFile(byLabel("          notas.txt").path)
    explorer.pressFile(byLabel("          app.exe").path)
    expect(viewed).toEqual(["C:/Users/test/proyectos/notas.txt"])
    expect(opened).toEqual([])
  })

  test("↗ abrir en el sistema still opens the session's folder in the system's file manager, as the footer's folder did", async () => {
    const { io, opened } = fakeIO()
    const explorer = createExplorer(io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    explorer.openSystem()
    expect(opened).toEqual(["C:\\Users\\test\\proyectos"])
    // The folder reaches open_folder.ps1 as the footer's click sent it.
    expect(folderCommand("win32", opened[0]!, "C:/plugin").env).toEqual({ SPEEDY_FOLDER: "C:\\Users\\test\\proyectos" })
  })

  test("on a Mac the disks are / and each mounted volume that is not a link; paths keep their case", async () => {
    const io: ExplorerIO = {
      list: async (path) => {
        if (path === "/Volumes") {
          return [
            { name: "Macintosh HD", kind: "other", isLink: true },
            { name: "USB", kind: "dir", isLink: false },
          ]
        }
        if (path === "/") return [{ name: "Users", kind: "dir", isLink: false }]
        if (path === "/Users") return [{ name: "me", kind: "dir", isLink: false }]
        if (path === "/Users/me") return []
        throw new Error("EPERM")
      },
      isDir: async () => false,
      openFolder: () => {},
      view: () => {},
    }
    const explorer = createExplorer(io, "darwin")
    await explorer.open("/Users/me")
    expect(explorer.state().drives).toEqual(["/", "/Volumes/USB"])
    expect(explorer.state().caseless).toBe(false)
    expect(treeRows(explorer.state()).map(rowLabel)).toEqual(["▾ /", "  ▾ Users", "    ▾ me ●", "      (vacía)"])
  })

  test("every change reaches the listener", async () => {
    const { io } = fakeIO()
    const seen: string[] = []
    const explorer = createExplorer(io, "win32", (state) => seen.push(state.drive))
    await explorer.open("C:/Users/test")
    await explorer.pickDrive("D:/")
    expect(seen.at(-1)).toBe("D:/")
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })
})
