import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const engine = join(import.meta.dir, "..", "engine")

describe("the popups belong to the terminal they were opened from", () => {
  test("each Windows popup takes the terminal's window as its owner, and opens on its screen", async () => {
    for (const script of ["view_file.ps1", "view.ps1", "dialog.ps1"]) {
      const text = await Bun.file(join(engine, script)).text()
      expect(text).toContain(". (Join-Path $PSScriptRoot 'owner.ps1')")
      expect(text).toContain("Set-PopupOwner $form")
      expect(text).toContain("$area = Get-PopupArea")
      expect(text).not.toContain("$form.TopMost = $true")
    }
    // owner.ps1 reads the window of the mod's console, and lets go of that console at once.
    const owner = await Bun.file(join(engine, "owner.ps1")).text()
    expect(owner).toContain("AttachConsole($id)")
    expect(owner).toContain("GetAncestor($console, 3)")
    expect(owner).toContain("SetWindowLongPtrW")
  })

  test("on macOS a popup with no terminal found (no AppKit here, over ssh, under tmux) shows whatever is in front, as before", () => {
    const said = Bun.spawnSync([
      python ?? "python",
      "-c",
      "import sys; sys.path.insert(0, sys.argv[1]); import popup; print(popup.terminal_app() is None, popup.belongs_in_front())",
      engine,
    ])
    expect(said.stdout.toString().trim()).toBe("True True")
  })

  test("on macOS the popups show while the window in front is their terminal's, from the screen's windows front to back", () => {
    // The window server's list, front to back: the menu bar and a popup float above the normal layer; a window
    // too small or clear to be seen is not the one in front.
    const TERMINAL = 100
    const OWN = 200
    const window = (pid: number, layer = 0, width = 800, alpha = 1) => ({ kCGWindowOwnerPID: pid, kCGWindowLayer: layer, kCGWindowAlpha: alpha, kCGWindowBounds: { X: 0, Y: 0, Width: width, Height: 600 } })
    const cases = {
      terminalInFront: [window(1, 24), window(OWN, 3), window(TERMINAL), window(300)],
      otherInFront: [window(OWN, 3), window(300), window(TERMINAL)],
      // Minimized, hidden or on another space: none of its windows is on the screen.
      terminalGone: [window(300)],
      tinyOrClearFirst: [window(400, 0, 10), window(500, 0, 800, 0), window(TERMINAL)],
      nothing: [],
    }
    const said = Bun.spawnSync([
      python ?? "python",
      "-c",
      "import json, sys; sys.path.insert(0, sys.argv[1]); import popup; cases = json.loads(sys.argv[2]); print(json.dumps({name: [popup.front_owner(windows), popup.popups_wanted(windows, 100, 200)] for name, windows in cases.items()}))",
      engine,
      JSON.stringify(cases),
    ])
    expect(JSON.parse(said.stdout.toString())).toEqual({
      terminalInFront: [TERMINAL, true],
      otherInFront: [300, false],
      terminalGone: [300, false],
      tinyOrClearFirst: [TERMINAL, true],
      nothing: [0, false],
    })
  })
})
