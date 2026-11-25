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
      "import sys; sys.path.insert(0, sys.argv[1]); import popup; print(popup.terminal_app() is None, popup.belongs_in_front(12345))",
      engine,
    ])
    expect(said.stdout.toString().trim()).toBe("True True")
  })
})
