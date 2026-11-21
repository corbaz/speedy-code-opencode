import { describe, expect, test } from "bun:test"

import {
  BAR_PARTS,
  DEFAULT_LEVELS,
  DEFAULT_ORDER,
  DEFAULT_PICKS,
  DEFAULT_SETTINGS,
  DEFAULT_VOICES,
  LANGUAGES,
  SPEEDY_STORE_KEY,
  adjustLevel,
  barOrderOf,
  movePart,
  normalizeLevels,
  normalizeOrder,
  resetSettings,
  sameSettings,
  settingsFromSaved,
  voiceFor,
  type SpeedySettings,
} from "../src/settings"

describe("settings defaults", () => {
  test("keeps the level thresholds the original ships", () => {
    expect(DEFAULT_LEVELS).toEqual({ contextYellow: 60, contextRed: 80, limitYellow: 75, limitRed: 90 })
  })

  test("keeps every status line part in its default priority", () => {
    expect(DEFAULT_ORDER).toEqual(["core", "app", "five_hour", "seven_day", "context", "time", "cost", "tokens"])
    expect(BAR_PARTS.map(([key]) => key)).toEqual(DEFAULT_ORDER)
  })

  test("uses one durable store key", () => {
    expect(SPEEDY_STORE_KEY).toBe("speedy-code.settings")
  })

  test("starts with the narrator off and the Spanish voice picked", () => {
    expect(DEFAULT_SETTINGS.narrator).toBe(false)
    expect(DEFAULT_SETTINGS.picks.active).toBe("es")
    expect(DEFAULT_SETTINGS.picks.es).toBe("es-PR-VictorNeural")
    expect(DEFAULT_SETTINGS.mic).toBe("")
    expect(DEFAULT_SETTINGS.barLevels).toEqual(DEFAULT_LEVELS)
    expect(DEFAULT_SETTINGS.barOrder).toEqual(DEFAULT_ORDER)
  })
})

describe("barOrderOf", () => {
  test("returns the default order for a missing or invalid value", () => {
    expect(barOrderOf(undefined)).toEqual(DEFAULT_ORDER)
    expect(barOrderOf("app")).toEqual(DEFAULT_ORDER)
  })

  test("keeps known parts once each in the saved order then appends the rest", () => {
    expect(barOrderOf(["app", "app", "bogus", "core", "folder"])).toEqual([
      "app",
      "core",
      "five_hour",
      "seven_day",
      "context",
      "time",
      "cost",
      "tokens",
    ])
  })

  test("never drops a part", () => {
    expect(barOrderOf([]).sort()).toEqual([...DEFAULT_ORDER].sort())
  })
})

describe("normalizeOrder", () => {
  test("delegates to the same repair", () => {
    expect(normalizeOrder(["time"])).toEqual(barOrderOf(["time"]))
  })
})

describe("normalizeLevels", () => {
  test("keeps a complete saved value", () => {
    const saved = { contextYellow: 50, contextRed: 70, limitYellow: 65, limitRed: 85 }
    expect(normalizeLevels(saved)).toEqual(saved)
  })

  test("falls back per key for a missing or non numeric value", () => {
    expect(normalizeLevels({ contextYellow: "high", contextRed: 70 })).toEqual({
      contextYellow: 60,
      contextRed: 70,
      limitYellow: 75,
      limitRed: 90,
    })
  })
})

describe("movePart", () => {
  test("swaps a part with its neighbour", () => {
    expect(movePart(DEFAULT_ORDER, "context", -1).slice(0, 5)).toEqual([
      "core",
      "app",
      "five_hour",
      "context",
      "seven_day",
    ])
  })

  test("does nothing at either end or for an unknown part", () => {
    expect(movePart(DEFAULT_ORDER, "core", -1)).toEqual(DEFAULT_ORDER)
    expect(movePart(DEFAULT_ORDER, "tokens", 1)).toEqual(DEFAULT_ORDER)
    expect(movePart(DEFAULT_ORDER, "missing" as never, 1)).toEqual(DEFAULT_ORDER)
  })
})

describe("adjustLevel", () => {
  test("moves a level by five within its bounds", () => {
    expect(adjustLevel(DEFAULT_LEVELS, "contextYellow", 5).contextYellow).toBe(65)
    expect(adjustLevel(DEFAULT_LEVELS, "contextRed", -5).contextRed).toBe(75)
  })

  test("keeps yellow five under its red", () => {
    expect(adjustLevel(DEFAULT_LEVELS, "contextYellow", 100).contextYellow).toBe(75)
  })

  test("keeps red five over its yellow and at most one hundred", () => {
    expect(adjustLevel(DEFAULT_LEVELS, "contextYellow", -100).contextYellow).toBe(5)
    expect(adjustLevel({ ...DEFAULT_LEVELS, limitRed: 100 }, "limitRed", 5).limitRed).toBe(100)
  })

  test("returns a new value without mutating the input", () => {
    const levels = { ...DEFAULT_LEVELS }
    const next = adjustLevel(levels, "limitYellow", 5)
    expect(next).not.toBe(levels)
    expect(levels).toEqual(DEFAULT_LEVELS)
  })
})

