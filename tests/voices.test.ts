import { describe, expect, test } from "bun:test"

import { DEFAULT_PICKS } from "../src/settings"
import {
  countryOf,
  distinctVoices,
  guessLanguage,
  micName,
  nameOf,
  parseMics,
  parseVoices,
  voiceTitle,
} from "../src/voices"

const listing = [
  "Name                               Gender    ContentCategories      VoicePersonalities",
  "---------------------------------  --------  ---------------------  ------------------",
  "es-PR-VictorNeural                 Male      General                Friendly, Positive",
  "es-AR-ElenaNeural                  Female    General                Friendly, Positive",
  "en-US-AndrewNeural                 Male      General                Warm",
  "en-US-AndrewMultilingualNeural     Male      General                Warm",
  "de-DE-KatjaNeural                  Female    General                Friendly",
  "zh-CN-liaoning-XiaobeiNeural       Female    Dialect                Humorous",
].join("\r\n")

describe("voice names", () => {
  test("a voice is named by its own name, with what sets it apart", () => {
    expect(nameOf("es-PR-VictorNeural")).toEqual({ name: "Victor", tag: "" })
    expect(nameOf("en-US-AvaMultilingualNeural")).toEqual({ name: "Ava", tag: "✦ multi" })
    expect(nameOf("zh-CN-liaoning-XiaobeiNeural")).toEqual({ name: "Xiaobei", tag: "Liaoning" })
  })

  test("a country is said in Spanish, short where the column is narrow", () => {
    expect(countryOf("es-PR-VictorNeural")).toBe("Puerto Rico")
    expect(countryOf("en-US-AriaNeural")).toBe("EE. UU.")
  })
})

describe("parseVoices", () => {
  test("keeps the neural voices of the menu's languages, by country and name", () => {
    const voices = parseVoices(listing)
    expect(voices.map((voice) => voice.value)).toEqual([
      "es-AR-ElenaNeural",
      "zh-CN-liaoning-XiaobeiNeural",
      "en-US-AndrewNeural",
      "en-US-AndrewMultilingualNeural",
      "es-PR-VictorNeural",
    ])
    expect(voices.find((voice) => voice.value === "es-PR-VictorNeural")).toEqual({
      value: "es-PR-VictorNeural",
      lang: "es",
      name: "Victor",
      tag: "",
      country: "Puerto Rico",
      gender: "Male",
    })
  })

  test("nothing usable is an empty list", () => {
    expect(parseVoices("")).toEqual([])
  })
})

describe("distinctVoices", () => {
  const andrews = parseVoices(listing).filter((voice) => voice.name === "Andrew")

  test("lists a name once, the multilingual one", () => {
    expect(distinctVoices(andrews, "").map((voice) => voice.value)).toEqual(["en-US-AndrewMultilingualNeural"])
  })

  test("the voice in use stays", () => {
    expect(distinctVoices(andrews, "en-US-AndrewNeural").map((voice) => voice.value)).toEqual(["en-US-AndrewNeural"])
  })
})

describe("voiceTitle", () => {
  test("says the voice narrating now", () => {
    expect(voiceTitle({ ...DEFAULT_PICKS, es: "es-PR-VictorNeural", active: "es" })).toBe(
      "Voz: Victor (Español - Puerto Rico)",
    )
  })
})

describe("microphones", () => {
  test("a microphone is named by its device", () => {
    expect(micName("Auriculares con micrófono (2- JBL Tune 520BT)")).toBe("JBL Tune 520BT")
    expect(micName("Micrófono")).toBe("Micrófono")
  })

  test("reads the lines the engine lists", () => {
    expect(parseMics("info x\r\nmic Micrófono (USB)\r\nmic  Otro \r\n")).toEqual(["Micrófono (USB)", "Otro"])
  })
})

describe("guessLanguage", () => {
  test("tells Spanish from English, and says nothing when it cannot tell", () => {
    expect(guessLanguage("el perro que está en la casa de los vecinos")).toBe("es")
    expect(guessLanguage("the dog is in the house and it is with you")).toBe("en")
    expect(guessLanguage("ok")).toBe("")
  })
})
