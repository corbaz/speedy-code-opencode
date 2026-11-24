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

/** This machine's IO, with one disk, and the other machine as remote.py would answer for it. */
function world(hosts: string[] = ["mac"]) {
  const viewed: string[] = []
  const copied: string[] = []
  const texts: string[] = []
  const inserted: string[] = []
  const toasts: string[] = []
  const dialogs: string[] = []
  const asked: string[] = []
  const searches: Array<{ host: string; pattern: string; most: number; say: (line: object) => void; isStopped: boolean }> = []
  const own: ExplorerIO = {
    list: async (path) => {
      if (path !== "C:/") throw new Error("EPERM")
      return [{ name: "notas.txt", kind: "file", isLink: false }]
    },
    isDir: async (path) => path === "C:/",
    openFolder: () => {},
    view: (path) => void viewed.push(path),
    copyFile: async (native) => (copied.push(native), true),
    copyText: async (text) => (texts.push(text), true),
    insert: async (text) => void inserted.push(text),
    ask: async (mode) => (dialogs.push(mode), "cancel"),
    rename: async () => false,
    trash: async () => false,
    exists: async () => false,
    toast: (message) => void toasts.push(message),
    wait: async () => {},
    find: () => () => {},
  }
  const runner: RemoteRunner = {
    ask: async (mode, host, path) => {
      asked.push(`${mode} ${host} ${path}`.trim())
      if (mode === "hosts") return hosts
      if (mode === "list") return FAR[path] ? { entries: FAR[path] } : { error: "not reached" }
      if (mode === "stat") return { kind: FAR[path] ? "dir" : path === "/nota.md" ? "file" : "" }
      return path === "/nota.md" ? { file: "C:/Temp/speedy-remote/ab12/nota.md" } : { error: "not fetched" }
    },
    find: (host, pattern, most, onLine) => {
      const search = { host, pattern, most, say: (line: object) => onLine(JSON.stringify(line)), isStopped: false }
      searches.push(search)
      return () => void (search.isStopped = true)
    },
  }
  const explorer = createExplorer(withRemotes(own, runner, "win32"), "win32")
  const rows = () => treeRows(explorer.state()).map((row) => `${"  ".repeat(row.depth)}${row.name}`)
  return { explorer, rows, viewed, copied, texts, inserted, toasts, dialogs, asked, searches }
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

  test("✏ and 🗑 are not for its files: no dialog asks", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.rename("mac:/nota.md")
    await w.explorer.trash("mac:/nota.md")
    expect(w.dialogs).toEqual([])
    expect(w.toasts.at(-1)).toBe("renombrar y borrar no están disponibles en mac: sus archivos se leen por ssh.")
  })

  test("a path of it pasted in the field opens the tree down to it, and the filter searches that machine", async () => {
    const w = world()
    await w.explorer.open("C:/")
    await w.explorer.goTo("mac:/Users")
    expect(w.asked).toContain("stat mac /Users")
    expect(w.explorer.state().drive).toBe("mac:/")
    expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "  nota.md"])
    w.explorer.filter("*.pdf")
    expect(w.searches.map(({ host, pattern, most }) => ({ host, pattern, most }))).toEqual([{ host: "mac", pattern: "*.pdf", most: 1000 }])
    w.searches[0]?.say({ paths: ["mac:/Users/ana/informe.pdf"], seen: 12, done: true, cut: false })
    expect(w.rows()).toEqual(["mac:/", "  Users", "    ana", "      informe.pdf"])
    w.explorer.clearFilter()
    expect(w.searches[0]?.isStopped).toBe(true)
  })
})