describe("settingsFromSaved", () => {
  test("returns the defaults for a missing value", () => {
    expect(settingsFromSaved(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromSaved(42)).toEqual(DEFAULT_SETTINGS)
  })

  test("merges a partial value over the defaults", () => {
    const merged = settingsFromSaved({ narrator: true, mic: "USB Mic", picks: { es: "es-AR-TomasNeural" } })
    expect(merged.narrator).toBe(true)
    expect(merged.mic).toBe("USB Mic")
    expect(merged.picks.es).toBe("es-AR-TomasNeural")
    expect(merged.picks.active).toBe("es")
    expect(merged.barLevels).toEqual(DEFAULT_LEVELS)
  })

  test("repairs a saved status line order and levels", () => {
    const merged = settingsFromSaved({ barOrder: ["app"], barLevels: { contextYellow: 10 } })
    expect(merged.barOrder).toEqual(barOrderOf(["app"]))
    expect(merged.barLevels.contextRed).toBe(80)
  })

  test("ignores a wrong narrator type", () => {
    expect(settingsFromSaved({ narrator: "yes" }).narrator).toBe(false)
  })
})

describe("settingsFromSaved", () => {
  test("an empty voice from an older save does not mute the language shown", () => {
    const saved = { ...DEFAULT_SETTINGS, picks: { es: "es-AR-ElenaNeural", en: "", active: "en" } }
    const repaired = settingsFromSaved(saved)

    expect(repaired.picks.en).toBe(DEFAULT_VOICES.en)
    expect(voiceFor(repaired.picks, "en")).toBe(DEFAULT_VOICES.en)
  })

  test("keeps the chosen voice and falls back to a known language", () => {
    const repaired = settingsFromSaved({ ...DEFAULT_SETTINGS, picks: { es: "es-AR-ElenaNeural", active: "xx" } })

    expect(repaired.picks.active).toBe(DEFAULT_SETTINGS.picks.active)
    expect(voiceFor(repaired.picks, "xx")).toBe("es-AR-ElenaNeural")
  })
})

describe("resetSettings", () => {
  test("restores the status line defaults", () => {
    const broken: SpeedySettings = {
      ...DEFAULT_SETTINGS,
      barLevels: { ...DEFAULT_LEVELS, contextYellow: 10 },
      barOrder: ["app"],
    }
    expect(resetSettings(broken)).toEqual(DEFAULT_SETTINGS)
  })
})

describe("default voices", () => {
  test("gives every offered language a voice", () => {
    for (const [code] of LANGUAGES) {
      expect(DEFAULT_VOICES[code]).toBeTruthy()
      expect(DEFAULT_PICKS[code]).toBe(DEFAULT_VOICES[code])
    }
  })

  test("speaks a language with the voice stored for it", () => {
    expect(voiceFor({ es: "es-AR-ElenaNeural", active: "es" }, "es")).toBe("es-AR-ElenaNeural")
  })

  test("falls back to the language shown, then to Spanish", () => {
    expect(voiceFor({ en: "en-US-AriaNeural", active: "en" }, "fr")).toBe("en-US-AriaNeural")
    expect(voiceFor({ active: "fr" }, "fr")).toBe(DEFAULT_VOICES.es ?? "")
  })
})

describe("sameSettings", () => {
  test("treats the same settings in another key order as unchanged", () => {
    const stored = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).reverse())
    expect(sameSettings(DEFAULT_SETTINGS, stored)).toBe(true)
  })

  test("reports a real change", () => {
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, narrator: !DEFAULT_SETTINGS.narrator })).toBe(false)
  })
})

describe("voiceShortName", () => {
  test("names the voice the way the footer writes it", async () => {
    const { voiceShortName } = await import("../src/settings")
    expect(voiceShortName("es-PR-VictorNeural")).toBe("Victor")
    expect(voiceShortName("en-US-AvaMultilingualNeural")).toBe("Ava")
    expect(voiceShortName("zh-CN-liaoning-XiaobeiNeural")).toBe("Xiaobei")
    expect(voiceShortName("")).toBe("")
  })
})

describe("importClaude", () => {
  test("brings the voices, the microphone, the networks and the levels over", async () => {
    const { importClaude, DEFAULT_SETTINGS, cloneSettings } = await import("../src/settings")
    const next = importClaude(cloneSettings(DEFAULT_SETTINGS), {
      picks: { es: "es-PR-VictorNeural", en: "en-AU-NatashaNeural", active: "es", xx: "nope" },
      mic: "Micrófono (G432 Gaming Headset)",
      socials: { github: "@corbaz", "github#2": "otro" },
      barLevels: { contextRed: 85 },
    })
    expect(next.imported).toBe(true)
    expect(next.picks.en).toBe("en-AU-NatashaNeural")
    expect(next.picks.xx).toBeUndefined()
    expect(next.mic).toBe("Micrófono (G432 Gaming Headset)")
    expect(next.socials.github).toBe("corbaz")
    expect(next.socials["github#2"]).toBe("otro")
    expect(next.barLevels.contextRed).toBe(85)
    expect(next.barLevels.contextYellow).toBe(60)
  })

  test("with nothing to read it only notes that it looked", async () => {
    const { importClaude, DEFAULT_SETTINGS, cloneSettings } = await import("../src/settings")
    const next = importClaude(cloneSettings(DEFAULT_SETTINGS), undefined)
    expect(next).toEqual({ ...cloneSettings(DEFAULT_SETTINGS), imported: true })
  })
})
