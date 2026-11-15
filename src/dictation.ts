/**
 * Dictation: the microphone, transcribed by the engine.
 *
 * `engine/listen.py` streams the words the model commits on stdout — `ready`
 * once it is listening, `text <phrase> <words>` for each committed piece,
 * `partial <phrase> <text>` for what it still guesses, `error <why>` on
 * failure — and stops when `stop` is written into its control file.
 *
 * OpenCode 2.3.0 exposes no API to insert text into the prompt, so the port
 * cannot append the words as the original did. The session still runs the same
 * engine and collects the same phrases; the caller decides what to do with
 * them. Everything here is pure except `Dictation`, which receives the process
 * and the control write, so the parsing and the state machine are testable.
 */

import { posix, win32 } from "node:path"

/** What one line of the engine's output means. */
export type ListenEvent =
  | { readonly kind: "ready" }
  | { readonly kind: "text"; readonly phrase: number; readonly words: string }
  | { readonly kind: "partial"; readonly phrase: number; readonly text: string }
  | { readonly kind: "done" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "other" }

/** Reads one whole line; anything the engine did not promise is ignored. */
export function parseListenLine(line: string): ListenEvent {
  if (line === "ready") return { kind: "ready" }
  if (line === "done") return { kind: "done" }
  if (line.startsWith("error ")) return { kind: "error", message: line.slice("error ".length) }

  const match = /^(partial|text) (\d+) ?(.*)$/.exec(line)
  if (!match) return { kind: "other" }

  const phrase = Number(match[2])
  const body = match[3] ?? ""
  return match[1] === "partial"
    ? { kind: "partial", phrase, text: body }
    : { kind: "text", phrase, words: body }
}

/** Dictation as it starts: the language to hear and the microphone to use. */
export interface ListenRequest {
  readonly language: string
  readonly controlPath: string
  /** Part of a microphone's name; absent, the system's default. */
  readonly microphone?: string
}

/** The dictation engine under way. */
export interface ListeningProcess {
  readonly output: AsyncIterable<string>
  stop(): void
}

export type Listen = (request: ListenRequest) => ListeningProcess

/**
 * The command that starts dictation, exactly as `listen.py` documents it:
 * `listen.py LANGUAGE CONTROL_FILE [MICROPHONE]`. The microphone is part of a
 * name, so a missing one leaves the system's default.
 */
export function listenCommand(input: {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
  readonly request: ListenRequest
}): { argv: string[]; env: Record<string, string> } {
  const join = input.platform === "win32" ? win32.join : posix.join
  const argv = [
    input.python,
    "-u",
    join(input.root, "engine", "listen.py"),
    input.request.language,
    input.request.controlPath,
  ]
  if (input.request.microphone) argv.push(input.request.microphone)

  return { argv, env: { PYTHONIOENCODING: "utf-8" } }
}

/** How dictation appends the words it hears. */
export interface DictationOptions {
  readonly listen: Listen
  readonly controlPath: () => string
  /** Writes the word the engine reads: `listen` to start, `stop` to end. */
  readonly writeControl: (path: string, asked: "listen" | "stop") => Promise<void>
  readonly removeControl?: (path: string) => Promise<void>
  readonly onState: (state: "off" | "loading" | "on") => void
  /** One piece the model committed: append it as it comes. */
  readonly onText: (words: string) => void
  /** What it still guesses at, for the caller to show above the transcript. */
  readonly onPartial?: (text: string) => void
  readonly onError?: (message: string) => void
}

/**
 * One dictation at a time. The microphone records while the model loads, so
 * nothing said in that window is lost; the state stays `loading` until the
 * engine says `ready`, and `off` is only reported once its process has ended.
 */
export class Dictation {
  readonly #options: DictationOptions
  #state: "off" | "loading" | "on" = "off"
  #process: ListeningProcess | undefined
  #control: string | undefined
  #token: object | undefined

  constructor(options: DictationOptions) {
    this.#options = options
  }

  get state(): "off" | "loading" | "on" {
    return this.#state
  }

  #set(state: "off" | "loading" | "on"): void {
    this.#state = state
    this.#options.onState(state)
  }

  async #removeControl(path: string): Promise<void> {
    if (!this.#options.removeControl) return
    try {
      await this.#options.removeControl(path)
    } catch {
      // Already gone, or the directory is unwritable: nothing to do.
    }
  }

  async start(language: string, microphone?: string): Promise<void> {
    await this.stop()

    const control = this.#options.controlPath()
    const token = {}
    this.#token = token
    this.#control = control
    this.#set("loading")

    try {
      await this.#options.writeControl(control, "listen")
      if (this.#token !== token) return

      const process = this.#options.listen({ language, controlPath: control, microphone })
      this.#process = process

      let rest = ""
      for await (const chunk of process.output) {
        rest += chunk
        const lines = rest.split(/\r?\n/)
        rest = lines.pop() ?? ""
        for (const line of lines) this.#line(line, token)
      }
      if (rest) this.#line(rest, token)
    } catch (error) {
      this.#options.onError?.(error instanceof Error ? error.message : String(error))
    } finally {
      if (this.#token === token) {
        this.#token = undefined
        this.#process = undefined
        this.#control = undefined
        await this.#removeControl(control)
        this.#set("off")
      }
    }
  }

  #line(line: string, token: object): void {
    if (this.#token !== token) return
    const event = parseListenLine(line)
    if (event.kind === "ready") {
      if (this.#state === "loading") this.#set("on")
      return
    }
    if (event.kind === "text") {
      this.#options.onText(event.words)
      return
    }
    if (event.kind === "partial") {
      this.#options.onPartial?.(event.text)
      return
    }
    if (event.kind === "error") this.#options.onError?.(event.message)
  }

  /** Ends the dictation: the phrase under way is still written out first. */
  async stop(): Promise<void> {
    const control = this.#control
    if (!control) {
      this.#set("off")
      return
    }
    this.#process?.stop()
    this.#token = undefined
    this.#process = undefined
    this.#control = undefined
    await this.#removeControl(control)
    this.#set("off")
  }

  /** Asks the engine to finish, keeping the state until it does. */
  async finish(): Promise<void> {
    if (!this.#control) {
      this.#set("off")
      return
    }
    this.#set("loading")
    try {
      await this.#options.writeControl(this.#control, "stop")
    } catch (error) {
      this.#options.onError?.(error instanceof Error ? error.message : String(error))
      await this.stop()
    }
  }
}
