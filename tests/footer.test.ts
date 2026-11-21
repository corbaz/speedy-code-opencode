import { describe, expect, test } from "bun:test"

import {
  versionLabel,
  folderLabel,
  newSessionChoice,
  FOOTER_SHED,
  MORE_WIDTH,
  PLAY_GLYPHS,
  cells,
  fit,
  footerControls,
  footerFit,
  footerRoom,
  footerText,
  modelFamily,
  visibleControls,
} from "../src/footer"

describe("cells", () => {
  test("counts an ordinary character as one cell", () => {
    expect(cells("abc")).toBe(3)
    expect(cells("")).toBe(0)
  })

  test("counts an emoji as two cells", () => {
    expect(cells("🔊")).toBe(2)
    expect(cells("🎙️")).toBe(2)
  })

  test("counts a text-presentation selector as no cell", () => {
    expect(cells("⏸︎")).toBe(1)
    expect(cells("⏸️")).toBe(2)
  })

  test("counts a zero-width joiner as no cell", () => {
    expect(cells("🗣️")).toBe(2)
  })
})

describe("fit", () => {
  test("pads a short label to the width", () => {
    expect(fit("abc", 5)).toBe("abc  ")
  })

  test("cuts a long label with an ellipsis inside the width", () => {
    expect(fit("abcdef", 4)).toBe("abc…")
    expect(fit("abcdef", 4)).toHaveLength(4)
  })
})

describe("footerRoom", () => {
  test("reserves the margin when no mode label is drawn", () => {
    expect(footerRoom(80)).toBe(76)
  })

  test("also reserves the mode label and its spacing", () => {
    expect(footerRoom(80, 10)).toBe(63)
  })
})

describe("footerFit", () => {
  const groups = [
    { name: "model", width: 20, compactWidth: 10 },
    { name: "voice", width: 12, compactWidth: 6 },
    { name: "settings", width: 4 },
    { name: "narrator", width: 4 },
  ]

  test("draws every group whole when they fit", () => {
    expect(footerFit(groups, 40)).toEqual({
      shown: new Set(["model", "voice", "settings", "narrator"]),
      compact: new Set(),
    })
  })

  test("keeps rank zero, then adds by ascending rank without going over", () => {
    expect(footerFit(groups, 39)).toEqual({
      shown: new Set(["model", "voice"]),
      compact: new Set(),
    })
  })

  test("shortens the model before dropping anything", () => {
    expect(footerFit(groups, 30)).toEqual({
      shown: new Set(["model", "voice", "settings"]),
      compact: new Set(["model"]),
    })
  })

  test("sheds short forms in the documented order and keeps the model", () => {
    expect(footerFit(groups, 8)).toEqual({
      shown: new Set(["model"]),
      compact: new Set(["model"]),
    })
  })

  test("sheds the same groups in the same order regardless of input order", () => {
    const shed = ["voice", "compact", "clear", "image", "copy", "polish"].map((name) => ({ name, width: 4 }))
    const forward = footerFit([{ name: "model", width: 4 }, ...shed], 4)
    const backward = footerFit([...shed].reverse().concat({ name: "model", width: 4 }), 4)

    expect(forward.shown).toEqual(new Set(["model"]))
    expect(backward.shown).toEqual(new Set(["model"]))
  })

  test("pins the shed order constant", () => {
    expect(FOOTER_SHED).toEqual(["voice", "compact", "clear", "image", "copy", "polish"])
  })

  test("reserves the more button width", () => {
    expect(MORE_WIDTH).toBe(4)
    expect(footerFit([{ name: "model", width: 2 }], 1).shown).toEqual(new Set(["model"]))
  })
})

describe("PLAY_GLYPHS", () => {
  test("names every speech state with its glyph and color", () => {
    expect(PLAY_GLYPHS).toEqual({
      idle: { glyph: "⏵", color: "#51cf66" },
      thinking: { glyph: "⧗", color: "#748ffc" },
      playing: { glyph: "⏸︎", color: "#ffd43b" },
      paused: { glyph: "⏵", color: "#51cf66" },
    })
  })
})

describe("modelFamily", () => {
  test("takes the family of a provider model id", () => {
    expect(modelFamily("claude-sonnet-4-5")).toBe("sonnet")
    expect(modelFamily("anthropic/claude-opus-4")).toBe("claude")
  })

  test("keeps an id without segments", () => {
    expect(modelFamily("local")).toBe("local")
  })
})

