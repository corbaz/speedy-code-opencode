import { describe, expect, test } from "bun:test"

import { INITIAL_MENU, SETUP_STEPS, menuHeading } from "../src/menus"
import { DEFAULT_SETTINGS, cloneSettings, settingsFromSaved } from "../src/settings"

describe("menuHeading", () => {
  const settings = cloneSettings(DEFAULT_SETTINGS)

  test("the voice menu is titled with the voice narrating now, in its language color", () => {
    expect(menuHeading("voices", settings)).toEqual({ title: "Voz: Victor (Español - Puerto Rico)", color: "#ff6b6b" })
  })

  test("every other menu has its own title", () => {
    expect(menuHeading("history", settings).title).toBe("📎 Audios")
    expect(menuHeading("mic", settings).title).toBe("Micrófono para dictar")
    expect(menuHeading("more", settings).title).toBe("Más")
    expect(menuHeading("settings", settings).title).toBe("Configuración")
    expect(menuHeading("socials", settings).title).toBe("Redes sociales")
    expect(menuHeading("images", settings).title).toBe("Imágenes")
  })
})

describe("menu state", () => {
  test("starts closed, on the networks tab", () => {
    expect(INITIAL_MENU.open).toBe("")
    expect(INITIAL_MENU.settingsTab).toBe("socials")
  })

  test("the installer steps are the ones the installer reports", () => {
    expect(SETUP_STEPS.map(([name]) => name)).toEqual(["uv", "python", "packages", "model", "mics", "voices", "sidebar", "groq"])
  })
})

describe("the status line switch", () => {
  test("is on unless it was switched off", () => {
    expect(DEFAULT_SETTINGS.statusBar).toBe(true)
    expect(settingsFromSaved({ statusBar: false }).statusBar).toBe(false)
    expect(settingsFromSaved({ statusBar: "no" }).statusBar).toBe(true)
  })
})
