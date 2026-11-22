import { describe, expect, test } from "bun:test"

const windowsInstaller = await Bun.file("setup/install.ps1").text()
const macInstaller = await Bun.file("setup/install.sh").text()
const listener = await Bun.file("engine/listen.py").text()

describe("cross-platform setup contract", () => {
  test("stores runtime data in the OpenCode configuration tree", () => {
    expect(windowsInstaller).toContain(".config\\opencode\\speedy-code")
    expect(macInstaller).toContain(".config/opencode/speedy-code")
    expect(windowsInstaller).not.toContain(".claude\\speedy-code")
    expect(macInstaller).not.toContain(".claude/speedy-code")
  })

  test("uses the portable engine without Claude preference hooks", () => {
    expect(windowsInstaller).toContain("..\\engine\\listen.py")
    expect(macInstaller).toContain("../engine/listen.py")
    expect(windowsInstaller).not.toContain("claude_prefs.py")
    expect(macInstaller).not.toContain("claude_prefs.py")
  })

  test("installer and listener share the OpenCode model root", () => {
    expect(listener).toContain(
      'os.path.join(os.path.expanduser("~"), ".config", "opencode", "speedy-code", "models", MODEL_FILE)',
    )
    // The Claude Code plugin's model is only a fallback, taken when this root has none.
    expect(listener.indexOf("if not os.path.exists(MODEL_PATH):")).toBeLessThan(
      listener.indexOf('".claude", "speedy-code", "models"'),
    )
  })

  test("installs and checks the viewer's packages: pdfminer.six for a PDF's text, the beautifiers for minified code", () => {
    for (const installer of [windowsInstaller, macInstaller]) {
      expect(installer).toMatch(/uv pip install --python "?\$python"? edge-tts transcribe-cpp sounddevice numpy pdfminer\.six jsbeautifier cssbeautifier/)
      expect(installer).toContain("import edge_tts, transcribe_cpp, sounddevice, numpy, pdfminer, jsbeautifier, cssbeautifier")
    }
  })

  test("retains the upstream MIT attribution", async () => {
    const license = await Bun.file("LICENSE").text()
    expect(license).toContain("MIT License")
    expect(license).toContain("Copyright (c) 2026 Julio Cesar Corbaz")
  })
})
