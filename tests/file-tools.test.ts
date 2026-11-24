import { describe, expect, test } from "bun:test"

import { dialogAnswer, dialogCommand, fileCopyCommand, newNameOf, pasteCommand, renameCommand, trashCommand } from "../src/file-tools"
import { POWERSHELL } from "../src/powershell"

const NATIVE = "C:\\Users\\me\\notas.txt"

describe("the commands behind each file's tools", () => {
  test("📋: Windows PowerShell, by its path and single-threaded, puts the file on the clipboard as a file; macOS by AppleScript", () => {
    const windows = fileCopyCommand("win32", NATIVE)!
    expect(windows.argv.slice(0, 5)).toEqual([POWERSHELL, "-NoProfile", "-NonInteractive", "-STA", "-Command"])
    expect(windows.argv.at(-1)).toContain("[System.Windows.Forms.Clipboard]::SetFileDropList($files)")
    expect(windows.argv.at(-1)).toContain("$env:SPEEDY_FILE")
    expect(windows.env).toEqual({ SPEEDY_FILE: NATIVE })
    const mac = fileCopyCommand("darwin", "/Users/me/a b.txt")!
    expect(mac.argv[0]).toBe("osascript")
    expect(mac.argv).toContain("set the clipboard to (POSIX file (item 1 of argv))")
    expect(mac.argv.at(-1)).toBe("/Users/me/a b.txt")
    expect(fileCopyCommand("linux", "/home/me/a.txt")).toBeUndefined()
  })

  test("✏ and 🗑 ask in the engine's dialog.ps1, its mode and file in the environment; macOS in an AppleScript dialog", () => {
    expect(dialogCommand("win32", "rename", NATIVE, "C:\\plugin")).toEqual({
      argv: [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "C:/plugin/engine/dialog.ps1"],
      env: { SPEEDY_FILE: NATIVE, SPEEDY_MODE: "rename", SPEEDY_KIND: "file" },
    })
    expect(dialogCommand("win32", "delete", NATIVE, "C:/plugin")?.env.SPEEDY_MODE).toBe("delete")
    // A folder: the dialog asks one name, and says the folder goes with what it holds.
    expect(dialogCommand("win32", "rename", NATIVE, "C:/plugin", "dir")?.env.SPEEDY_KIND).toBe("dir")
    expect(dialogCommand("win32", "rename", NATIVE, "C:/plugin")?.env.SPEEDY_KIND).toBe("file")
    // macOS: the engine's popup first; the AppleScript dialog after it, for when the popup says nothing.
    const rename = dialogCommand("darwin", "rename", "/Users/me/a.md", "/plugin", "dir", "/venv/bin/python")!
    expect(rename.argv.slice(0, 2)).toEqual(["/bin/sh", "-c"])
    expect(rename.argv[2]).toContain('answer=$("$SPEEDY_PYTHON" "$SPEEDY_POPUP" 2>/dev/null)')
    expect(rename.argv[2]).toContain('exec "$@"')
    expect(rename.env).toEqual({ SPEEDY_FILE: "/Users/me/a.md", SPEEDY_MODE: "rename", SPEEDY_KIND: "dir", SPEEDY_PYTHON: "/venv/bin/python", SPEEDY_POPUP: "/plugin/engine/dialog.py" })
    expect(rename.argv[4]).toBe("osascript")
    expect(rename.argv.join(" ")).toContain('return "name " & answer')
    expect(rename.argv.at(-1)).toBe("a.md")
    const remove = dialogCommand("darwin", "delete", "/Users/me/a.md", "/plugin")!
    expect(remove.env.SPEEDY_MODE).toBe("delete")
    expect(remove.argv.join(" ")).toContain('return "delete"')
    expect(dialogCommand("linux", "delete", "/a", "/plugin")).toBeUndefined()
  })

  test("📥 asks in the same dialog, the folder it goes into in the environment; paste.py then copies or moves", () => {
    expect(dialogCommand("win32", "paste", NATIVE, "C:/plugin", "file", "", "D:\\destino")?.env).toEqual({ SPEEDY_FILE: NATIVE, SPEEDY_MODE: "paste", SPEEDY_KIND: "file", SPEEDY_TARGET: "D:\\destino" })
    // The other dialogs name no folder.
    expect(Object.keys(dialogCommand("win32", "delete", NATIVE, "C:/plugin")!.env)).not.toContain("SPEEDY_TARGET")
    // macOS: the popup first; the AppleScript dialog after it asks which, then whether for sure.
    const mac = dialogCommand("darwin", "paste", "/Users/me/a.md", "/plugin", "file", "/venv/bin/python", "/Users/me/docs")!
    expect(mac.env).toMatchObject({ SPEEDY_MODE: "paste", SPEEDY_TARGET: "/Users/me/docs", SPEEDY_POPUP: "/plugin/engine/dialog.py" })
    expect(mac.argv.slice(-2)).toEqual(["a.md", "/Users/me/docs"])
    expect(mac.argv.join(" ")).toContain('buttons {"Cancelar", "Mover", "Copiar"}')
    expect(mac.argv.join(" ")).toContain('return "move"')
    // A file of another machine is copied, never moved: the dialog is told, and only asks whether for sure.
    expect(dialogCommand("win32", "paste", NATIVE, "C:/plugin", "file", "", "D:\\destino", true)?.env.SPEEDY_ONLY).toBe("copy")
    const only = dialogCommand("darwin", "paste", "/tmp/a.md", "/plugin", "file", "py", "/Users/me/docs", true)!
    expect(only.env.SPEEDY_ONLY).toBe("copy")
    expect(only.argv.join(" ")).not.toContain("Mover")
    expect(pasteCommand("move", NATIVE, "D:\\destino\\notas.txt", "C:\\plugin\\", "py")).toEqual({
      argv: ["py", "C:\\plugin/engine/paste.py"],
      env: { SPEEDY_FILE: NATIVE, SPEEDY_TARGET: "D:\\destino\\notas.txt", SPEEDY_VERB: "move", PYTHONIOENCODING: "utf-8" },
    })
  })

  test("the dialog's answer: its first line; a new name from `rename <base64>` or `name <text>`; nothing for cancel", () => {
    expect(dialogAnswer("\r\nrename YXB1bnRlcy50eHQ=\r\n")).toBe("rename YXB1bnRlcy50eHQ=")
    expect(dialogAnswer("")).toBe("cancel")
    expect(newNameOf("rename YXB1bnRlcy50eHQ=")).toBe("apuntes.txt")
    expect(newNameOf(`rename ${Buffer.from("año 2026.md").toString("base64")}`)).toBe("año 2026.md")
    expect(newNameOf("name b.md")).toBe("b.md")
    expect(newNameOf("cancel")).toBe("")
  })

  test("a rename by Rename-Item on Windows, the names by the environment; mv -n elsewhere, which never overwrites", () => {
    const windows = renameCommand("win32", NATIVE, "apuntes.txt", "C:\\Users\\me\\apuntes.txt")
    expect(windows.argv.slice(0, 4)).toEqual([POWERSHELL, "-NoProfile", "-NonInteractive", "-Command"])
    expect(windows.argv.at(-1)).toContain("Rename-Item -LiteralPath $env:SPEEDY_FILE -NewName $env:SPEEDY_NAME")
    expect(windows.env).toEqual({ SPEEDY_FILE: NATIVE, SPEEDY_NAME: "apuntes.txt", SPEEDY_TARGET: "C:\\Users\\me\\apuntes.txt" })
    const mac = renameCommand("darwin", "/Users/me/a.md", "b.md", "/Users/me/b.md")
    expect(mac.argv).toEqual(["/bin/sh", "-c", 'mv -n -- "$SPEEDY_FILE" "$SPEEDY_TARGET" && echo renamed'])
    expect(mac.env.SPEEDY_TARGET).toBe("/Users/me/b.md")
  })

  test("🗑 to the Recycle Bin on Windows, to the Trash by Finder on macOS, where they can be got back", () => {
    const windows = trashCommand("win32", NATIVE)!
    expect(windows.argv.at(-1)).toContain("[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:SPEEDY_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin')")
    // A folder goes to the Recycle Bin whole.
    expect(windows.argv.at(-1)).toContain("[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:SPEEDY_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin')")
    expect(windows.env).toEqual({ SPEEDY_FILE: NATIVE })
    const mac = trashCommand("darwin", "/Users/me/a.md")!
    expect(mac.argv).toContain('tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)')
    expect(mac.argv.at(-1)).toBe("/Users/me/a.md")
    expect(trashCommand("linux", "/home/me/a")).toBeUndefined()
  })
})
