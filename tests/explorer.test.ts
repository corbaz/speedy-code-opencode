import { describe, expect, test } from "bun:test"

import {
  ROW_MORE,
  badFileName,
  chainOf,
  collapseLabel,
  crumbPath,
  crumbsOf,
  isPathText,
  matchSpans,
  namePieces,
  pauseTip,
  systemTip,
  FIELD_HINT,
  cutCells,
  fileNameLabel,
  isHeld,
  isRowFlashed,
  menuPlace,
  toolMenu,
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
  freeName,
  filterMatches,
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

  test("a file's row: its name cut and filled with spaces to the tree's width; its tools are its menu, emoji or Nerd Fonts glyphs in their colors", () => {
    const row = { path: "C:/x/un_nombre_muy_largo_de_archivo_que_no_entra_en_su_fila.txt", name: "un_nombre_muy_largo_de_archivo_que_no_entra_en_su_fila.txt", depth: 2, kind: "file" as const, isOpen: false, isHere: false }
    // The row is the name alone, on the tree's whole width: under the pointer and while selected its fill runs all of it.
    const label = fileNameLabel(row, 44)
    expect(cells(label)).toBe(44)
    expect(label.startsWith("      un_nomb")).toBe(true)
    expect(label.trimEnd().endsWith("…")).toBe(true)
    expect(fileNameLabel({ ...row, name: "a.md", depth: 0 }, 44)).toBe("  a.md".padEnd(44))
    // A folder's row is laid out as a file's: its open mark and its name.
    const folder = { path: "C:/x/docs", name: "docs", depth: 1, kind: "dir" as const, isOpen: false, isHere: false }
    expect(fileNameLabel(folder, 40)).toBe("  ▸ docs".padEnd(40))
    // ⋯, at the end of the row selected, opens the row's menu: three cells.
    expect(cells(ROW_MORE)).toBe(3)
    // A folder's menu: the seven tools, one under the other, each with what it does and its color; every icon
    // on two cells, every text filled to the longest, so the menu's lines are one width.
    const dir = toolMenu({ isFolder: true }, undefined, "emoji")
    expect(dir.items.map((item) => [item.kind, item.icon.trimEnd(), cells(item.icon), item.text.trimEnd(), item.color])).toEqual([
      ["mkdir", "📁", 2, "Crear carpeta", "#ffd43b"],
      ["copy", "📋", 2, "Copiar carpeta", "#74c0fc"],
      // 📥, after 📋, is grey, a plain mark, and says why, until 📋 took a file or a folder; then it is lit.
      ["paste", "↧", 2, "Pegar: primero copiá algo", "#ffa94d"],
      ["path", "🔗", 2, "Copiar path", "#63e6be"],
      ["rename", "✏", 2, "Renombrar carpeta", "#b197fc"],
      ["trash", "🗑", 2, "Borrar carpeta", "#ff8787"],
      ["work", "📍", 2, "Cambiar espacio de trabajo", "#51cf66"],
    ])
    expect(dir.items.filter((item) => item.isIdle).map((item) => item.kind)).toEqual(["paste"])
    expect(dir.width).toBe(cells("Cambiar espacio de trabajo"))
    expect(new Set(dir.items.map((item) => cells(item.text))).size).toBe(1)
    // What 📋 took lights 📥, which says what it pastes.
    expect(toolMenu({ isFolder: true }, { kind: "dir" }, "emoji").items[2]).toEqual({ kind: "paste", icon: "📥", text: "Pegar carpeta".padEnd(dir.width), color: "#ffa94d" })
    expect(toolMenu({ isFolder: true }, { kind: "file" }, "emoji").items[2]?.text.trimEnd()).toBe("Pegar archivo")
    // A file's menu has the four that are a file's: no 📁, no 📥, no 📍.
    expect(toolMenu({ isFolder: false }, { kind: "file" }, "emoji").items.map((item) => [item.kind, item.text.trimEnd()])).toEqual([
      ["copy", "Copiar archivo"],
      ["path", "Copiar path"],
      ["rename", "Renombrar archivo"],
      ["trash", "Borrar archivo"],
    ])
    // A disk's root has a folder's, to paste into it and to copy its path: 📋, ✏ and 🗑 are grey there, and say why.
    const disk = toolMenu({ isFolder: true, isDisk: true }, { kind: "file" }, "nerd")
    expect(disk.items.filter((item) => item.isIdle).map((item) => item.text.trimEnd())).toEqual(["Copiar: no se hace con un disco", "Renombrar: no se hace con un disco", "Borrar: no se hace con un disco"])
    // Nerd Fonts: each glyph with the cell it spills over.
    expect(disk.items.map((item) => item.icon)).toEqual(["\uea80\u00a0", "\uf0c5\u00a0", "\uf0ea\u00a0", "\uf0c1\u00a0", "\uf044\u00a0", "\uf1f8\u00a0", "\uf041\u00a0"])
    // 📍 is on a folder of this machine alone; 📁 makes a folder on another machine too.
    expect(toolMenu({ isFolder: true, isFar: true }, undefined, "emoji").items.map((item) => item.kind)).toEqual(["mkdir", "copy", "paste", "path", "rename", "trash"])
    // The row whose tool was just pressed, or whose file is being opened, is green; another row is not.
    expect([isRowFlashed(`path:${row.path}`, row.path), isRowFlashed(`view:${row.path}`, row.path), isRowFlashed("path:C:/otro.txt", row.path), isRowFlashed("", row.path)]).toEqual([true, true, false, false])
    expect(isRowFlashed("collapse:", "")).toBe(false)
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
  // What each dialog was asked, the names offered, and the answers: those of `queue` one after the other, then `answer`.
  const dialog = { answer: "cancel", asked: [] as string[], offered: [] as string[], queue: [] as string[] }
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
    ask: async (mode, native, kind, into, offered, isCopyOnly) => {
      dialog.asked.push(`${mode} ${native}${kind === "dir" ? " dir" : ""}${into ? ` into ${into}` : ""}${isCopyOnly ? " only copy" : ""}`)
      dialog.offered.push(offered ?? "")
      return dialog.queue.shift() ?? dialog.answer
    },
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

  test("↗, named by the system's own file manager, opens in it the folder the path's row shows; with no row selected, the session's", async () => {
    expect([systemTip("win32"), systemTip("darwin")]).toEqual(["Abrir con Explorer", "Abrir con Finder"])
    const { io, opened, toasts } = fakeIO()
    const explorer = createExplorer(io, "win32")
    await explorer.open("C:\\Users\\test\\proyectos")
    await explorer.openSystem()
    expect(opened).toEqual(["C:\\Users\\test\\proyectos"])
    // A folder selected: that folder. A file selected: the folder it is in.
    explorer.pick("C:/Users/test/proyectos/facturas")
    await explorer.openSystem()
    expect(opened.at(-1)).toBe("C:\\Users\\test\\proyectos\\facturas")
    explorer.pick("C:/Users/test/proyectos/notas.txt")
    await explorer.openSystem()
    expect(opened.at(-1)).toBe("C:\\Users\\test\\proyectos")
    // A disk's root is its own folder.
    explorer.pick("C:/")
    await explorer.openSystem()
    expect(opened.at(-1)).toBe("C:\\")
    // Let go of: the session's folder again.
    explorer.pick(undefined)
    await explorer.openSystem()
    expect(opened.at(-1)).toBe("C:\\Users\\test\\proyectos")
    expect(opened.length).toBe(5)
    expect(toasts).toEqual([])
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

  test("📥 copies or moves into a folder what 📋 took, a file or a folder; where its name is taken, a new one is asked first", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:/Users/test/proyectos")
    const FOLDER = "C:/Users/test/proyectos/facturas"
    const FOLDER_NATIVE = "C:\\Users\\test\\proyectos\\facturas"
    // Nothing taken yet: it says what to do first.
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("primero copiá un archivo o una carpeta con 📋.")
    expect(fake.dialog.asked).toEqual([])
    // A file taken goes into another folder: Cancelar does nothing; Copiar copies it, the folder opens, and it stays taken.
    await explorer.copyFile(NOTAS)
    expect([explorer.state().clip, explorer.state().clipKind]).toEqual([NOTAS, "file"])
    fake.existing.add(NATIVE)
    await explorer.paste("C:/Windows")
    expect(fake.dialog.asked).toEqual([`paste ${NATIVE} into C:\\Windows`])
    expect(fake.files.pasted).toEqual([])
    fake.dialog.answer = "copy"
    await explorer.paste("C:/Windows")
    expect(fake.files.pasted).toEqual([`copy ${NATIVE} -> C:\\Windows\\notas.txt`])
    expect(fake.toasts.at(-1)).toBe("notas.txt se copió a Windows.")
    expect(explorer.state().open).toContain("c:/windows")
    expect(explorer.state().clip).toBe(NOTAS)
    // Into the folder it is in, its name is taken: a new one is asked first, a free one offered (name and
    // extension), then Copiar alone, under that name: moved there it would only be renamed.
    fake.dialog.asked.length = 0
    fake.dialog.offered.length = 0
    fake.files.pasted.length = 0
    fake.dialog.queue.push("rename bm90YXMgdmllamFzLm1k", "copy")
    await explorer.paste("C:/Users/test/proyectos")
    expect(fake.dialog.asked).toEqual([`rename ${NATIVE} into C:\\Users\\test\\proyectos`, `paste ${NATIVE} into C:\\Users\\test\\proyectos only copy`])
    expect(fake.dialog.offered).toEqual(["notas (2).txt", "notas viejas.md"])
    expect(fake.files.pasted).toEqual([`copy ${NATIVE} -> C:\\Users\\test\\proyectos\\notas viejas.md`])
    expect(fake.toasts.at(-1)).toBe("notas.txt se copió a proyectos como notas viejas.md.")
    // Where one of its name is, in another folder: the same, and there Mover is offered too.
    fake.existing.add("C:\\Users\\Public\\notas.txt")
    fake.dialog.asked.length = 0
    fake.dialog.queue.push("rename bm90YXMgMi50eHQ=", "move")
    await explorer.paste("C:/Users/Public")
    expect(fake.dialog.asked).toEqual([`rename ${NATIVE} into C:\\Users\\Public`, `paste ${NATIVE} into C:\\Users\\Public`])
    expect(fake.files.pasted.at(-1)).toBe(`move ${NATIVE} -> C:\\Users\\Public\\notas 2.txt`)
    expect(fake.toasts.at(-1)).toBe("notas.txt se movió a Public como notas 2.txt.")
    // A new name taken too, or cancelled, pastes nothing.
    await explorer.copyFile(NOTAS)
    const before = fake.files.pasted.length
    fake.dialog.queue.push("rename bm90YXMudHh0")
    await explorer.paste("C:/Users/test/proyectos")
    expect(fake.toasts.at(-1)).toBe("ya hay un notas.txt en esa carpeta.")
    fake.dialog.queue.push("cancel")
    await explorer.paste("C:/Users/test/proyectos")
    expect(fake.files.pasted.length).toBe(before)
    // A folder works the same: one name field, a free one offered.
    await explorer.copyFile(FOLDER)
    expect([explorer.state().clip, explorer.state().clipKind]).toEqual([FOLDER, "dir"])
    fake.existing.add(FOLDER_NATIVE)
    fake.dialog.asked.length = 0
    fake.dialog.offered.length = 0
    fake.dialog.queue.push("rename ZmFjdHVyYXMgMjAyNQ==", "copy")
    await explorer.paste("C:/Users/test/proyectos")
    expect(fake.dialog.asked).toEqual([`rename ${FOLDER_NATIVE} dir into C:\\Users\\test\\proyectos`, `paste ${FOLDER_NATIVE} dir into C:\\Users\\test\\proyectos only copy`])
    expect(fake.dialog.offered).toEqual(["facturas (2)", "facturas 2025"])
    expect(fake.files.pasted.at(-1)).toBe(`copy ${FOLDER_NATIVE} -> C:\\Users\\test\\proyectos\\facturas 2025`)
    // On a disk's root's own row too.
    fake.dialog.answer = "copy"
    await explorer.paste("C:/")
    expect(fake.files.pasted.at(-1)).toBe(`copy ${FOLDER_NATIVE} -> C:\\facturas`)
    expect(fake.toasts.at(-1)).toBe("facturas se copió a C:.")
    // A disk itself is not copied, renamed or trashed: nothing is asked, and it says so; that lets go of what 📋 took.
    const asked = fake.dialog.asked.length
    await explorer.trash("C:/")
    await explorer.rename("C:/")
    await explorer.copyFile("C:/")
    expect(fake.toasts.at(-1)).toBe("un disco no se copia, no se renombra ni se borra.")
    expect([fake.dialog.asked.length, explorer.state().clip]).toEqual([asked, undefined])
    // What could not be done is said, and the folder stays taken.
    await explorer.copyFile(FOLDER)
    fake.io.paste = async () => false
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("no pude copiar facturas.")
    expect(explorer.state().clip).toBe(FOLDER)
    // Mover moves it: nothing is taken any more.
    fake.io.paste = async (verb, native, target) => (fake.files.pasted.push(`${verb} ${native} -> ${target}`), true)
    fake.dialog.answer = "move"
    await explorer.paste("C:/Windows")
    expect(fake.files.pasted.at(-1)).toBe(`move ${FOLDER_NATIVE} -> C:\\Windows\\facturas`)
    expect(fake.toasts.at(-1)).toBe("facturas se movió a Windows.")
    expect([explorer.state().clip, explorer.state().clipKind]).toEqual([undefined, undefined])
    // A folder taken does not go into a folder under itself; and one gone since it was taken is taken no more.
    await explorer.copyFile("C:/Users/test/proyectos")
    fake.existing.add("C:\\Users\\test\\proyectos")
    await explorer.paste("C:/Users/test/proyectos/facturas")
    expect(fake.toasts.at(-1)).toBe("proyectos no puede ir dentro de sí misma.")
    fake.existing.delete("C:\\Users\\test\\proyectos")
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("proyectos ya no está donde se copió.")
    expect(explorer.state().clip).toBeUndefined()
  })

  test("the first name free for what is pasted where its own is taken", () => {
    expect(freeName("notas.txt", false, new Set(["notas.txt"]))).toBe("notas (2).txt")
    expect(freeName("notas.txt", false, new Set(["notas.txt", "notas (2).txt"]))).toBe("notas (3).txt")
    expect(freeName(".gitignore", false, new Set([".gitignore"]))).toBe(".gitignore (2)")
    expect(freeName("v1.2", true, new Set(["v1.2"]))).toBe("v1.2 (2)")
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
    expect([pauseLabel(explorer.state().filter), ruleLabel(explorer.state(), 40).includes("buscando…")]).toEqual([" ‖ ", true])
    expect(pauseTip(explorer.state().filter)).toBe("pausar")
    explorer.pauseFilter()
    // It is held, not ended: the search is still there.
    expect([fake.held, fake.searches[0]!.isStopped]).toEqual([[true], false])
    expect(explorer.state().filter).toMatchObject({ paths: ["C:/a.pdf"], isBusy: false, isPaused: true })
    expect(ruleLabel(explorer.state(), 40)).toContain(" *.pdf: 1 archivo, en pausa ")
    expect([pauseLabel(explorer.state().filter), pauseTip(explorer.state().filter)]).toEqual([" ▸ ", "seguir"])
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

describe("the explorer's header: one field, the path's row, what a filter matched", () => {
  test("isPathText: the one field tells a path, which is gone to, from a filter's pattern", () => {
    expect(FIELD_HINT).toBe("filtrar *.pdf o pegar una ruta")
    // A path has a separator, or is a disk. Anything else is a pattern.
    expect(["D:\\Excel\\rand.xlsx", ' "C:/Users/ana" ', "src/app.ts", "D:", "mac:", "mac:/Users/ana", "@C:\\x.md", "/Users/ana"].map(isPathText)).toEqual([true, true, true, true, true, true, true, true])
    expect(["*.pdf", "a*.docx", "notas", "notas.txt", "", "  "].map(isPathText)).toEqual([false, false, false, false, false, false])
  })

  test("crumbsOf: each folder from the disk down, fitted to the row's width", () => {
    const all = crumbsOf("C:/Users/ana/docs", "C:/", 40)
    expect(all.map((part) => part.text).join("")).toBe(" C: › Users › ana › docs")
    expect(all.filter((part) => part.path).map((part) => [part.path, part.at, part.width])).toEqual([["C:/", 1, 2], ["C:/Users", 6, 5], ["C:/Users/ana", 14, 3], ["C:/Users/ana/docs", 20, 4]])
    // Too long for its row: the disk, …, and the last folders that fit.
    expect(crumbsOf("C:/Users/ana/docs/informes/2025", "C:/", 30).map((part) => part.text).join("")).toBe(" C: › … › informes › 2025")
    expect(crumbsOf("C:/Users/ana/docs/informes/2025", "C:/", 30).filter((part) => part.path).map((part) => part.path)).toEqual(["C:/", "C:/Users/ana/docs/informes", "C:/Users/ana/docs/informes/2025"])
    // Not even the last one fits: it is cut.
    expect(crumbsOf("C:/Users/un_nombre_muy_largo_de_carpeta", "C:/", 20).map((part) => part.text).join("")).toBe(" C: › … › un_nombre…")
    expect(crumbsOf("C:/un_nombre_muy_largo_de_carpeta", "C:/", 16).map((part) => part.text).join("")).toBe(" C: › un_nombre…")
    // A disk's root is the disk alone; another machine's path starts at its disk; a Mac's at /.
    expect(crumbsOf("D:/", "D:/", 40).map((part) => part.text).join("")).toBe(" D:")
    expect(crumbsOf("mac:/Users/ana", "mac:/", 40).map((part) => part.text).join("")).toBe(" mac › Users › ana")
    expect(crumbsOf("/Users/ana", "/", 40).filter((part) => part.path).map((part) => part.path)).toEqual(["/", "/Users", "/Users/ana"])
  })

  test("matchSpans and namePieces: what of a name a filter's pattern matched, for its row to mark", () => {
    // The pattern's own letters, not what `*` and `?` stood for; whatever the case.
    expect(matchSpans("*.pdf", "informe.pdf")).toEqual([[7, 11]])
    expect(matchSpans("*.PDF", "Guía.pdf")).toEqual([[4, 8]])
    expect(matchSpans("a*.docx", "acta final.docx")).toEqual([[0, 1], [10, 15]])
    expect(matchSpans("a?c", "abc")).toEqual([[0, 1], [2, 3]])
    // A pattern with neither is a part of the name: where it first is.
    expect(matchSpans("nota", "mis notas y notas.txt")).toEqual([[4, 8]])
    expect(matchSpans(" (v2).txt ", "informe (v2).txt")).toEqual([[8, 16]])
    expect([matchSpans("*.pdf", "informe.txt"), matchSpans("", "informe.txt"), matchSpans("*", "informe.txt")]).toEqual([[], [], []])
    // A file's row in pieces, the matched ones marked; with no filter, or on a folder, the row is one piece.
    const file = { path: "C:/x/informe.pdf", name: "informe.pdf", depth: 1, kind: "file" as const, isOpen: false, isHere: false }
    expect(namePieces(file, 20, "*.pdf")).toEqual([{ text: "    informe", isMatch: false }, { text: ".pdf", isMatch: true }, { text: "     ", isMatch: false }])
    expect(namePieces(file, 20)).toEqual([{ text: "    informe.pdf     ", isMatch: false }])
    expect(namePieces({ ...file, kind: "dir" as const, name: "pdf" }, 12, "*pdf")).toEqual([{ text: "  ▸ pdf     ", isMatch: false }])
    // Nothing is marked past where a long name is cut.
    expect(namePieces(file, 12, "*.pdf")).toEqual([{ text: "    informe…", isMatch: false }])
  })

  test("the field's Enter goes to a path or filters; the row selected, or the path gone to, is the path shown", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:/Users/test/proyectos")
    expect(explorer.state().picked).toBeUndefined()
    explorer.pick("C:/Users/test")
    expect(explorer.state().picked).toBe("C:/Users/test")
    explorer.pick(undefined)
    expect(explorer.state().picked).toBeUndefined()
    // The path shown: the row selected, else the session's folder; on another disk, that disk.
    expect(crumbPath(explorer.state())).toBe("C:/Users/test/proyectos")
    expect(crumbPath({ ...explorer.state(), picked: "C:/Windows" })).toBe("C:/Windows")
    expect(crumbPath({ ...explorer.state(), drive: "D:/", picked: "C:/Windows" })).toBe("D:/")
    // A path: gone to, marked, the path shown, and the field emptied though no filter was on.
    fake.existing.add("C:\\Users\\test\\proyectos\\notas.txt")
    const cleared = explorer.state().cleared ?? 0
    await explorer.submit(" C:\\Users\\test\\proyectos\\notas.txt ")
    expect(explorer.state().picked).toBe("C:/Users/test/proyectos/notas.txt")
    expect(explorer.state().found).toBeDefined()
    expect(explorer.state().cleared).toBe(cleared + 1)
    expect(explorer.state().filter).toBeUndefined()
    // A pattern: the disk shown is searched.
    await explorer.submit("*.txt")
    expect(explorer.state().filter?.pattern).toBe("*.txt")
    expect(fake.searches.at(-1)?.ask.pattern).toBe("*.txt")
  })
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
    expect([toolTip("paste", true), toolTip("paste", true, false, "dir"), toolTip("paste", true, false, "file")]).toEqual(["Pegar", "Pegar carpeta", "Pegar archivo"])
    expect([toolTip("trash", true, true), toolTip("mkdir", true, true)]).toEqual(["no se hace con un disco", "Crear carpeta"])
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

describe("a row's menu and the double click", () => {
  test("a row's menu stands under its row, or over it where the room under is short, from the cell it was asked at, within the tree", () => {
    // Row 3 of a room of 20, asked at cell 10: under the row.
    expect(menuPlace({ at: 3, x: 10, height: 9, width: 34, room: 20, treeWidth: 46 })).toEqual({ top: 4, left: 10 })
    // No rows left under it: over it.
    expect(menuPlace({ at: 15, x: 10, height: 9, width: 34, room: 20, treeWidth: 46 })).toEqual({ top: 6, left: 10 })
    // Neither under nor over: at the room's end, or its top.
    expect(menuPlace({ at: 5, x: 0, height: 9, width: 34, room: 12, treeWidth: 46 })).toEqual({ top: 3, left: 0 })
    expect(menuPlace({ at: 1, x: 0, height: 9, width: 34, room: 4, treeWidth: 46 })).toEqual({ top: 0, left: 0 })
    // Asked at ⋯, at the tree's right edge: it ends there.
    expect(menuPlace({ at: 3, x: 46, height: 6, width: 25, room: 20, treeWidth: 46 })).toEqual({ top: 4, left: 21 })
  })

  test("a row opens on a double click: two clicks on it within half a second; one, or two apart, only select it", () => {
    const click = createDoubleClick()
    expect(click("copy:C:/a", 0)).toBe(false)
    expect(click("copy:C:/a", 300)).toBe(true)
    // A double click starts over: a third click is a first one.
    expect(click("copy:C:/a", 350)).toBe(false)
    expect(click("copy:C:/a", 1000)).toBe(false)
    // Another row in between is a first click of its own.
    expect(click("path:C:/a", 1100)).toBe(false)
    expect(click("copy:C:/a", 1200)).toBe(false)
    expect(click("copy:C:/a", 1300)).toBe(true)
  })
})

describe("the explorer holds still while a popup of its own is up", () => {
  const FILE = "C:/Users/test/proyectos/notas.txt"
  const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  test("a dialog holds it until it is answered", async () => {
    const fake = fakeIO()
    let answer: (said: string) => void = () => {}
    const explorer = createExplorer({ ...fake.io, ask: () => new Promise<string>((resolve) => (answer = resolve)) }, "win32")
    await explorer.open("C:/Users/test/proyectos")
    expect(isHeld(explorer.state())).toBe(false)
    const renaming = explorer.rename(FILE)
    await turn()
    expect(isHeld(explorer.state())).toBe(true)
    answer("cancel")
    await renaming
    expect(isHeld(explorer.state())).toBe(false)
    // A dialog that fails lets go as well.
    const failing = createExplorer({ ...fake.io, ask: () => Promise.reject(new Error("no dialog")) }, "win32")
    await failing.open("C:/Users/test/proyectos")
    await failing.trash(FILE).catch(() => undefined)
    expect(isHeld(failing.state())).toBe(false)
  })

  test("the viewer holds it from the press until its popup is closed, where it says when; elsewhere it holds nothing", async () => {
    const fake = fakeIO()
    let close: () => void = () => {}
    const explorer = createExplorer({ ...fake.io, view: () => new Promise<void>((resolve) => (close = resolve)) }, "win32")
    await explorer.open("C:/Users/test/proyectos")
    explorer.pressFile(FILE)
    expect(isHeld(explorer.state())).toBe(true)
    close()
    await turn()
    expect(isHeld(explorer.state())).toBe(false)
    const plain = createExplorer(fake.io, "win32")
    await plain.open("C:/Users/test/proyectos")
    plain.pressFile(FILE)
    expect(isHeld(plain.state())).toBe(false)
  })
})

describe("📋 and 📥, one right after the other", () => {
  test("a folder 📋 took is let go of by any other tool, or by the footer, and 📥 is grey again", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:/Users/test/proyectos")
    const FOLDER = "C:/Users/test/proyectos/facturas"
    const taken = async () => {
      await explorer.copyFile(FOLDER)
      expect(explorer.state().clipKind).toBe("dir")
    }
    await taken()
    await explorer.copyPath("C:/Users/test/proyectos/notas.txt")
    expect(explorer.state().clip).toBeUndefined()
    for (const other of [() => explorer.rename("C:/Users/test/proyectos/notas.txt"), () => explorer.trash("C:/Users/test/proyectos/notas.txt"), () => explorer.newFolder("C:/Windows"), async () => explorer.collapse(), async () => explorer.dropClip()]) {
      await taken()
      await other()
      expect([explorer.state().clip, explorer.state().clipKind]).toEqual([undefined, undefined])
    }
    // 📥 right after it pastes, then says what to do once it was let go of.
    await taken()
    await explorer.copyPath("C:/Users/test/proyectos/notas.txt")
    await explorer.paste("C:/Windows")
    expect(fake.toasts.at(-1)).toBe("primero copiá un archivo o una carpeta con 📋.")
  })
})

describe("📥 while a filter is on", () => {
  const NOTAS_NATIVE = ["C:", "Users", "test", "proyectos", "notas.txt"].join(String.fromCharCode(92))
  test("what is pasted shows in the filter's tree when its name matches the pattern; what does not match does not", async () => {
    const fake = fakeIO()
    const explorer = createExplorer(fake.io, "win32")
    await explorer.open("C:/Users/test/proyectos")
    explorer.filter("*.txt")
    fake.searches[0]!.say({ paths: ["C:/Users/test/proyectos/notas.txt"], seen: 10, done: true, cut: false })
    await explorer.copyFile("C:/Users/test/proyectos/notas.txt")
    fake.existing.add(NOTAS_NATIVE)
    fake.dialog.answer = "copy"
    await explorer.paste("C:/Windows")
    expect(explorer.state().filter?.paths).toEqual(["C:/Users/test/proyectos/notas.txt", "C:/Windows/notas.txt"])
    // One that does not match the pattern stays out of it.
    await explorer.copyFile("C:/Users/test/proyectos/app.exe")
    fake.existing.add(NOTAS_NATIVE.replace("notas.txt", "app.exe"))
    await explorer.paste("C:/Windows")
    expect(explorer.state().filter?.paths).toEqual(["C:/Users/test/proyectos/notas.txt", "C:/Windows/notas.txt"])
    expect([filterMatches("*.dll", "SyncFusion.XlsIO.Base (2).DLL"), filterMatches("sync", "SyncFusion.dll"), filterMatches("a?c.txt", "abc.txt"), filterMatches("*.pdf", "a.pdf.txt")]).toEqual([true, true, true, false])
  })
})

