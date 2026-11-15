import { describe, expect, test } from "bun:test"

import { Dictation, listenCommand, parseListenLine, type ListeningProcess } from "../src/dictation"

async function flush() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** A process the test drives by hand: output is released with `release()`. */
function gatedProcess(chunks: readonly string[]) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const state = { stopped: false }
  const process: ListeningProcess = {
    stop: () => {
      state.stopped = true
    },
    output: (async function* () {
      await gate
      for (const chunk of chunks) yield chunk
    })(),
  }
  return { process, state, release }
}

function plainProcess(chunks: readonly string[]) {
  const state = { stopped: false }
  const process: ListeningProcess = {
    stop: () => {
      state.stopped = true
    },
    output: (async function* () {
      for (const chunk of chunks) yield chunk
    })(),
  }
  return { process, state }
}

describe("parseListenLine", () => {
  test("recognizes the lines the engine promises", () => {
    expect(parseListenLine("ready")).toEqual({ kind: "ready" })
    expect(parseListenLine("done")).toEqual({ kind: "done" })
    expect(parseListenLine("error no microphone")).toEqual({ kind: "error", message: "no microphone" })
  })

  test("reads a committed piece with its phrase number and words", () => {
    expect(parseListenLine("text 3 hola mundo")).toEqual({ kind: "text", phrase: 3, words: "hola mundo" })
  })

  test("keeps the leading space a piece carries when it belongs to the word before it", () => {
    expect(parseListenLine("text 2  y sigue")).toEqual({ kind: "text", phrase: 2, words: " y sigue" })
  })

  test("reads what the model still guesses at", () => {
    expect(parseListenLine("partial 1 hola ca")).toEqual({ kind: "partial", phrase: 1, text: "hola ca" })
  })

  test("ignores anything else the engine prints", () => {
    expect(parseListenLine("warning: model slow")).toEqual({ kind: "other" })
    expect(parseListenLine("")).toEqual({ kind: "other" })
  })
})

describe("listenCommand", () => {
  test("passes the language, the control file and the microphone on Windows", () => {
    const command = listenCommand({
      platform: "win32",
      root: "C:\\plugin",
      python: "C:\\venv\\python.exe",
      request: { language: "es", controlPath: "C:\\control\\listen.txt", microphone: "JBL Tune 520BT" },
    })

    expect(command.argv).toEqual([
      "C:\\venv\\python.exe",
      "-u",
      "C:\\plugin\\engine\\listen.py",
      "es",
      "C:\\control\\listen.txt",
      "JBL Tune 520BT",
    ])
    expect(command.env).toEqual({ PYTHONIOENCODING: "utf-8" })
  })

  test("leaves the microphone out when none was chosen", () => {
    const command = listenCommand({
      platform: "darwin",
      root: "/plugin",
      python: "/venv/bin/python",
      request: { language: "en", controlPath: "/control/listen.txt" },
    })

    expect(command.argv).toEqual(["/venv/bin/python", "-u", "/plugin/engine/listen.py", "en", "/control/listen.txt"])
  })
})

describe("Dictation", () => {
  test("reports loading, then on once the engine is listening, and collects each phrase", async () => {
    const fake = plainProcess(["ready\n", "text 1 hola\n", "text 2  mundo\n", "done\n"])
    const states: string[] = []
    const heard: string[] = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async () => {},
      onState: (state) => states.push(state),
      onText: (words) => heard.push(words),
    })

    await dictation.start("es")

    expect(states).toEqual(["off", "loading", "on", "off"])
    expect(heard).toEqual(["hola", " mundo"])
    expect(dictation.state).toBe("off")
  })

  test("passes what the model still guesses at without appending it", async () => {
    const fake = plainProcess(["ready\n", "partial 1 hola ca\n"])
    const partials: string[] = []
    const heard: string[] = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async () => {},
      onState: () => {},
      onText: (words) => heard.push(words),
      onPartial: (text) => partials.push(text),
    })

    await dictation.start("es")

    expect(partials).toEqual(["hola ca"])
    expect(heard).toEqual([])
  })

  test("reports an engine failure", async () => {
    const fake = plainProcess(["error no microphone\n"])
    const errors: string[] = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async () => {},
      onState: () => {},
      onText: () => {},
      onError: (message) => errors.push(message),
    })

    await dictation.start("es")

    expect(errors).toEqual(["no microphone"])
  })

  test("asks the engine to finish and keeps listening until it does", async () => {
    const fake = gatedProcess(["ready\n", "text 1 hola\n"])
    const written: Array<"listen" | "stop"> = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async (_path, asked) => {
        written.push(asked)
      },
      onState: () => {},
      onText: () => {},
    })

    const running = dictation.start("es")
    await flush()
    await dictation.finish()

    expect(written).toEqual(["listen", "stop"])
    expect(dictation.state).toBe("loading")

    fake.release()
    await running
    expect(dictation.state).toBe("off")
  })

  test("stops the engine and removes its control file", async () => {
    const fake = gatedProcess(["ready\n"])
    const removed: string[] = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async () => {},
      removeControl: async (path) => {
        removed.push(path)
      },
      onState: () => {},
      onText: () => {},
    })

    const running = dictation.start("es")
    await flush()
    await dictation.stop()

    expect(fake.state.stopped).toBe(true)
    expect(removed).toEqual(["listen.txt"])
    expect(dictation.state).toBe("off")

    fake.release()
    await running
  })

  test("starting a second dictation leaves one engine listening", async () => {
    const first = gatedProcess(["ready\n", "text 1 viejo\n"])
    const second = gatedProcess(["ready\n", "text 1 nuevo\n"])
    const heard: string[] = []
    const processes = [first, second]
    let started = 0
    const dictation = new Dictation({
      listen: () => {
        started += 1
        return (processes[started - 1] ?? second).process
      },
      controlPath: () => `listen-${started + 1}.txt`,
      writeControl: async () => {},
      onState: () => {},
      onText: (words) => heard.push(words),
    })

    const running = dictation.start("es")
    await flush()
    const again = dictation.start("es")
    await flush()

    first.release()
    second.release()
    await Promise.all([running, again])

    expect(started).toBe(2)
    expect(first.state.stopped).toBe(true)
    expect(heard).toEqual(["nuevo"])
    expect(dictation.state).toBe("off")
  })

  test("reports a control file that cannot be written and goes off", async () => {
    const fake = plainProcess([])
    const errors: string[] = []
    const states: string[] = []
    const dictation = new Dictation({
      listen: () => fake.process,
      controlPath: () => "listen.txt",
      writeControl: async () => {
        throw new Error("EACCES: permission denied")
      },
      onState: (state) => states.push(state),
      onText: () => {},
      onError: (message) => errors.push(message),
    })

    await dictation.start("es")

    expect(errors).toEqual(["EACCES: permission denied"])
    expect(states).toEqual(["off", "loading", "off"])
    expect(dictation.state).toBe("off")
  })
})