describe("footerControls", () => {
  const base = { narrator: false, speech: "idle", listening: "off" } as const

  test("draws the controls in their documented order", () => {
    const controls = footerControls({ ...base, model: "claude-sonnet-4-5", voice: "Español" })
    expect(controls.map((control) => control.name)).toEqual([
      "copy",
      "paste",
      "image",
      "images",
      "clear",
      "bar",
      "model",
      "voice",
      "agent",
      "compact",
      "narrator",
      "play",
      "history",
      "mic",
      "mics",
      "polish",
      "send",
      "new",
      "sessions",
      "reload",
      "settings",
      "exit",
    ])
  })

  test("omits the model when none is selected", () => {
    expect(footerControls(base).map((control) => control.name)).toEqual([
      "copy",
      "paste",
      "image",
      "images",
      "clear",
      "voice",
      "agent",
      "compact",
      "narrator",
      "play",
      "history",
      "mic",
      "mics",
      "polish",
      "send",
      "new",
      "sessions",
      "reload",
      "settings",
      "exit",
    ])
  })

  test("draws one control for the linked networks first, then the bar", () => {
    const names = footerControls({
      ...base,
      socials: [
        { id: "github", badge: "GH", color: "#e6edf3" },
        { id: "x", badge: "X", color: "#e6edf3" },
      ],
    }).map((control) => control.name)

    expect(names.slice(0, 2)).toEqual(["socials", "divider"])
    expect(names).toContain("copy")
  })

  test("shows the effort beside the model and the language beside the voice", () => {
    const controls = footerControls({ ...base, model: "claude-sonnet-4-5", effort: "medium", language: "ES" })
    expect(controls.find((one) => one.name === "effort")?.text).toBe("· medium ▾ ")
    expect(controls.find((one) => one.name === "voice")?.text).toBe(" 🗣  Español · ES ▾")
  })

  test("says the wand is working instead of showing its idle glyph", () => {
    expect(footerControls({ ...base, polishing: true }).find((one) => one.name === "polish")?.text).toBe(" ⏳ ")
  })

  test("every control that does something carries the id to run", () => {
    const controls = footerControls({ ...base, socials: [{ id: "github", badge: "GH", color: "#e6edf3" }] })
    for (const control of controls) {
      if (control.name === "divider" || control.name === "bar") {
        expect(control.id).toBeUndefined()
        continue
      }
      expect(control.id).toBe(control.name)
    }
  })

  test("flips the narrator glyph and color", () => {
    const off = footerControls(base).find((control) => control.name === "narrator")
    const on = footerControls({ ...base, narrator: true }).find((control) => control.name === "narrator")
    // As the original draws it: the speaker sounds while the narrator is on.
    expect(off?.text).toBe(" 🔇 ")
    expect(on?.text).toBe(" 🔊 ")
    expect(on?.color).not.toBe(off?.color)
  })

  test("follows the speech state on the play control", () => {
    const play = (speech: "playing" | "thinking") =>
      footerControls({ ...base, speech }).find((control) => control.name === "play")?.text
    expect(play("playing")).toBe(" ⏸︎ ")
    expect(play("thinking")).toBe(" ⧗ ")
  })

  test("follows the listening state on the microphone", () => {
    expect(footerControls({ ...base, listening: "on" }).find((control) => control.name === "mic")?.text).toBe(" 🔴 ")
  })

  test("measures every control in the cells it takes", () => {
    for (const control of footerControls({ ...base, model: "claude-sonnet-4-5", voice: "Español" })) {
      expect(control.width).toBe(cells(control.text))
      if (control.compactText) expect(control.compactWidth).toBe(cells(control.compactText))
    }
  })
})

describe("footerText", () => {
  const controls = footerControls({
    narrator: false,
    speech: "idle",
    listening: "off",
    model: "claude-sonnet-4-5",
    voice: "Español",
  })

  test("joins the shown controls in order", () => {
    const text = footerText(controls, footerFit(controls, 200))
    expect(text.startsWith(" 📋  📥  🖼️  👁️  🗑️ │ claude-sonnet-4-5 ▾  🗣")).toBe(true)
  })

  test("uses the short form the fit chose", () => {
    const text = footerText(controls, {
      shown: new Set(["model"]),
      compact: new Set(["model"]),
    })
    expect(text).toBe(" sonnet ▾ ")
  })

  test("drops the controls the fit left out", () => {
    const text = footerText(controls, { shown: new Set(["settings"]), compact: new Set() })
    expect(text).toBe(" ⚙️ ")
  })
})

describe("visibleControls", () => {
  const input = {
    narrator: true,
    speech: "idle" as const,
    listening: "off" as const,
    model: "claude-sonnet-4-5",
    voice: "Español",
  }

  test("keeps the controls the fit kept, in the order they are drawn", () => {
    const controls = footerControls(input)
    const result = footerFit(controls, 200)

    expect(visibleControls(controls, result).map((control) => control.name)).toEqual(
      controls.map((control) => control.name),
    )
  })

  test("draws the short form of a control the fit compacted", () => {
    const controls = footerControls(input)
    const result = footerFit(controls, 40)
    const shown = visibleControls(controls, result)
    const model = shown.find((control) => control.name === "model")

    expect(result.compact.has("model")).toBe(true)
    expect(model?.text).toBe(controls.find((control) => control.name === "model")?.compactText)
  })

  test("keeps the play control when the width sheds the others", () => {
    const controls = footerControls(input)
    const result = footerFit(controls, 30)

    expect(result.shown.has("play")).toBe(true)
    expect(result.shown.size).toBeLessThan(controls.length)
  })
})

