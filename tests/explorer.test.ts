import { describe, expect, test } from "bun:test"

import {
  FILE_TOOLS_WIDTH,
  badFileName,
  chainOf,
  collapseLabel,
  gotoHint,
  cutCells,
  fileNameLabel,
  fileTools,
  createExplorer,
  driveLabel,
  driveOf,
  isViewable,
  listingOf,
  pastedPath,
  rowAction,
  rowLabel,
  treeRows,
  windowTop,
  type ExplorerIO,
  type FsEntry,
} from "../src/explorer"
import { cells, folderCommand } from "../src/footer"
import { promptInsertion } from "../src/viewer"

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
    // A path found by the field is put in the middle before the session's folder.
    expect(windowTop(rows.map((row, i) => ({ ...row, isFound: i === 4 })), -1, 6)).toBe(1)
  })

  test("pastedPath: a path as pasted in the explorer's field, quotes, spaces and a mention's @ off, with / for \\", () => {
    expect(pastedPath(' "D:\\Excel\\rand.xlsx" ')).toBe("D:/Excel/rand.xlsx")
    expect(pastedPath("@C:\\Users\\test\\")).toBe("C:/Users/test")
    expect(pastedPath("d:")).toBe("d:/")
    expect(pastedPath("D:\\")).toBe("D:/")
    expect(pastedPath("'/Users/ana/notas.md'")).toBe("/Users/ana/notas.md")
    expect(pastedPath("/")).toBe("/")
    expect(pastedPath("   ")).toBe("")
  })

  test("isViewable: every file opens in the viewer, which draws the kinds it knows and reads or describes the rest", () => {
    for (const name of ["a.md", "b.MARKDOWN", "c.txt", "install.PS1", "f.pdf", "h.JPG", ".gitignore", "a.ts", "bun.lock", "index.html", "logo.svg", "a.xlsx", "a.docx", "song.mp3", "clip.mp4", "cache.sqlite", "Atajo.lnk", "pagefile.sys", "a.exe", "main.py", "cert.pem", "archive.zip", ".env", "Makefile", "LICENSE", ".DS_Store"]) {
      expect([name, isViewable(name)]).toEqual([name, true])
    }
    expect(isViewable("")).toBe(false)
  })

  test("cutCells: a name keeps to its row, cut with …, wide characters counted as two cells", () => {
    expect(cutCells("notas.txt", 20)).toBe("notas.txt")
    expect(cutCells("guia_fundamentos_javascript_mouredevpro.pdf", 20)).toBe("guia_fundamentos_ja…")
    expect(cells(cutCells("01-01-Qué es RAG y por qué es importante.mp4", 12))).toBeLessThanOrEqual(12)
    expect(cells(cutCells("漢字漢字漢字漢字", 7))).toBeLessThanOrEqual(7)
  })

  test("badFileName: a new name is refused empty, as . or .., or with a folder separator or a character Windows forbids", () => {
    expect(badFileName("apuntes.txt")).toBe("")
    expect(badFileName("año 2026 (copia).md")).toBe("")
    expect(badFileName("  ")).toBe("el nombre está vacío")
    expect(badFileName("..")).toBe("ese nombre no es válido")
    expect(badFileName(".")).toBe("ese nombre no es válido")
    for (const name of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "a\u0007b"]) {
      expect([name, badFileName(name)]).toEqual([name, 'el nombre no puede tener \\ / : * ? " < > |'])
    }
  })

  test("a file's row: its name cut and filled with spaces up to its four tools, emoji or Nerd Fonts glyphs in their colors", () => {
    const row = { path: "C:/x/un_nombre_muy_largo_de_archivo.txt", name: "un_nombre_muy_largo_de_archivo.txt", depth: 2, kind: "file" as const, isOpen: false, isHere: false }
    const label = fileNameLabel(row, 30)
    expect(cells(label)).toBe(30 - FILE_TOOLS_WIDTH)
    expect(label.startsWith("      un_nombre")).toBe(true)
    expect(label.trimEnd().endsWith("…")).toBe(true)
    const short = fileNameLabel({ ...row, name: "a.md", depth: 0 }, 30)
    expect(short).toBe("  a.md".padEnd(30 - FILE_TOOLS_WIDTH))
    expect(fileTools("emoji", "", row.path).map((tool) => [tool.kind, tool.label, tool.color])).toEqual([
      ["copy", " 📋", "#74c0fc"],
      ["path", " 🔗", "#63e6be"],
      ["rename", " ✏", "#b197fc"],
      ["trash", " 🗑", "#ff8787"],
    ])
    expect(fileTools("nerd", "", row.path).map((tool) => tool.label)).toEqual([" ", " ", " ", " "])
    // The tool just pressed is green, with no fill; the others keep their colors.
    const flashed = fileTools("emoji", `path:${row.path}`, row.path)
    expect(flashed.map((tool) => tool.color)).toEqual(["#74c0fc", "#51cf66", "#b197fc", "#ff8787"])
    expect(fileTools("emoji", `path:C:/otro.txt`, row.path).map((tool) => tool.color)).toEqual(["#74c0fc", "#63e6be", "#b197fc", "#ff8787"])
    expect(Object.keys(flashed[0]!)).not.toContain("bg")
    expect([collapseLabel("emoji"), collapseLabel("nerd")]).toEqual([" ⊟ ", "  "])
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

/** The tools' side of the explorer, as the tests drive it: what reached the clipboard, the prompt and the disk. */
const noTools = {
  copyFile: async () => false,
  copyText: async () => false,
  insert: async () => {},
  ask: async () => "cancel",
  rename: async () => false,
  trash: async () => false,
  exists: async () => false,
  toast: () => {},
  wait: async () => {},
}

function fakeIO(tree: typeof TREE = TREE) {
  const opened: string[] = []
  const viewed: string[] = []
  const files = { copied: [] as string[], texts: [] as string[], renamed: [] as string[], trashed: [] as string[] }
  const dialog = { answer: "cancel", asked: [] as string[] }
  const toasts: string[] = []
  // The prompt as the person left it: what is inserted lands at its end, where the cursor is.
  const prompt = { text: "mirá este" }
  const existing = new Set<string>()
  let release: () => void = () => {}
  const io: ExplorerIO = {
    list: async (path) => {
      const entries = tree[path.replace(/\\/g, "/")]
      if (!entries) throw new Error("EPERM")
      return entries.map((entry) => ({ isLink: false, ...entry }))
    },
    isDir: async (path) => /^[CD]:\/$/.test(path),
    openFolder: (folder) => void opened.push(folder),
    view: (path) => void viewed.push(path),
    copyFile: async (native) => (files.copied.push(native), true),
    copyText: async (text) => (files.texts.push(text), true),
    insert: async (text, separator) => {
      prompt.text += promptInsertion(prompt.text, text, separator)
    },
    ask: async (mode, native) => (dialog.asked.push(`${mode} ${native}`), dialog.answer),
    rename: async (native, name, target) => (files.renamed.push(`${native} -> ${name} (${target})`), true),
    trash: async (native) => (files.trashed.push(native), true),
    exists: async (native) => existing.has(native),
    toast: (message) => void toasts.push(message),
    // A second passes when the test says so.
    wait: () => new Promise<void>((done) => (release = done)),
  }
  return { io, opened, viewed, files, dialog, toasts, prompt, existing, second: () => release() }
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
    expect(rowAction(byLabel("          app.exe"))).toBe("view")
    expect(rowAction(byLabel("  ↪ Documents and Settings"))).toBe("none")
    expect(rowAction(byLabel("          (sin acceso)"))).toBe("none")
    explorer.pressFile(byLabel("          notas.txt").path)
    explorer.pressFile(byLabel("          app.exe").path)
    expect(viewed).toEqual(["C:/Users/test/proyectos/notas.txt", "C:/Users/test/proyectos/app.exe"])
    expect(opened).toEqual([])
  })

  test("a path pasted in the field: the tree opens down to it, on its disk, and marks it in the middle; a file, in its folder", async () => {
    const fake = fakeIO()
    // What is on the fake disks: its folders, and the files they list.
    const isDir = (path: string) => /^[CD]:\/$/.test(path) || path in TREE
    const isThere = (native: string) => {
      const path = native.replace(/\\/g, "/")
      const at = path.lastIndexOf("/")
      return isDir(path) || (TREE[path.slice(0, at)] ?? []).some((entry) => entry.name === path.slice(at + 1))
    }
    const explorer = createExplorer({ ...fake.io, isDir: async (path) => isDir(path), exists: async (native) => isThere(native) }, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    const marked = () => treeRows(explorer.state()).filter((row) => row.isFound).map(rowLabel)
    await explorer.pickDrive("D:/")
    const turn = explorer.state().turn ?? 0
    await explorer.goTo(' "C:\\Users\\test\\proyectos\\notas.txt" ')
    expect(explorer.state().drive).toBe("C:/")
    expect(marked()).toEqual(["          notas.txt"])
    // Asked to be put in the middle, again.
    expect(explorer.state().top).toBe(-1)
    expect(explorer.state().turn).toBe(turn + 1)
    // A folder is marked the same way, and opened.
    await explorer.goTo("C:\\Windows\\")
    expect(marked()).toEqual(["  ▾ Windows"])
    expect(treeRows(explorer.state()).map(rowLabel)).toContain("    ▸ System32")
    // A path that is not there says so, and the tree stays.
    await explorer.goTo("C:\\nada\\falta.txt")
    expect(fake.toasts.at(-1)).toBe("no existe C:/nada/falta.txt.")
    expect(marked()).toEqual(["  ▾ Windows"])
    // Any press in the explorer takes the mark away: the yellow fill follows the pointer again.
    await explorer.toggleFolder("C:/Users/Public")
    expect(marked()).toEqual([])
    await explorer.goTo("C:\\Users\\test\\proyectos\\notas.txt")
    explorer.pressFile("C:/Users/test/proyectos/app.exe")
    expect(marked()).toEqual([])
    await explorer.goTo("C:\\Users\\test\\proyectos\\notas.txt")
    await explorer.copyPath("C:/Users/test/proyectos/app.exe")
    expect(marked()).toEqual([])
    // ⊟ too.
    await explorer.goTo("C:\\Windows")
    explorer.collapse()
    expect(marked()).toEqual([])
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
      ...noTools,
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

describe("each file's tools", () => {
  const NOTAS = "C:/Users/test/proyectos/notas.txt"
  const NATIVE = "C:\\Users\\test\\proyectos\\notas.txt"

  test("📋 puts the file on the clipboard and attaches it to the prompt as @path; 🔗 its path, to both; each turns green for a second", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    const copying = explorer.copyFile(NOTAS)
    await copying
    expect(fake.files.copied).toEqual([NATIVE])
    expect(fake.prompt.text).toBe(`mirá este @${NATIVE} `)
    expect(fake.toasts.at(-1)).toBe("notas.txt está adjunto en el prompt y en el portapapeles; pegalo en una carpeta.")
    expect(explorer.state().flashed).toBe(`copy:${NOTAS}`)
    fake.second()
    await Bun.sleep(0)
    expect(explorer.state().flashed).toBe("")
    // The text before the cursor already ends in a space: no second one.
    await explorer.copyPath(NOTAS)
    expect(fake.files.texts).toEqual([NATIVE])
    expect(fake.prompt.text).toBe(`mirá este @${NATIVE} ${NATIVE} `)
    expect(fake.toasts.at(-1)).toBe(`la ruta ${NATIVE} está en el prompt y en el portapapeles`)
    expect(explorer.state().flashed).toBe(`path:${NOTAS}`)
  })

  test("a path with a space is mentioned in quotes; a copy that failed still attaches, and says so", async () => {
    const fake = fakeIO()
    fake.io.copyFile = async () => false
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    fake.prompt.text = ""
    await explorer.copyFile("C:/Mis Cosas/a b.txt")
    expect(fake.prompt.text).toBe('@"C:\\Mis Cosas\\a b.txt" ')
    expect(fake.toasts.at(-1)).toBe("a b.txt está adjunto en el prompt; no pude copiarlo al portapapeles.")
  })

  test("✏ asks the new name in the dialog: cancel leaves the file; a name renames it and the folder is read again", async () => {
    const tree = { ...TREE }
    const fake = fakeIO(tree)
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    await explorer.rename(NOTAS)
    expect(fake.dialog.asked).toEqual([`rename ${NATIVE}`])
    expect(fake.files.renamed).toEqual([])
    // dialog.ps1 answers the name in Base64, UTF-8: "apuntes.txt".
    fake.dialog.answer = "rename YXB1bnRlcy50eHQ="
    tree["C:/Users/test/proyectos"] = [{ name: "facturas", kind: "dir" }, { name: "apuntes.txt", kind: "file" }]
    await explorer.rename(NOTAS)
    expect(fake.files.renamed).toEqual([`${NATIVE} -> apuntes.txt (C:\\Users\\test\\proyectos\\apuntes.txt)`])
    expect(fake.toasts.at(-1)).toBe("notas.txt ahora se llama apuntes.txt.")
    expect(treeRows(explorer.state()).map(rowLabel)).toContain("          apuntes.txt")
    expect(treeRows(explorer.state()).map(rowLabel)).not.toContain("          notas.txt")
  })

  test("✏ refuses a bad name or one another file has, with the reason; the Mac's dialog answers `name <text>`", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    fake.dialog.answer = `rename ${Buffer.from("a:b.txt").toString("base64")}`
    await explorer.rename(NOTAS)
    expect(fake.toasts.at(-1)).toBe('no renombré notas.txt: el nombre no puede tener \\ / : * ? " < > |.')
    fake.existing.add("C:\\Users\\test\\proyectos\\app.exe")
    fake.dialog.answer = `rename ${Buffer.from("app.exe").toString("base64")}`
    await explorer.rename(NOTAS)
    expect(fake.toasts.at(-1)).toBe("ya hay un archivo app.exe en esa carpeta.")
    // The same file in another case is a rename on Windows, not a clash.
    fake.existing.add("C:\\Users\\test\\proyectos\\NOTAS.txt")
    fake.dialog.answer = `rename ${Buffer.from("NOTAS.txt").toString("base64")}`
    await explorer.rename(NOTAS)
    expect(fake.files.renamed).toEqual([`${NATIVE} -> NOTAS.txt (C:\\Users\\test\\proyectos\\NOTAS.txt)`])

    const mac = fakeIO()
    mac.io.list = async (path) => (path === "/Users/me" ? [{ name: "a.md", kind: "file", isLink: false }] : [])
    const onMac = createExplorer(mac.io, "darwin")
    await onMac.open("/Users/me")
    mac.dialog.answer = "name b.md"
    await onMac.rename("/Users/me/a.md")
    expect(mac.dialog.asked).toEqual(["rename /Users/me/a.md"])
    expect(mac.files.renamed).toEqual(["/Users/me/a.md -> b.md (/Users/me/b.md)"])
  })

  test("🗑 asks in the dialog: cancel leaves the file; delete sends it to the trash and the folder is read again", async () => {
    const tree = { ...TREE }
    const fake = fakeIO(tree)
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    await explorer.trash(NOTAS)
    expect(fake.dialog.asked).toEqual([`delete ${NATIVE}`])
    expect(fake.files.trashed).toEqual([])
    fake.dialog.answer = "delete"
    tree["C:/Users/test/proyectos"] = [{ name: "facturas", kind: "dir" }]
    await explorer.trash(NOTAS)
    expect(fake.files.trashed).toEqual([NATIVE])
    expect(fake.toasts.at(-1)).toBe("notas.txt fue a la papelera.")
    expect(treeRows(explorer.state()).map(rowLabel)).not.toContain("          notas.txt")
    // One the system would not take says so, and the folder stays as it was.
    fake.io.trash = async () => false
    await explorer.trash("C:/Users/test/proyectos/app.exe")
    expect(fake.toasts.at(-1)).toBe("no pude mandar app.exe a la papelera.")
  })

  test("⊟ collapses every disk: the session's open down to its folder, the others to their root; the disk shown stays", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    await explorer.toggleFolder("C:/Windows")
    await explorer.pickDrive("D:/")
    const turn = explorer.state().turn ?? 0
    explorer.collapse()
    // Shown on D:, it stays on D:, at its top, its root open and nothing under it.
    expect(explorer.state().drive).toBe("D:/")
    expect(explorer.state().top).toBe(0)
    expect(explorer.state().turn).toBe(turn + 1)
    expect(explorer.state().open.filter((key) => key.startsWith("d:"))).toEqual(["d:/"])
    // The session's disk, picked again, shows its folder in the middle and the rest closed.
    await explorer.pickDrive("C:/")
    expect(explorer.state().top).toBe(-1)
    explorer.collapse()
    expect(explorer.state().drive).toBe("C:/")
    expect(explorer.state().top).toBe(-1)
    const labels = treeRows(explorer.state()).map(rowLabel)
    expect(labels).toContain("      ▾ proyectos ●")
    expect(labels).toContain("  ▸ Windows")
    expect(labels).not.toContain("    ▸ System32")
    expect(explorer.state().flashed).toBe("collapse:")
  })
})

test("gotoHint: the explorer's field shows a path as the system writes one", () => {
  expect(gotoHint("win32")).toBe("pegá una ruta y Enter: D:\\carpeta\\archivo")
  expect(gotoHint("darwin")).toBe("pegá una ruta y Enter: /Users/carpeta/archivo")
})
