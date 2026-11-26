import { describe, expect, test } from "bun:test"
import { chainOf, createExplorer, driveLabel, pastedPath, remoteOf, thereOf, treeRows, type ExplorerIO, type FsEntry } from "../src/explorer"
import { remoteAnswer, remoteCommand, withRemotes, type RemoteRunner } from "../src/remote"

/** The other machine's folders, by their paths there. */
const FAR: Record<string, FsEntry[]> = {
  "/": [
    { name: "Users", kind: "dir", isLink: false },
    { name: "nota.md", kind: "file", isLink: false },
  ],
  "/Users": [{ name: "ana", kind: "dir", isLink: false }],
}

/** This machine's IO, with one disk, and the other machine as remote.py would answer for it; `home` is where its disk opens. */
function world(hosts: string[] = ["mac"], home = "/") {
  const viewed: string[] = []
  const copied: string[] = []
  const texts: string[] = []
  const inserted: string[] = []
  const toasts: string[] = []
  const dialogs: string[] = []
  const pasted: string[] = []
  // What went across by remote.py, the tokens its searches were started with, and what it says of a paste.
  const ran: string[] = []
  const tokens: string[] = []
  const across = { says: "done" }
  const answer = { says: "cancel" }
  const asked: string[] = []
  const searches: Array<{ host: string; pattern: string; most: number; say: (line: object) => void; isStopped: boolean }> = []
  const own: ExplorerIO = {
    list: async (path) => {
      if (path !== "C:/") throw new Error("EPERM")
      return [{ name: "notas.txt", kind: "file", isLink: false }]
    },
    // A folder of this machine, to take with 📋 and paste there with 📥.
    isDir: async (path) => path === "C:/" || path === "C:/fotos",
    openFolder: () => {},
    view: (path) => void viewed.push(path),
    copyFile: async (native) => (copied.push(native), true),
    copyText: async (text) => (texts.push(text), true),
    insert: async (text) => void inserted.push(text),
    ask: async (mode) => (dialogs.push(mode), answer.says),
    paste: async (verb, native, target) => (pasted.push(`${verb} ${native} -> ${target}`), true),
    rename: async () => false,
    mkdir: async () => false,
    trash: async () => false,
    exists: async (native) => native === "C:\\notas.txt" || native === "C:\\fotos",
    toast: (message) => void toasts.push(message),
    wait: async () => {},
    find: () => () => {},
  }
  const runner: RemoteRunner = {
    ask: async (mode, host, path) => {
      asked.push(`${mode} ${host} ${path}`.trim())
      if (mode === "hosts") return hosts
      if (mode === "home") return { home }
      if (mode === "list") return FAR[path] ? { entries: FAR[path] } : { error: "not reached" }
      if (mode === "stat") return { kind: FAR[path] ? "dir" : path === "/nota.md" ? "file" : "" }
      return path === "/nota.md" ? { file: "C:/Temp/speedy-remote/ab12/nota.md" } : { error: "not fetched" }
    },
    run: async (mode, env) => {
      ran.push(`${mode} ${Object.entries(env).map(([name, value]) => `${name.replace("SPEEDY_", "")}=${value}`).join(" ")}`)
      return mode === "pause" ? { held: env.SPEEDY_PAUSED === "1" } : { said: across.says }
    },
    find: (host, pattern, most, token, onLine) => {
      tokens.push(token)
      const search = { host, pattern, most, say: (line: object) => onLine(JSON.stringify(line)), isStopped: false }
      searches.push(search)
      return () => void (search.isStopped = true)
    },
  }
  const explorer = createExplorer(withRemotes(own, runner, "win32"), "win32")
  const rows = () => treeRows(explorer.state()).map((row) => `${"  ".repeat(row.depth)}${row.name}`)
  return { explorer, rows, viewed, copied, texts, inserted, toasts, dialogs, asked, searches, pasted, answer, ran, tokens, across }
}

/** Lets what a press started (a file fetched, then shown) end. */
const settle = () => new Promise((done) => setTimeout(done, 0))

