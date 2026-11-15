import { describe, expect, test } from "bun:test"

import {
  POLISH_MODEL,
  POLISH_SYSTEM,
  createPolisher,
  parsePolishResult,
  polishCommand,
  type PolishChild,
} from "../src/polish"

/** A child whose stdin the test reads and whose stdout it feeds. */
function fakeChild(answer: string) {
  const written: string[] = []
  let ended = false
  const child: PolishChild = {
    stdin: {
      write: (chunk) => written.push(chunk),
      end: () => {
        ended = true
      },
    },
    stdout: (async function* () {
      yield answer
    })(),
    on: () => {},
  }
  return { child, written, ended: () => ended }
}

describe("polishCommand", () => {
  test("runs the engine's wand on Windows", () => {
    expect(
      polishCommand({ platform: "win32", root: "C:\\plugin", python: "C:\\venv\\python.exe" }).argv,
    ).toEqual(["C:\\venv\\python.exe", "C:\\plugin\\engine\\polish.py"])
  })

  test("runs it with the chosen interpreter elsewhere", () => {
    expect(polishCommand({ platform: "darwin", root: "/plugin", python: "/venv/bin/python" }).argv).toEqual([
      "/venv/bin/python",
      "/plugin/engine/polish.py",
    ])
  })
})

describe("parsePolishResult", () => {
  test("returns the improved message", () => {
    expect(parsePolishResult('{"text":"  hola mundo  "}')).toEqual({ text: "hola mundo" })
  })

  test("returns the engine's own explanation of a failure", () => {
    expect(parsePolishResult('{"error":"falta la variable de sistema GROQ_API_KEY"}')).toEqual({
      error: "falta la variable de sistema GROQ_API_KEY",
    })
  })

  test("an empty answer is a failure, never empty text", () => {
    expect(parsePolishResult('{"text":"   "}')).toEqual({ error: "Groq no devolvió texto" })
    expect(parsePolishResult("  ")).toEqual({ error: "el motor no respondió" })
  })

  test("a response that is not JSON is reported instead of thrown", () => {
    expect(parsePolishResult("Traceback: boom")).toEqual({ error: "Traceback: boom" })
  })
})

describe("createPolisher", () => {
  test("sends the model, the system prompt and the text on stdin", async () => {
    const fake = fakeChild('{"text":"arreglado"}')
    const polish = createPolisher({
      platform: "darwin",
      root: "/plugin",
      python: "python3",
      spawn: () => fake.child,
    })

    expect(await polish({ text: "hola ca" })).toEqual({ text: "arreglado" })

    const sent = JSON.parse(fake.written.join("")) as { model: string; system: string; text: string }
    expect(sent.text).toBe("hola ca")
    expect(sent.model).toBe(POLISH_MODEL)
    expect(sent.system).toBe(POLISH_SYSTEM)
    expect(fake.ended()).toBe(true)
  })

  test("a process that cannot start is a reported failure", async () => {
    const polish = createPolisher({
      platform: "darwin",
      root: "/plugin",
      python: "python3",
      spawn: () => {
        throw new Error("python3: not found")
      },
    })

    expect(await polish({ text: "hola" })).toEqual({ error: "python3: not found" })
  })

})
