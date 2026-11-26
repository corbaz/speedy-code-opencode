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
  filterLine,
  filterMoved,
  filterNote,
  filterPattern,
  filterRows,
  FILTER_ROWS_MOST,
  ruleLabel,
  pauseLabel,
  rowAction,
  rowLabel,
  treeRows,
  windowTop,
  type ExplorerIO,
  type FsEntry,
  toolTip,
  createDoubleClick,
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

  test("a file's row: its name cut and filled with spaces up to its seven tools, emoji or Nerd Fonts glyphs in their colors", () => {
    const row = { path: "C:/x/un_nombre_muy_largo_de_archivo.txt", name: "un_nombre_muy_largo_de_archivo.txt", depth: 2, kind: "file" as const, isOpen: false, isHere: false }
    const label = fileNameLabel(row, 44)
    expect(cells(label)).toBe(44 - FILE_TOOLS_WIDTH)
    expect(label.startsWith("      un_nomb")).toBe(true)
    expect(label.trimEnd().endsWith("…")).toBe(true)
    const short = fileNameLabel({ ...row, name: "a.md", depth: 0 }, 44)
    expect(short).toBe("  a.md".padEnd(44 - FILE_TOOLS_WIDTH))
    // Each icon on its own two cells, pressed there alone; before each, a plain gap that takes no press, so a
    // press a little off an icon does nothing instead of its neighbour's work.
    expect(fileTools("emoji", "", row.path).map((tool) => [tool.kind, tool.label.trimEnd(), cells(tool.label), tool.gap, tool.color])).toEqual([
      // 📁 makes a folder there: in a folder, inside it; on a file, in its folder.
      ["mkdir", "📁", 2, 1, "#ffd43b"],
      ["copy", "📋", 2, 2, "#74c0fc"],
      ["path", "🔗", 2, 2, "#63e6be"],
      ["rename", "✏", 2, 2, "#b197fc"],
      ["trash", "🗑", 2, 2, "#ff8787"],
      // 📥 is grey, a plain mark, until 📋 took a file or a folder to paste; then it is lit.
      ["paste", "↧", 2, 2, "#495057"],
      // 📍, the session goes to work there, is a folder's alone: a file has its two cells empty, pressed for nothing.
      ["work", "", 2, 2, "#495057"],
    ])
    expect(fileTools("emoji", "", row.path).at(-1)?.isNone).toBe(true)
    expect(fileTools("emoji", "", "C:/x/docs", false, false, true).map((tool) => [tool.kind, tool.label.trimEnd(), tool.color, tool.isNone]).at(-1)).toEqual(["work", "📍", "#51cf66", false])
    expect(fileTools("emoji", "", row.path, true).map((tool) => [tool.kind, tool.label.trimEnd(), tool.color]).at(-2)).toEqual(["paste", "📥", "#ffa94d"])
    expect(fileTools("nerd", "", "C:/x/docs", false, false, true).map((tool) => tool.label)).toEqual(["\uea80\u00a0", "\uf0c5\u00a0", "\uf0c1\u00a0", "\uf044\u00a0", "\uf1f8\u00a0", "\uf0ea\u00a0", "\uf041\u00a0"])
    expect([fileTools("nerd", "", row.path).at(-2)?.color, fileTools("nerd", "", row.path, true).at(-2)?.color]).toEqual(["#495057", "#ffa94d"])
    // On a disk's root 📋, ✏ and 🗑 are grey: a disk is not copied, renamed or trashed; 🔗 and 📥 are as on any row.
    expect(fileTools("nerd", "", "C:/", true, true, true).map((tool) => tool.color)).toEqual(["#ffd43b", "#495057", "#63e6be", "#495057", "#495057", "#ffa94d", "#51cf66"])
    // The seven tools, and two empty cells after them that part the last one from the scroll bar.
    expect(FILE_TOOLS_WIDTH).toBe(1 + 2 + 6 * 4 + 2)
    // 📁 makes a folder on another machine too: its rows have it.
    expect(fileTools("emoji", "", "mac:/Users/ana")[0]).toMatchObject({ kind: "mkdir", label: "📁", isNone: false })
    // A folder's row is laid out as a file's: its open mark and name, filled up to the same four tools.
    const folder = { path: "C:/x/docs", name: "docs", depth: 1, kind: "dir" as const, isOpen: false, isHere: false }
    expect(fileNameLabel(folder, 40)).toBe("  ▸ docs".padEnd(40 - FILE_TOOLS_WIDTH))    // The tool just pressed is green, with no fill; the others keep their colors.
    const flashed = fileTools("emoji", `path:${row.path}`, row.path)
    expect(flashed.map((tool) => tool.color)).toEqual(["#ffd43b", "#74c0fc", "#51cf66", "#b197fc", "#ff8787", "#495057", "#495057"])
    expect(fileTools("emoji", `path:C:/otro.txt`, row.path).map((tool) => tool.color)).toEqual(["#ffd43b", "#74c0fc", "#63e6be", "#b197fc", "#ff8787", "#495057", "#495057"])
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
  paste: async () => false,
  rename: async () => false,
  mkdir: async () => false,
  trash: async () => false,
  exists: async () => false,
  toast: () => {},
  wait: async () => {},
  find: () => () => {},
}

function fakeIO(tree: typeof TREE = TREE) {
  const opened: string[] = []
  const viewed: string[] = []
  const files = { copied: [] as string[], texts: [] as string[], renamed: [] as string[], trashed: [] as string[], pasted: [] as string[], made: [] as string[] }
  const dialog = { answer: "cancel", asked: [] as string[] }
  const toasts: string[] = []
  const held: boolean[] = []
  let shown: (isShown: boolean) => void = () => {}
  // The prompt as the person left it: what is inserted lands at its end, where the cursor is.
  const prompt = { text: "mirá este" }
  const existing = new Set<string>()
  let release: () => void = () => {}
  // The filter's searches: what each was asked, what it hears and whether it was stopped.
  const searches: Array<{ ask: { root: string; first: string; pattern: string; most: number }; say: (line: object) => void; end: () => void; isStopped: boolean }> = []
  const io: ExplorerIO = {
    find: (ask, onLine, onEnd) => {
      const search = { ask, say: (line: object) => onLine(JSON.stringify(line)), end: onEnd, isStopped: false }
      searches.push(search)
      return () => void (search.isStopped = true)
    },
    list: async (path) => {
      const entries = tree[path.replace(/\\/g, "/")]
      if (!entries) throw new Error("EPERM")
      return entries.map((entry) => ({ isLink: false, ...entry }))
    },
    // A disk, a folder read, or an entry its folder lists as one.
    isDir: async (path) => {
      const plain = path.replace(/\\/g, "/")
      const at = plain.lastIndexOf("/")
      const parent = at === 2 ? plain.slice(0, 3) : plain.slice(0, at)
      const isListed = (tree[parent] ?? []).some((entry) => entry.name === plain.slice(at + 1) && entry.kind === "dir")
      return /^[CD]:\/$/.test(plain) || tree[plain] !== undefined || isListed
    },
    openFolder: (folder) => void opened.push(folder),
    // The popup is up when the test says so.
    view: (path, onShown) => {
      viewed.push(path)
      shown = onShown ?? (() => {})
    },
    copyFile: async (native) => (files.copied.push(native), true),
    copyText: async (text) => (files.texts.push(text), true),
    insert: async (text, separator) => {
      prompt.text += promptInsertion(prompt.text, text, separator)
    },
    ask: async (mode, native, kind, into) => (dialog.asked.push(`${mode} ${native}${kind === "dir" ? " dir" : ""}${into ? ` into ${into}` : ""}`), dialog.answer),
    hold: (isHeld) => void held.push(isHeld),
    paste: async (verb, native, target) => (files.pasted.push(`${verb} ${native} -> ${target}`), true),
    rename: async (native, name, target) => (files.renamed.push(`${native} -> ${name} (${target})`), true),
    mkdir: async (target) => (files.made.push(target), true),
    trash: async (native) => (files.trashed.push(native), true),
    exists: async (native) => existing.has(native),
    toast: (message) => void toasts.push(message),
    // A second passes when the test says so.
    wait: () => new Promise<void>((done) => (release = done)),
  }
  return { io, opened, viewed, files, dialog, toasts, prompt, existing, searches, held, second: () => release(), shown: (isShown: boolean) => shown(isShown) }
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
    // A folder closed and opened again is read afresh, and so is every folder still open under it: what came
    // and went on the disk meanwhile shows.
    await explorer.toggleFolder("C:/Users")
    TREE["C:/Users"]?.push({ name: "Invitado", kind: "dir" })
    TREE["C:/Users/test/proyectos"]?.push({ name: "nuevo.txt", kind: "file" })
    try {
      await explorer.toggleFolder("C:/Users")
      expect(labels().slice(2, 11)).toEqual([
        "  ▾ Users",
        "    ▸ Invitado",
        "    ▸ Public",
        "    ▾ test",
        "      ▾ proyectos ●",
        "        ▸ facturas",
        "          app.exe",
        "          notas.txt",
        "          nuevo.txt",
      ])
    } finally {
      TREE["C:/Users"]?.pop()
      TREE["C:/Users/test/proyectos"]?.pop()
    }
    await explorer.toggleFolder("C:/Users")
    await explorer.toggleFolder("C:/Users")
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

  test("on a Mac another machine's disk mounted over the network is left out where the machine is reached by ssh", async () => {
    const mac = (remotes: string[]): ExplorerIO => ({
      list: async (path) => {
        if (path === "/Volumes") {
          return [
            { name: "USB", kind: "dir", isLink: false },
            { name: "pc-d", kind: "dir", isLink: false },
          ]
        }
        return []
      },
      isDir: async () => false,
      openFolder: () => {},
      view: () => {},
      remotes: async () => remotes,
      mounts: async () => ["/Volumes/pc-d"],
      ...noTools,
    })
    const reached = createExplorer(mac(["windows"]), "darwin")
    await reached.open("/Users/me")
    // The disk is shown once, under its machine; a disk of the Mac's own stays.
    expect(reached.state().drives).toEqual(["/", "/Volumes/USB", "windows:/"])
    // With no machine by ssh, the mounted folder is the only way to that disk: it stays.
    const alone = createExplorer(mac([]), "darwin")
    await alone.open("/Users/me")
    expect(alone.state().drives).toEqual(["/", "/Volumes/USB", "/Volumes/pc-d"])
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
    // A folder is asked as one: one name, no extension.
    fake.dialog.answer = `rename ${Buffer.from("facturas 2025").toString("base64")}`
    await explorer.rename("C:/Users/test/proyectos/facturas")
    expect(fake.dialog.asked.at(-1)).toBe("rename C:\\Users\\test\\proyectos\\facturas dir")
    expect(fake.files.renamed.at(-1)).toBe("C:\\Users\\test\\proyectos\\facturas -> facturas 2025 (C:\\Users\\test\\proyectos\\facturas 2025)")
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

  test("📥 copies or moves into a row's folder what 📋 took, once the dialog said which; it asks nothing with nothing taken, or where the file is already", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    // Nothing taken yet: it says what to do first.
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("primero copiá un archivo o una carpeta con 📋.")
    expect(fake.dialog.asked).toEqual([])
    await explorer.copyFile(NOTAS)
    expect(explorer.state().clip).toBe(NOTAS)
    fake.existing.add(NATIVE)
    // On a folder's row: Cancelar does nothing; Copiar copies it there, the folder opens, and the file stays taken.
    await explorer.paste("C:/Windows")
    expect(fake.dialog.asked).toEqual([`paste ${NATIVE} into C:\\Windows`])
    expect(fake.files.pasted).toEqual([])
    fake.dialog.answer = "copy"
    await explorer.paste("C:/Windows")
    expect(fake.files.pasted).toEqual([`copy ${NATIVE} -> C:\\Windows\\notas.txt`])
    expect(fake.toasts.at(-1)).toBe("notas.txt se copió a Windows.")
    expect(explorer.state().open).toContain("c:/windows")
    expect(explorer.state().clip).toBe(NOTAS)
    // On a file's row it goes into the folder the file is in: a disk's root here. On the root's own row too.
    await explorer.paste("C:/pagefile.sys")
    expect(fake.files.pasted.at(-1)).toBe(`copy ${NATIVE} -> C:\\notas.txt`)
    fake.files.pasted.length = 0
    await explorer.paste("C:/")
    expect(fake.files.pasted).toEqual([`copy ${NATIVE} -> C:\\notas.txt`])
    expect(fake.toasts.at(-1)).toBe("notas.txt se copió a C:.")
    // A disk itself is not copied, renamed or trashed: nothing is asked, and it says so.
    const before = fake.dialog.asked.length
    await explorer.trash("C:/")
    await explorer.rename("C:/")
    await explorer.copyFile("C:/")
    expect(fake.toasts.at(-1)).toBe("un disco no se copia, no se renombra ni se borra.")
    expect([fake.dialog.asked.length, explorer.state().clip]).toEqual([before, NOTAS])
    // Into the folder it is in already, or where a file of its name is, nothing is asked.
    const asked = fake.dialog.asked.length
    await explorer.paste("C:/Users/test/proyectos/app.exe")
    expect(fake.toasts.at(-1)).toBe("notas.txt ya está en esa carpeta.")
    fake.existing.add("C:\\Users\\Public\\notas.txt")
    await explorer.paste("C:/Users/Public")
    expect(fake.toasts.at(-1)).toBe("ya hay un notas.txt en esa carpeta.")
    expect(fake.dialog.asked.length).toBe(asked)
    // What could not be done is said, and the file stays taken.
    fake.io.paste = async () => false
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("no pude copiar notas.txt.")
    expect(explorer.state().clip).toBe(NOTAS)
    // Mover moves it: nothing is taken any more.
    fake.io.paste = async (verb, native, target) => (fake.files.pasted.push(`${verb} ${native} -> ${target}`), true)
    fake.dialog.answer = "move"
    await explorer.paste("C:/Windows")
    expect(fake.files.pasted.at(-1)).toBe(`move ${NATIVE} -> C:\\Windows\\notas.txt`)
    expect(fake.toasts.at(-1)).toBe("notas.txt se movió a Windows.")
    expect(explorer.state().clip).toBeUndefined()
    // A folder taken does not go into itself, nor under itself; and one gone since it was taken is taken no more.
    await explorer.copyFile("C:/Users/test/proyectos")
    fake.existing.add("C:\\Users\\test\\proyectos")
    await explorer.paste("C:/Users/test/proyectos/facturas")
    expect(fake.toasts.at(-1)).toBe("proyectos no puede ir dentro de sí misma.")
    fake.existing.delete("C:\\Users\\test\\proyectos")
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("proyectos ya no está donde se copió.")
    expect(explorer.state().clip).toBeUndefined()
  })

  test("a file pressed is green until its popup is up, then stays marked until another press", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    explorer.pressFile(NOTAS)
    expect([fake.viewed, explorer.state().flashed, explorer.state().viewed]).toEqual([[NOTAS], `view:${NOTAS}`, undefined])
    // The popup is up: the green ends, and the file is the one marked.
    fake.shown(true)
    expect([explorer.state().flashed, explorer.state().viewed]).toEqual(["", NOTAS.toLowerCase()])
    // Another press takes the mark off.
    await explorer.toggleFolder("C:/Windows")
    expect(explorer.state().viewed).toBeUndefined()
    // A popup that never came up: the green ends, and nothing is marked.
    explorer.pressFile(NOTAS)
    fake.shown(false)
    expect([explorer.state().flashed, explorer.state().viewed]).toEqual(["", undefined])
  })

  test("‖ pausar holds a search that runs, and ▶ seguir lets it go on from where it was", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    // With no search running it does nothing.
    explorer.pauseFilter()
    expect([explorer.state().filter, fake.held]).toEqual([undefined, []])
    explorer.filter("*.pdf")
    fake.searches[0]!.say({ paths: ["C:/a.pdf"], seen: 10 })
    expect([pauseLabel(explorer.state().filter), ruleLabel(explorer.state(), 40).includes("buscando…")]).toEqual([" ‖ pausar ", true])
    explorer.pauseFilter()
    // It is held, not ended: the search is still there.
    expect([fake.held, fake.searches[0]!.isStopped]).toEqual([[true], false])
    expect(explorer.state().filter).toMatchObject({ paths: ["C:/a.pdf"], isBusy: false, isPaused: true })
    expect(ruleLabel(explorer.state(), 40)).toContain(" *.pdf: 1 archivo, en pausa ")
    expect(pauseLabel(explorer.state().filter)).toBe(" ▸ seguir ")
    // Held, it only says it is still there: it stays held.
    fake.searches[0]!.say({ paths: [], seen: 10 })
    expect(explorer.state().filter).toMatchObject({ isBusy: false, isPaused: true })
    explorer.pauseFilter()
    expect(fake.held).toEqual([true, false])
    expect(explorer.state().filter).toMatchObject({ isBusy: true, isPaused: false })
    fake.searches[0]!.say({ paths: ["C:/b.pdf"], seen: 20, done: true, cut: false })
    expect(explorer.state().filter).toMatchObject({ paths: ["C:/a.pdf", "C:/b.pdf"], isBusy: false, isPaused: false })
    // Ended, there is nothing to hold.
    explorer.pauseFilter()
    expect(fake.held).toEqual([true, false])
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
    // A folder goes with what it holds; the dialog says so.
    await explorer.trash("C:/Users/test/proyectos/facturas")
    expect(fake.dialog.asked.at(-1)).toBe("delete C:\\Users\\test\\proyectos\\facturas dir")
    expect(fake.files.trashed.at(-1)).toBe("C:\\Users\\test\\proyectos\\facturas")
    // One the system would not take says so, and the folder stays as it was.
    fake.io.trash = async () => false
    await explorer.trash("C:/Users/test/proyectos/app.exe")
    expect(fake.toasts.at(-1)).toBe("no pude mandar app.exe a la papelera.")
  })

  test("📁 asks the new folder's name: cancel makes nothing; a name makes it where the row is, and that folder is read again, open", async () => {
    const tree = { ...TREE }
    const fake = fakeIO(tree)
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    await explorer.newFolder("C:/Windows")
    expect(fake.dialog.asked).toEqual(["mkdir C:\\Windows dir"])
    expect(fake.files.made).toEqual([])
    // "Año 2025", as the dialog says it.
    fake.dialog.answer = "mkdir QcOxbyAyMDI1"
    await explorer.newFolder("C:/Windows")
    expect(fake.files.made).toEqual(["C:\\Windows\\Año 2025"])
    expect(fake.toasts.at(-1)).toBe("se creó la carpeta Año 2025 en Windows.")
    expect(explorer.state().open).toContain("c:/windows")
    // On a file's row it goes into the folder the file is in.
    await explorer.newFolder(NOTAS)
    expect(fake.dialog.asked.at(-1)).toBe("mkdir C:\\Users\\test\\proyectos dir")
    expect(fake.files.made.at(-1)).toBe("C:\\Users\\test\\proyectos\\Año 2025")
    // Nothing is written over; a name the system takes no folder by is refused.
    fake.existing.add("C:\\Users\\test\\proyectos\\facturas")
    fake.dialog.answer = "mkdir ZmFjdHVyYXM="
    await explorer.newFolder("C:/Users/test/proyectos")
    expect(fake.files.made.length).toBe(2)
    expect(fake.toasts.at(-1)).toBe("ya hay un facturas en esa carpeta.")
    fake.dialog.answer = "name a:b"
    await explorer.newFolder("C:/Users/test/proyectos")
    expect(fake.files.made.length).toBe(2)
    expect(fake.toasts.at(-1)).toContain("no creé la carpeta")
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

describe("the explorer's filter", () => {
  const texts = (rows: ReturnType<typeof treeRows>) => rows.map(rowLabel)

  test("filterRows, filterNote, ruleLabel, filterLine, filterPattern and filterMoved: a filter's tree holds the files found under their folders; a file renamed or trashed follows", () => {
    const state = { drives: ["/"], drive: "/", open: [], listed: {}, here: "/Users/ana", caseless: false, top: 0 }
    const filter = { pattern: "a*.docx", paths: ["/Users/ana/b/acta 10.docx", "/Users/ana/b/acta 2.docx", "/Users/ana/Acta.docx"], seen: 1200, isBusy: true, isCut: false, closed: [] as string[] }
    expect(texts(filterRows(state, filter))).toEqual(["▾ /", "  ▾ Users", "    ▾ ana ●", "      ▾ b", "          acta 2.docx", "          acta 10.docx", "        Acta.docx"])
    expect(texts(treeRows({ ...state, filter: { ...filter, closed: ["/Users/ana/b"] } }))).toEqual(["▾ /", "  ▾ Users", "    ▾ ana ●", "      ▸ b", "        Acta.docx"])
    expect(texts(filterRows(state, { ...filter, paths: [] }))).toEqual(["▾ /", "  buscando…"])
    expect(texts(filterRows(state, { ...filter, paths: [], isBusy: false }))).toEqual(["▾ /", "  (ningún archivo coincide)"])
    expect(texts(filterRows(state, { ...filter, paths: ["/a.docx"], isCut: true }))).toEqual(["▾ /", "    a.docx", "  … hay más: son los primeros 1"])
    // The panel draws every row it is given: past the most it shows, the tree says how many files more were found.
    const many = filterRows(state, { ...filter, paths: Array.from({ length: 1500 }, (_, index) => `/f${index}.docx`) })
    expect(many.length).toBe(FILTER_ROWS_MOST + 1)
    expect(many.at(-1)).toMatchObject({ kind: "note", name: `… y ${(1500 - (FILTER_ROWS_MOST - 1)).toLocaleString("es-AR")} más: afiná el filtro para verlos` })
    expect(filterNote(filter)).toBe(" a*.docx: 3 archivos, buscando… (1.200 vistos) ")
    expect(filterNote({ ...filter, paths: ["/a.docx"], isBusy: false })).toBe(" a*.docx: 1 archivo ")
    expect(ruleLabel(state, 12)).toBe("─".repeat(12))
    expect(ruleLabel({ ...state, filter: { ...filter, isBusy: false } }, 30)).toBe("─ a*.docx: 3 archivos ────────")
    expect(filterLine('{"paths": ["C:/a.pdf", 3], "seen": 12, "done": true, "cut": true}')).toEqual({ paths: ["C:/a.pdf"], seen: 12, isDone: true, isCut: true })
    expect(filterLine('{"paths": [], "seen": 5}')).toEqual({ paths: [], seen: 5, isDone: false, isCut: false })
    expect(filterLine("Traceback")).toBeUndefined()
    expect(filterPattern('  "*.pdf" ')).toBe("*.pdf")
    expect(filterPattern("   ")).toBe("")
    expect(filterMoved({ ...state, filter }, "/Users/ana/b", "/Users/ana/c").filter?.paths).toEqual(["/Users/ana/c/acta 10.docx", "/Users/ana/c/acta 2.docx", "/Users/ana/Acta.docx"])
    expect(filterMoved({ ...state, filter }, "/Users/ana/Acta.docx").filter?.paths).toEqual(["/Users/ana/b/acta 10.docx", "/Users/ana/b/acta 2.docx"])
    expect(filterMoved(state, "/Users/ana/Acta.docx")).toBe(state)
  })

  test("a pattern, Enter: the disk shown is searched, the session's folder first, and the tree holds the files found; a folder closes and opens; another disk is searched too; × brings the whole tree back", async () => {
    const { io, searches } = fakeIO()
    const explorer = createExplorer(io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    const whole = texts(treeRows(explorer.state()))
    explorer.filter(' "*.pdf" ')
    expect(searches[0]!.ask).toEqual({ root: "C:\\", first: "C:\\Users\\test\\proyectos", pattern: "*.pdf", most: 50000 })
    expect(texts(treeRows(explorer.state()))).toEqual(["▾ C:\\", "  buscando…"])
    searches[0]!.say({ paths: ["C:/Users/test/proyectos/informe.pdf"], seen: 40 })
    searches[0]!.say({ paths: ["C:/Users/Public/Guía.PDF", "C:/apuntes.pdf"], seen: 90, done: true, cut: false })
    searches[0]!.end()
    expect(explorer.state().filter).toMatchObject({ pattern: "*.pdf", seen: 90, isBusy: false, isCut: false })
    expect(texts(treeRows(explorer.state()))).toEqual(["▾ C:\\", "  ▾ Users", "    ▾ Public", "        Guía.PDF", "    ▾ test", "      ▾ proyectos ●", "          informe.pdf", "    apuntes.pdf"])
    // A folder of a filter's tree closes with a press, and opens with another.
    await explorer.toggleFolder("C:/Users/test")
    expect(texts(treeRows(explorer.state()))).toContain("    ▸ test")
    await explorer.toggleFolder("C:/Users/test")
    expect(texts(treeRows(explorer.state()))).toContain("          informe.pdf")
    // Another disk is searched with the same filter, and the search before is stopped: its lines are not heard.
    await explorer.pickDrive("D:/")
    expect(searches[0]!.isStopped).toBe(true)
    expect(searches[1]!.ask).toMatchObject({ root: "D:\\", pattern: "*.pdf" })
    searches[0]!.say({ paths: ["C:/tarde.pdf"], seen: 99 })
    searches[1]!.say({ paths: [], seen: 7, done: true, cut: false })
    expect(texts(treeRows(explorer.state()))).toEqual(["▾ D:\\", "  (ningún archivo coincide)"])
    // × clears it: the search ends, the field empties and the whole tree is back.
    explorer.clearFilter()
    expect(searches[1]!.isStopped).toBe(true)
    expect(explorer.state().filter).toBeUndefined()
    expect(explorer.state().cleared).toBe(1)
    expect(texts(treeRows(explorer.state()))).toEqual(["▾ D:\\", "  ▸ fotos"])
    await explorer.pickDrive("C:/")
    expect(texts(treeRows(explorer.state()))).toEqual(whole)
    // An empty pattern clears the filter as × does; a search that ends on its own, with no last line, is over.
    explorer.filter("notas")
    searches[2]!.end()
    expect(explorer.state().filter?.isBusy).toBe(false)
    explorer.filter("  ")
    expect(explorer.state().filter).toBeUndefined()
  })
})

describe("each tool's label, beside it while the pointer is on it", () => {
  test("what it does, for a file or a folder, 📥 for what 📋 took, and why a disk's grey ones do nothing", () => {
    expect([toolTip("mkdir", true), toolTip("copy", true), toolTip("path", true), toolTip("rename", true), toolTip("trash", true), toolTip("work", true)]).toEqual([
      "Crear carpeta",
      "Copiar carpeta",
      "Copiar path",
      "Renombrar carpeta",
      "Borrar carpeta",
      "Cambiar espacio de trabajo",
    ])
    expect([toolTip("copy", false), toolTip("rename", false), toolTip("trash", false)]).toEqual(["Copiar archivo", "Renombrar archivo", "Borrar archivo"])
    expect([toolTip("paste", true), toolTip("paste", true, "dir"), toolTip("paste", false, "file")]).toEqual(["Pegar: copiá algo con 📋 antes", "Pegar carpeta", "Pegar archivo"])
    expect([toolTip("trash", true, undefined, true), toolTip("mkdir", true, undefined, true)]).toEqual(["no se hace con un disco", "Crear carpeta"])
  })

  test("📋 remembers whether it took a folder or a file, and 📥 forgets it once it moved it", async () => {
    const { io } = fakeIO()
    const explorer = createExplorer({ ...io, copyFile: async () => true }, "win32")
    await explorer.open("C:/Users/test/proyectos")
    await explorer.copyFile("C:/Users/test/proyectos/facturas")
    expect(explorer.state().clipKind).toBe("dir")
    await explorer.copyFile("C:/Users/test/proyectos/notas.txt")
    expect(explorer.state().clipKind).toBe("file")
  })
})

describe("a file's row and the double click", () => {
  test("a file's row has no 📁 nor 📥, their cells empty; a folder's has them", () => {
    const file = fileTools("emoji", "", "C:/x/notas.txt", true, false, false, false)
    expect(file.map((tool) => [tool.kind, tool.isNone])).toEqual([["mkdir", true], ["copy", false], ["path", false], ["rename", false], ["trash", false], ["paste", true], ["work", true]])
    expect(file.map((tool) => cells(tool.label) + tool.gap)).toEqual([3, 4, 4, 4, 4, 4, 4])
    expect(fileTools("emoji", "", "C:/x", true, false, true, true).every((tool) => !tool.isNone)).toBe(true)
  })

  test("a tool acts on a double click: two clicks on it within half a second; one, or two apart, does nothing", () => {
    const click = createDoubleClick()
    expect(click("copy:C:/a", 0)).toBe(false)
    expect(click("copy:C:/a", 300)).toBe(true)
    // A double click starts over: a third click is a first one.
    expect(click("copy:C:/a", 350)).toBe(false)
    expect(click("copy:C:/a", 1000)).toBe(false)
    // Another tool in between is a first click of its own.
    expect(click("path:C:/a", 1100)).toBe(false)
    expect(click("copy:C:/a", 1200)).toBe(false)
    expect(click("copy:C:/a", 1300)).toBe(true)
  })
})