describe("the networks' control", () => {
  const base = { narrator: false, speech: "idle", listening: "off" } as const

  test("is one control that opens their menu, whatever the number of networks", () => {
    const controls = footerControls({
      ...base,
      socials: [
        { id: "github", badge: "GH", color: "#e6edf3" },
        { id: "github#2", badge: "GH2", color: "#e6edf3" },
      ],
    })
    const socials = controls.filter((control) => control.name === "socials")
    expect(socials).toHaveLength(1)
    expect(socials[0]?.text).toBe(" Redes ▾ ")
    expect(socials[0]?.compactText).toBeUndefined()
    expect(socials[0]?.id).toBe("socials")
  })

  test("is not drawn when no network has a user name", () => {
    expect(footerControls(base).some((control) => control.name === "socials")).toBe(false)
  })
})

describe("the name asked for by +", () => {
  test("a name typed starts a session with that title, trimmed", () => {
    expect(newSessionChoice("  Facturas  ")).toEqual({ kind: "named", title: "Facturas" })
  })

  test("an empty answer starts a session the host names", () => {
    expect(newSessionChoice("")).toEqual({ kind: "plain" })
    expect(newSessionChoice("   ")).toEqual({ kind: "plain" })
  })

  test("a closed dialog starts nothing", () => {
    expect(newSessionChoice(undefined)).toEqual({ kind: "none" })
  })
})

describe("the version, and the place after the exit", () => {
  const base = { narrator: false, speech: "idle", listening: "off" } as const

  test("is the last commit's moment in Buenos Aires, as vyy.mmdd(hhmm)", () => {
    // 2026-11-17 00:05 UTC is 2026-11-16 21:05 in Buenos Aires (UTC-3, no summer time).
    expect(versionLabel(Date.UTC(2026, 10, 17, 0, 5) / 1000)).toBe("v26.1116(2105)")
    expect(versionLabel(Date.UTC(2027, 0, 1, 2, 59) / 1000)).toBe("v26.1231(2359)")
    expect(versionLabel(Date.UTC(2027, 0, 1, 3, 0) / 1000)).toBe("v27.0101(0000)")
  })

  test("says nothing of a moment it was not given", () => {
    expect(versionLabel(Number.NaN)).toBe("")
    expect(versionLabel(0)).toBe("")
  })

  test("the folder, home as ~, and the git branch are drawn right after the exit, each in its color, and run nothing", () => {
    const controls = footerControls({ ...base, folder: "~\\.claude\\local-mods", branch: "main" })
    expect(controls.map((control) => control.name).slice(-3)).toEqual(["exit", "place", "branch"])
    const [place, branch] = controls.slice(-2)
    expect(place?.text).toBe(" ~\\.claude\\local-mods")
    expect(place?.color).toBe("#5fd7ff")
    expect(branch?.text).toBe(" ⎇ main ")
    expect(branch?.color).toBe("#d787ff")
    expect(place?.id).toBeUndefined()
    expect(branch?.id).toBeUndefined()
    // No branch: the folder closes the row with its own blank.
    expect(footerControls({ ...base, folder: "~" }).at(-1)?.text).toBe(" ~ ")
    expect(controls.some((control) => control.name === "version")).toBe(false)
  })

  test("folderLabel: home as ~, the system's separator, and the end alone after a … when it is long", () => {
    expect(folderLabel("C:\\Users\\Sancho\\.claude\\local-mods", "C:\\Users\\Sancho", "\\")).toBe("~\\.claude\\local-mods")
    expect(folderLabel("/Users/jc/proyectos", "/Users/jc", "/")).toBe("~/proyectos")
    expect(folderLabel("/Users/jcx", "/Users/jc", "/")).toBe("/Users/jcx")
    expect(folderLabel("/opt/a/very/long/path/to/somewhere", "/Users/jc", "/", 12)).toBe("…o/somewhere")
    expect(folderLabel("", "/Users/jc", "/")).toBe("")
  })

  test("the folder is not drawn without one, and keeps its room before the controls ranked lowest", () => {
    expect(footerControls(base).some((control) => control.name === "place")).toBe(false)
    const controls = footerControls({ ...base, folder: "~\\.claude\\local-mods", branch: "main" })
    const full = controls.reduce((sum, control) => sum + control.width, 0)
    const fit = footerFit(controls, full - 1)
    expect(fit.shown.has("place")).toBe(true)
    expect(fit.shown.has("branch")).toBe(true)
    expect(fit.shown.has("exit")).toBe(true)
  })
})
