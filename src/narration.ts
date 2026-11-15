/**
 * Narration: the text of a reply, read aloud through the portable engine.
 *
 * The engine contract is the original one (`engine/speak.ps1` and
 * `engine/speak.py`): the text, the voice and a control file arrive in the
 * environment, the process prints `voice <name>` once the audio starts, a dot
 * every tenth of a second, and `error ...` on failure. Writing `pause` or
 * `play` into the control file pauses and resumes the sound.
 *
 * Everything here is pure except `Narration`, which receives the process, the
 * control write and the state change as arguments, so the state machine is
 * testable without a terminal or a speaker.
 */

import { posix, win32 } from "node:path"

import type { SpeechState } from "./footer"
import { SpeechSession, type SpeakingProcess } from "./speech"

export type { SpeakingProcess } from "./speech"

/** The speed the original narrates at: 1.3×, said as `+30%` by the engine. */
export const SPEED = 1.3

/**
 * How much of a reply is narrated at all. The text travels in an environment
 * variable, and a process environment cannot carry more than about 32 KB on
 * Windows, so a very long reply is read up to this point instead of failing.
 */
export const MAX_TEXT = 8000

/** How much of a narration's text names its file. */
export const HISTORY_NAME_LENGTH = 40

/** One narration, as the engine receives it. */
export interface SpeakRequest {
  readonly text: string
  readonly voice: string
  readonly speed: number
  readonly controlPath: string
  readonly savePath?: string
}

/** The engine under way: its output and the way to end it. */
export type Speak = (request: SpeakRequest) => SpeakingProcess

/**
 * The reply as a speech synthesizer reads it: no code, links or markers. The
 * same transformations, in the same order, as the original plugin.
 */
export function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*\|?[\s:-]*\|[\s|:-]*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** When something was kept, local time, as the file names carry it: `yy-mm-dd_hh-mm-ss`. */
export function stampOf(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    [pad(now.getFullYear() % 100), pad(now.getMonth() + 1), pad(now.getDate())].join("-") +
    "_" +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("-")
  )
}

/** A narration's file name: the start of its text, safe in a file name, then when it was written. */
export function historyName(text: string, now: Date): string {
  const start = Array.from(
    text
      .replace(/\p{Cc}/gu, " ")
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, HISTORY_NAME_LENGTH)
    .join("")
    .trim()
  const description = start.replace(/ /g, "-") || "audio"
  return `${description}-${stampOf(now)}.mp3`
}

/** A kept narration's name split in its description and its stamp. */
export function historySplit(name: string): { description: string; stamp: string } {
  const match = /-(\d{2}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-\d+)?(?:\.mp3)?$/i.exec(name)
  return match ? { description: name.slice(0, match.index), stamp: match[1] ?? "" } : { description: name, stamp: "" }
}

/** The command that speaks `request`: PowerShell on Windows, Python everywhere else. */
export function speakCommand(input: {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
  readonly request: SpeakRequest
}): { argv: string[]; env: Record<string, string> } {
  const { platform, root, python, request } = input
  const join = platform === "win32" ? win32.join : posix.join

  const argv =
    platform === "win32"
      ? [
          "powershell",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(root, "engine", "speak.ps1"),
        ]
      : [python, join(root, "engine", "speak.py")]

  const env: Record<string, string> = {
    NARRATOR_TEXT: request.text,
    NARRATOR_VOICE: request.voice,
    NARRATOR_SPEED: String(request.speed),
    NARRATOR_CONTROL: request.controlPath,
    NARRATOR_PYTHON: python,
  }
  if (request.savePath) env.NARRATOR_SAVE_AS = request.savePath

  return { argv, env }
}

export interface NarrationOptions {
  readonly speak: Speak
  /** A fresh control file path per narration, so two sessions never pause each other. */
  readonly controlPath: () => string
  /** Where the narration is kept for the history, when it is kept at all. */
  readonly savePath: (input: { readonly text: string; readonly voice: string }) => string | undefined
  readonly writeControl: (path: string, asked: "pause" | "play") => Promise<void>
  /** Removes the control file once the narration is over, so none is left behind. */
  readonly removeControl?: (path: string) => Promise<void>
  readonly onState: (state: SpeechState) => void
  readonly onError?: (message: string) => void
}

/**
 * One narration at a time. Starting another ends the one before it, switching
 * the narrator off pauses rather than stops, and the engine's own `voice` line
 * is what moves the footer from thinking to playing.
 */
export class Narration {
  readonly #options: NarrationOptions
  readonly #session: SpeechSession

  constructor(options: NarrationOptions) {
    this.#options = options
    this.#session = new SpeechSession(options)
  }

  get state(): SpeechState {
    return this.#session.state
  }

  async narrate(input: { readonly text: string; readonly voice: string }): Promise<void> {
    const text = input.text.trim().slice(0, MAX_TEXT)
    if (!text || !input.voice) {
      await this.#session.stop()
      return
    }

    await this.#session.run({
      initial: "thinking",
      flipOnVoice: true,
      start: (control) =>
        this.#options.speak({
          text,
          voice: input.voice,
          speed: SPEED,
          controlPath: control,
          savePath: this.#options.savePath({ text, voice: input.voice }),
        }),
    })
  }

  pause(): Promise<void> {
    return this.#session.pause()
  }

  resume(): Promise<void> {
    return this.#session.resume()
  }

  stop(): Promise<void> {
    return this.#session.stop()
  }
}
