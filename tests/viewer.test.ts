import { describe, expect, test } from "bun:test"

import { POWERSHELL } from "../src/powershell"
import {
  createViewerReader,
  mediaSaid,
  fileMention,
  fromBase64Utf8,
  popupPaste,
  promptInsertion,
  viewerCommand,
  type ViewerSaid,
} from "../src/viewer"

describe("viewerCommand", () => {
  test("Windows runs the engine's popup with the file in its environment, its path with backslashes, and the engine's Python", () => {
    expect(viewerCommand("win32", "view_file.ps1", "C:/Users/me/notas.txt", "C:\\plugin", "C:\\venv\\python.exe")).toEqual({
      argv: [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "C:/plugin/engine/view_file.ps1"],
      env: { SPEEDY_FILE: "C:\\Users\\me\\notas.txt", SPEEDY_IMAGE: "C:\\Users\\me\\notas.txt", SPEEDY_PYTHON: "C:\\venv\\python.exe" },
    })
    // A pasted image keeps its own popup, which reads the image from SPEEDY_IMAGE.
    const image = viewerCommand("win32", "view.ps1", "C:\\images\\a.png", "C:/plugin", "python")
    expect(image.argv.at(-1)).toBe("C:/plugin/engine/view.ps1")
    expect(image.env.SPEEDY_IMAGE).toBe("C:\\images\\a.png")
  })

  test("macOS shows the file in Quick Look, Linux in its default program", () => {
    expect(viewerCommand("darwin", "view_file.ps1", "/Users/me/a.md", "/plugin", "python3")).toEqual({ argv: ["qlmanage", "-p", "/Users/me/a.md"], env: {} })
    expect(viewerCommand("linux", "view.ps1", "/home/me/a.png", "/plugin", "python3")).toEqual({ argv: ["xdg-open", "/home/me/a.png"], env: {} })
  })
})

describe("what the viewer says reaches the prompt", () => {
  test("fromBase64Utf8: what the viewer copied, read back with its accents; nothing for what is not Base64", () => {
    expect(fromBase64Utf8("aG9sYSDDsQ==")).toBe("hola ñ")
    expect(fromBase64Utf8("TMOtbmVhIDEKTMOtbmVhIDI=")).toBe("Línea 1\nLínea 2")
    expect(fromBase64Utf8(Buffer.from("á é í ó ú ñ").toString("base64"))).toBe("á é í ó ú ñ")
    expect(fromBase64Utf8("")).toBe("")
    expect(fromBase64Utf8("no es base64!")).toBe("")
  })

  test("fileMention: a file as a prompt mentions it, quoted when it holds a space", () => {
    expect(fileMention("C:\\Users\\test\\notas.txt")).toBe("@C:\\Users\\test\\notas.txt")
    expect(fileMention("C:\\Mis Cosas\\notas.txt")).toBe('@"C:\\Mis Cosas\\notas.txt"')
  })

  test("popupPaste: what a popup copied goes between two line breaks, never doubled at its end", () => {
    expect(popupPaste("hola ñ")).toBe("\nhola ñ\n")
    expect(popupPaste("línea 1\nlínea 2\n\n")).toBe("\nlínea 1\nlínea 2\n")
  })

  test("promptInsertion: a space before the text unless what is before the cursor already ends apart, and one after", () => {
    expect(promptInsertion("mirá este", "@a.txt", " ")).toBe(" @a.txt ")
    expect(promptInsertion("mirá este ", "@a.txt", " ")).toBe("@a.txt ")
    expect(promptInsertion("línea\n", "@a.txt", " ")).toBe("@a.txt ")
    expect(promptInsertion("", "@a.txt", " ")).toBe("@a.txt ")
  })

  test("the viewer's lines, whatever chunks they come in: `copied` text and `attach` paths; the dots and `shown` say nothing", () => {
    const said: ViewerSaid[] = []
    const reader = createViewerReader((one) => said.push(one))
    reader.push("shown\r\n.\r\ncop")
    reader.push("ied aG9sYSDDsQ==\r\n.\r\n")
    reader.push(`attach ${Buffer.from("C:\\Temp\\dibujo.png").toString("base64")}\r\n`)
    reader.push(`attach ${Buffer.from("C:\\Mis Cosas\\a.png").toString("base64")}`)
    expect(said).toEqual([
      { kind: "paste", text: "\nhola ñ\n" },
      { kind: "mention", text: "@C:\\Temp\\dibujo.png" },
    ])
    reader.push("\n")
    expect(said.at(-1)).toEqual({ kind: "mention", text: '@"C:\\Mis Cosas\\a.png"' })
    // Copied text that is not Base64, or empty, puts nothing in the prompt.
    reader.push("copied !!!\ncopied \n")
    expect(said.length).toBe(3)
  })
})

test("mediaSaid: what a popup says of its sound, among its dots and its other lines", () => {
  expect(mediaSaid(".\r\n.\r\nmedia paused\r\n.\r\nmedia playing\r\ncopied aG9sYQ==\r\nmedia ended\r\n")).toEqual(["paused", "playing", "ended"])
  expect(mediaSaid(".\r\n.\r\n")).toEqual([])
  expect(mediaSaid("media playing now\r\n")).toEqual([])
})
