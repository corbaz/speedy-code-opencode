import { describe, expect, test } from "bun:test"

import { POWERSHELL } from "../src/powershell"
import { viewerCommand } from "../src/viewer"

describe("viewerCommand", () => {
  test("Windows runs the engine's popup with the file in its environment, its path with backslashes", () => {
    expect(viewerCommand("win32", "view_file.ps1", "C:/Users/me/notas.txt", "C:\\plugin")).toEqual({
      argv: [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "C:/plugin/engine/view_file.ps1"],
      env: { SPEEDY_FILE: "C:\\Users\\me\\notas.txt", SPEEDY_IMAGE: "C:\\Users\\me\\notas.txt" },
    })
    // A pasted image keeps its own popup, which reads the image from SPEEDY_IMAGE.
    const image = viewerCommand("win32", "view.ps1", "C:\\images\\a.png", "C:/plugin")
    expect(image.argv.at(-1)).toBe("C:/plugin/engine/view.ps1")
    expect(image.env.SPEEDY_IMAGE).toBe("C:\\images\\a.png")
  })

  test("macOS shows the file in Quick Look, Linux in its default program", () => {
    expect(viewerCommand("darwin", "view_file.ps1", "/Users/me/a.md", "/plugin")).toEqual({ argv: ["qlmanage", "-p", "/Users/me/a.md"], env: {} })
    expect(viewerCommand("linux", "view.ps1", "/home/me/a.png", "/plugin")).toEqual({ argv: ["xdg-open", "/home/me/a.png"], env: {} })
  })
})
