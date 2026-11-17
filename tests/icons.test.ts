import { describe, expect, test } from "bun:test"

import { cells, footerControls } from "../src/footer"
import { NERD_COLORS, NERD_ICONS, iconText, nerdText } from "../src/icons"

describe("the Nerd Fonts icons", () => {
  test("every glyph is one character of the basic private use area", () => {
    for (const glyph of Object.values(NERD_ICONS)) {
      expect(glyph).toHaveLength(1)
      const code = glyph.codePointAt(0) ?? 0
      expect(code >= 0xe000 && code <= 0xf8ff).toBe(true)
    }
  })

  test("an emoji gives way to its glyph, and the label keeps its width", () => {
    expect(nerdText(" 📋 ")).toBe("   ")
    expect(nerdText(" 🖼️ imagen ")).toBe("   imagen ")
    expect(nerdText(" ⚙️ ")).toBe("   ")
    for (const label of [" 📋 ", " 🖼️ imagen ", " ⚙️ ", " 🗣  Victor · ES ▾", " 👁️ ver imágenes ", " × ", " ⏳ "]) {
      expect(cells(nerdText(label))).toBe(cells(label))
    }
  })

  test("the close mark is one cell in both sets", () => {
    expect(nerdText(" × ")).toBe(" \uea76 ")
    expect(nerdText(" ⏸\ufe0e ")).toBe(" \uf04c ")
    expect(nerdText("✔ listo · ⚠  compactar")).toBe("\uf00c listo · \uf071  compactar")
  })

  test("text without emojis is left as it is, and so is everything with the emoji set", () => {
    expect(nerdText(" Redes sociales ▾ ")).toBe(" Redes sociales ▾ ")
    expect(iconText(" 📋 ", "emoji")).toBe(" 📋 ")
    expect(iconText(" 📋 ", "nerd")).toBe("   ")
  })
})

describe("the footer with each icon set", () => {
  const base = { narrator: true, speech: "idle", listening: "off" } as const
  const named = (icons: "emoji" | "nerd" | undefined, name: string) =>
    footerControls({ ...base, icons }).find((control) => control.name === name)

  test("emojis by default, with the exit as ×", () => {
    expect(named(undefined, "copy")?.text).toBe(" 📋 ")
    expect(named(undefined, "exit")?.text).toBe(" × ")
    expect(named("emoji", "copy")?.color).toBe("#adb5bd")
  })

  test("with Nerd Fonts every tool is a glyph in its own color, as wide as before", () => {
    const emoji = footerControls({ ...base, icons: "emoji" })
    const nerd = footerControls({ ...base, icons: "nerd" })
    expect(nerd.map((control) => control.name)).toEqual(emoji.map((control) => control.name))
    expect(nerd.map((control) => control.width)).toEqual(emoji.map((control) => control.width))
    expect(named("nerd", "copy")?.text).toBe("   ")
    expect(named("nerd", "copy")?.color).toBe(NERD_COLORS.copy)
    expect(named("nerd", "exit")?.text).toBe(" \uea76 ")
    expect(named("nerd", "copy")?.panel).toBe("   copiar ")
    // No emoji is left in what the footer draws.
    for (const control of nerd) expect(/[\u{1f000}-\u{1ffff}]/u.test(control.text)).toBe(false)
  })

  test("the microphone keeps its glyph and says its state by its color", () => {
    const on = footerControls({ ...base, listening: "on", icons: "nerd" }).find((control) => control.name === "mic")
    expect(on?.text).toBe("   ")
    expect(on?.color).toBe("#ff6b6b")
  })
})
