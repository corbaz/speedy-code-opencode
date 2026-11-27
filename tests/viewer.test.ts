import { describe, expect, test } from "bun:test"

import { POWERSHELL } from "../src/powershell"
import {
  createViewerReader,
  mediaSaid,
  fileMention,
  fromBase64Utf8,
  isInDraft,
  popupPaste,
  promptInsertion,
  popupCheckCommand,
  popupKind,
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
    // With the narrator's voice, a narration's Resumen can read its points aloud there, at its speed.
    const narrator = { voice: "es-AR-ElenaNeural", speed: 1.3 }
    expect(viewerCommand("win32", "view_file.ps1", "C:/a.mp3", "C:/plugin", "python", narrator).env).toMatchObject({ SPEEDY_VOICE: "es-AR-ElenaNeural", SPEEDY_SPEED: "1.3" })
    expect(viewerCommand("darwin", "view_file.ps1", "/a.mp3", "/plugin", "python", narrator).env).toMatchObject({ SPEEDY_VOICE: "es-AR-ElenaNeural", SPEEDY_SPEED: "1.3" })
  })

  test("macOS shows a file in the engine's popups, and in Quick Look where they do not come up", () => {
    const image = viewerCommand("darwin", "view.ps1", "/Users/me/captura año.png", "/plugin", "/venv/bin/python")
    expect(image.argv.slice(0, 2)).toEqual(["/bin/sh", "-c"])
    expect(image.argv[2]).toContain('"$SPEEDY_PYTHON" "$SPEEDY_POPUP" & viewer=$!')
    expect(image.argv[2]).toContain("wait $viewer && exit 0")
    expect(image.argv[2]?.indexOf("SPEEDY_POPUP")).toBeLessThan(image.argv[2]?.indexOf("qlmanage") ?? -1)
    expect(image.env).toEqual({ SPEEDY_FILE: "/Users/me/captura año.png", SPEEDY_IMAGE: "/Users/me/captura año.png", SPEEDY_PYTHON: "/venv/bin/python", SPEEDY_POPUP: "/plugin/engine/view.py" })
    const file = viewerCommand("darwin", "view_file.ps1", "/Users/me/a.md", "/plugin", "/venv/bin/python")
    expect(file.argv).toEqual(image.argv)
    expect(file.env.SPEEDY_POPUP).toBe("/plugin/engine/view_file.py")
    expect(popupCheckCommand("/venv/bin/python").slice(0, 2)).toEqual(["/venv/bin/python", "-c"])
  })

  test("Linux shows the file in its default program", () => {
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

describe("isInDraft", () => {
  test("the explorer's 📋 and 🔗 write a mention or a path once: one there already, as a word of its own, is not written again", () => {
    expect(isInDraft("mirá @C:/x.md y", "@C:/x.md")).toBe(true)
    expect(isInDraft("C:/x.md", "C:/x.md")).toBe(true)
    // A path inside its mention is not the path; a longer name is not the name.
    expect(isInDraft("mirá @C:/x.md", "C:/x.md")).toBe(false)
    expect(isInDraft("C:/x.mdy", "C:/x.md")).toBe(false)
    expect(isInDraft('a @"C:/a b.md" ', '@"C:/a b.md"')).toBe(true)
    expect(isInDraft("", "C:/x.md")).toBe(false)
  })
})

describe("the kind of popup a file opens in", () => {
  test("a narration, a sound and a video sound; anything else shows: one popup of each kind at a time", () => {
    expect([popupKind("C:/a/tema.MP3"), popupKind("C:\\a\\clip.mkv"), popupKind("/Users/ana/notas.json"), popupKind("C:/a/foto.png"), popupKind("C:/a/sin_extension")]).toEqual(["sound", "sound", "page", "page", "page"])
    expect(popupKind("C:/a/resumen.txt", "C:/control.txt")).toBe("sound")
  })
})
