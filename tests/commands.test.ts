import { describe, expect, test } from "bun:test"

import { COMMAND_HELP, routeCommand } from "../src/commands"

describe("routeCommand", () => {
  test("opens the settings menu for an empty argument", () => {
    expect(routeCommand("")).toEqual({ kind: "settings" })
    expect(routeCommand("   ")).toEqual({ kind: "settings" })
  })

  test("opens the settings menu by either name", () => {
    expect(routeCommand("ajustes")).toEqual({ kind: "settings" })
    expect(routeCommand("settings")).toEqual({ kind: "settings" })
  })

  test("turns the narrator on and off", () => {
    expect(routeCommand("on")).toEqual({ kind: "narrator", on: true })
    expect(routeCommand("off")).toEqual({ kind: "narrator", on: false })
  })

  test("opens the voice menu by either name", () => {
    expect(routeCommand("voces")).toEqual({ kind: "voices" })
    expect(routeCommand("voices")).toEqual({ kind: "voices" })
  })

  test("opens the history by either name", () => {
    expect(routeCommand("historial")).toEqual({ kind: "history" })
    expect(routeCommand("history")).toEqual({ kind: "history" })
  })

  test("starts or closes the dictation by either name", () => {
    expect(routeCommand("dictado")).toEqual({ kind: "dictation" })
    expect(routeCommand("dictation")).toEqual({ kind: "dictation" })
  })

  test("copies or polishes the reply by either name", () => {
    expect(routeCommand("copiar")).toEqual({ kind: "copy" })
    expect(routeCommand("copy")).toEqual({ kind: "copy" })
    expect(routeCommand("pulir")).toEqual({ kind: "polish" })
    expect(routeCommand("polish")).toEqual({ kind: "polish" })
  })

  test("opens the model variants, the sessions and the socials by either name", () => {
    expect(routeCommand("modelo")).toEqual({ kind: "model" })
    expect(routeCommand("model")).toEqual({ kind: "model" })
    expect(routeCommand("sesiones")).toEqual({ kind: "sessions" })
    expect(routeCommand("sessions")).toEqual({ kind: "sessions" })
    expect(routeCommand("redes")).toEqual({ kind: "socials" })
    expect(routeCommand("socials")).toEqual({ kind: "socials" })
  })

  test("reads the last reply again by either name", () => {
    expect(routeCommand("leer")).toEqual({ kind: "play" })
    expect(routeCommand("play")).toEqual({ kind: "play" })
  })

  test("stops, pauses and resumes", () => {
    expect(routeCommand("stop")).toEqual({ kind: "stop" })
    expect(routeCommand("pausa")).toEqual({ kind: "pause" })
    expect(routeCommand("pause")).toEqual({ kind: "pause" })
    expect(routeCommand("seguir")).toEqual({ kind: "resume" })
    expect(routeCommand("resume")).toEqual({ kind: "resume" })
  })

  test("ignores case and surrounding spaces", () => {
    expect(routeCommand("  ON  ")).toEqual({ kind: "narrator", on: true })
    expect(routeCommand("Voces")).toEqual({ kind: "voices" })
  })

  test("reports anything else as unknown", () => {
    expect(routeCommand("decir hola")).toEqual({ kind: "unknown" })
  })

  test("names every keyword in the help line", () => {
    for (const word of [
      "on",
      "off",
      "stop",
      "pausa",
      "seguir",
      "leer",
      "voces",
      "historial",
      "dictado",
      "copiar",
      "pulir",
      "modelo",
      "sesiones",
      "redes",
    ]) {
      expect(COMMAND_HELP).toContain(word)
    }
  })
})