describe("another machine's disk, reached by ssh", () => {
  test("a path of it is the machine and its own path; a disk of Windows is not one", () => {
    expect(remoteOf("mac:/Users/ana")).toEqual({ host: "mac", path: "/Users/ana" })
    expect(remoteOf("mac:\\Users\\ana")).toEqual({ host: "mac", path: "/Users/ana" })
    expect([remoteOf("C:/Users"), remoteOf("/Users/ana"), remoteOf("notas.txt")]).toEqual([undefined, undefined, undefined])
    expect(driveLabel("mac:/")).toBe("mac")
    // A machine with Windows has its disks under its root; a path of it is copied as Windows writes it.
    expect(remoteOf("windows:/C:/Users/ana")).toEqual({ host: "windows", path: "/C:/Users/ana" })
    expect([thereOf("/Users/ana"), thereOf("/C:/Users/ana"), thereOf("/C:")]).toEqual(["/Users/ana", "C:\\Users\\ana", "C:\\"])
    expect(chainOf("mac:/Users/ana", "mac:/")).toEqual(["mac:/", "mac:/Users", "mac:/Users/ana"])
    expect([pastedPath("mac:"), pastedPath("mac:/"), pastedPath("mac:/Users/ana/")]).toEqual(["mac:/", "mac:/", "mac:/Users/ana"])
  })

  test("remote.py is run by its mode, and its last line is its answer", () => {
    expect(remoteCommand("list", "C:\\plugin\\", "py", { SPEEDY_HOST: "mac", SPEEDY_PATH: "/Users" })).toEqual({
      argv: ["py", "C:\\plugin/engine/remote.py", "list"],
      env: { SPEEDY_HOST: "mac", SPEEDY_PATH: "/Users" },
    })
    expect(remoteAnswer('warning\n{"kind": "dir"}\n')).toEqual({ kind: "dir" })
    expect([remoteAnswer(""), remoteAnswer("no json")]).toEqual([undefined, undefined])
  })

  test("📁 makes a folder there by remote.py (`mkdir`): the dialog shows the folder as the explorer writes it; a name taken is said", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.pickDrive("mac:/")
    w.answer.says = "mkdir Rm90b3M="
    w.across.says = "made"
    await w.explorer.newFolder("mac:/Users")
    expect(w.dialogs.at(-1)).toBe("mkdir")
    expect(w.ran.at(-1)).toBe("mkdir HOST=mac PATH=/Users/Fotos")
    expect(w.toasts.at(-1)).toBe("se creó la carpeta Fotos en Users.")
    // On a file's row, in the folder it is in.
    await w.explorer.newFolder("mac:/nota.md")
    expect(w.ran.at(-1)).toBe("mkdir HOST=mac PATH=/Fotos")
    // A name there already is not made again; what remote.py could not make is said.
    const made = w.ran.length
    w.answer.says = "mkdir bm90YS5tZA=="
    await w.explorer.newFolder("mac:/")
    expect(w.ran.length).toBe(made)
    expect(w.toasts.at(-1)).toBe("ya hay un nota.md en esa carpeta.")
    w.answer.says = "mkdir Rm90b3M="
    w.across.says = "error"
    await w.explorer.newFolder("mac:/Users")
    expect(w.toasts.at(-1)).toBe("no pude crear la carpeta Fotos.")
  })

  test("its disk stands after this machine's, and its folders are read there", async () => {
    const w = world()
    await w.explorer.open("C:/")
    expect(w.explorer.state().drives).toEqual(["C:/", "mac:/"])
    await w.explorer.pickDrive("mac:/")
    expect(w.rows()).toEqual(["mac:/", "  Users", "  nota.md"])
    await w.explorer.toggleFolder("mac:/Users")
    expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "  nota.md"])
    expect(w.asked.slice(-2)).toEqual(["list mac /", "list mac /Users"])
    // A folder that does not answer says so, as one of this machine's.
    await w.explorer.toggleFolder("mac:/Users/ana")
    expect(w.rows()).toContain("      (sin acceso)")
  })

  test("a machine's disk opens at its person's folder, marked and in the middle; one with Windows at its root; 📥 is not for its folders", async () => {
    FAR["/Users/ana"] = [{ name: "apuntes.txt", kind: "file", isLink: false }]
    try {
      const w = world(["mac"], "/Users/ana")
      await w.explorer.open("C:/")
      await w.explorer.pickDrive("mac:/")
      expect(w.asked).toContain("home mac /")
      expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "      apuntes.txt", "  nota.md"])
      expect([w.explorer.state().found, w.explorer.state().top]).toEqual(["mac:/users/ana", -1])
      // Where it opens is asked once.
      await w.explorer.pickDrive("C:/")
      await w.explorer.pickDrive("mac:/")
      expect(w.asked.filter((one) => one.startsWith("home "))).toEqual(["home mac /"])
      // One with Windows says `/`: its root, where its disks are, with nothing marked.
      const windows = world(["windows"], "/")
      await windows.explorer.open("C:/")
      await windows.explorer.pickDrive("windows:/")
      expect(windows.rows()).toEqual(["windows:/", "  Users", "  nota.md"])
      expect(windows.explorer.state().found).toBeUndefined()
      // 📥 goes across machines, copied or moved as the dialog said. From here to the machine (`push`): a file,
      // and a folder.
      await w.explorer.copyFile("C:/notas.txt")
      w.answer.says = "copy"
      await w.explorer.paste("mac:/Users")
      expect(w.ran.at(-1)).toBe("push HOST=mac FILE=C:\\notas.txt PATH=/Users/notas.txt VERB=copy")
      w.ran.length = 0
      w.dialogs.length = 0
      await w.explorer.copyFile("C:/fotos")
      w.answer.says = "move"
      await w.explorer.paste("mac:/Users")
      expect(w.dialogs).toEqual(["paste"])
      expect(w.ran).toEqual(["push HOST=mac FILE=C:\\fotos PATH=/Users/fotos VERB=move"])
      expect(w.toasts.slice(-2)).toEqual(["moviendo fotos…", "fotos se movió a Users."])
      expect(w.explorer.state().clip).toBeUndefined()
      // From the machine here (`pull`): a folder, which 📋 takes without the clipboard.
      await w.explorer.copyFile("mac:/Users")
      expect([w.explorer.state().clip, w.toasts.at(-1)]).toEqual(["mac:/Users", "la carpeta Users de mac está lista para pegar con 📥."])
      w.answer.says = "copy"
      await w.explorer.paste("C:/")
      expect(w.ran.at(-1)).toBe("pull HOST=mac PATH=/Users TARGET=C:\\Users VERB=copy")
      expect(w.pasted).toEqual([])
      expect(w.toasts.at(-1)).toBe("Users se copió a C:.")
      // Within the machine (`paste`), but not into itself.
      await w.explorer.paste("mac:/Users/ana")
      expect(w.toasts.at(-1)).toBe("Users no puede ir dentro de sí misma.")
      await w.explorer.copyFile("mac:/Users/ana")
      await w.explorer.paste("mac:/")
      expect(w.ran.at(-1)).toBe("paste HOST=mac PATH=/Users/ana TARGET=/ana VERB=copy")
      // Copied, but not removed where it was: it says so, and the folder stays taken. What failed says so too.
      w.answer.says = "move"
      w.across.says = "kept"
      await w.explorer.paste("C:/")
      expect(w.toasts.at(-1)).toBe("ana se copió a C:, pero no pude quitarlo de donde estaba.")
      expect(w.explorer.state().clip).toBe("mac:/Users/ana")
      w.across.says = "error"
      await w.explorer.paste("C:/")
      expect(w.toasts.at(-1)).toBe("no pude mover ana.")
      // Not from one machine to another one.
      await w.explorer.paste("otra:/tmp")
      expect(w.toasts.at(-1)).toBe("de mac a otra no se pega: traelo primero a esta máquina.")
    } finally {
      delete FAR["/Users/ana"]
    }
  })

  test("with no machine named there is no such disk, and one not reached says so", async () => {
    const none = world([])
    await none.explorer.open("C:/")
    expect(none.explorer.state().drives).toEqual(["C:/"])
    const w = world(["otra"])
    await w.explorer.open("C:/")
    delete FAR["/"]
    try {
      await w.explorer.pickDrive("otra:/")
      expect(w.rows()).toEqual(["otra:/", "  (sin conexión por ssh)"])
    } finally {
      FAR["/"] = [
        { name: "Users", kind: "dir", isLink: false },
        { name: "nota.md", kind: "file", isLink: false },
      ]
    }
  })

  test("a file of it is fetched, then shown or copied; its path is copied as that machine writes it", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.pickDrive("mac:/")
    w.explorer.pressFile("mac:/nota.md")
    await settle()
    expect(w.asked.at(-1)).toBe("fetch mac /nota.md")
    expect(w.viewed).toEqual(["C:\\Temp\\speedy-remote\\ab12\\nota.md"])
    expect(w.toasts).toContain("trayendo nota.md de mac…")
    await w.explorer.copyPath("mac:/nota.md")
    expect([w.texts.at(-1), w.inserted.at(-1)]).toEqual(["/nota.md", "/nota.md"])
    await w.explorer.copyFile("mac:/nota.md")
    expect(w.copied).toEqual(["C:\\Temp\\speedy-remote\\ab12\\nota.md"])
    expect(w.inserted.at(-1)).toBe("mac:/nota.md")
    // One that cannot be fetched is not shown, and a toast says so.
    w.explorer.pressFile("mac:/Users/roto.bin")
    await settle()
    expect(w.viewed.length).toBe(1)
    expect(w.toasts.at(-1)).toBe("no pude traer roto.bin de mac.")
    // A file of this machine goes to the viewer as before.
    w.explorer.pressFile("C:/notas.txt")
    expect(w.viewed.at(-1)).toBe("C:/notas.txt")
  })

  test("✏ renames its files there and 🗑 sends them to its Recycle Bin or Trash, by remote.py, once the dialog asked", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.pickDrive("mac:/")
    w.answer.says = `rename ${btoa("notas viejas.md")}`
    w.across.says = "renamed"
    await w.explorer.rename("mac:/nota.md")
    expect(w.dialogs.at(-1)).toBe("rename")
    expect(w.ran.at(-1)).toBe("rename HOST=mac PATH=/nota.md NAME=notas viejas.md")
    expect(w.toasts.at(-1)).toBe("nota.md ahora se llama notas viejas.md.")
    // A name already there is refused, and nothing is asked of the machine.
    const ran = w.ran.length
    w.answer.says = `rename ${btoa("Users")}`
    await w.explorer.rename("mac:/nota.md")
    expect(w.ran.length).toBe(ran)
    expect(w.toasts.at(-1)).toBe("ya hay un archivo Users en esa carpeta.")
    w.answer.says = "delete"
    w.across.says = "trashed"
    await w.explorer.trash("mac:/nota.md")
    expect(w.ran.at(-1)).toBe("trash HOST=mac PATH=/nota.md")
    expect(w.toasts.at(-1)).toBe("nota.md fue a la papelera.")
    w.across.says = "error"
    await w.explorer.trash("mac:/nota.md")
    expect(w.toasts.at(-1)).toBe("no pude mandar nota.md a la papelera.")
  })

  test("a path of it pasted in the field opens the tree down to it, and the filter searches that machine", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.goTo("mac:/Users")
    expect(w.asked).toContain("stat mac /Users")
    expect(w.explorer.state().drive).toBe("mac:/")
    expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "  nota.md"])
    w.explorer.filter("*.pdf")
    expect(w.searches.map(({ host, pattern, most }) => ({ host, pattern, most }))).toEqual([{ host: "mac", pattern: "*.pdf", most: 50000 }])
    w.searches[0]?.say({ paths: ["mac:/Users/ana/informe.pdf"], seen: 12, done: true, cut: false })
    expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "      informe.pdf"])
    // A search there is held by its token, through remote.py.
    w.explorer.filter("*.txt")
    w.explorer.pauseFilter()
    w.explorer.pauseFilter()
    expect(w.ran).toEqual([`pause HOST=mac TOKEN=${w.tokens[1]} PAUSED=1`, `pause HOST=mac TOKEN=${w.tokens[1]} PAUSED=0`])
    expect(w.tokens[1]).toMatch(/^[A-Za-z0-9-]+$/)
    w.explorer.clearFilter()
    expect(w.searches[1]?.isStopped).toBe(true)
  })
})
