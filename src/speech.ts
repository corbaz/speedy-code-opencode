/**
 * One sound at a time, through one control file.
 *
 * Both the narrated reply (`engine/speak.ps1`, `speak.py`) and a kept narration
 * played back (`engine/play.ps1`, `play.py`) obey the same contract: the process
 * prints a dot every tenth of a second, `voice <name>` means the sound started,
 * `error ...` means it failed, and writing `pause` or `play` into a control file
 * pauses and resumes it. This session owns that contract once, so the two
 * callers only say how to start their process and which state it begins in.
 */

import type { SpeechState } from "./footer"

/** The engine under way: its output and the way to end it. */
export interface SpeakingProcess {
  readonly output: AsyncIterable<string>
  stop(): void
}

export interface SpeechOptions {
  /** A fresh control file path per sound, so two sounds never pause each other. */
  readonly controlPath: () => string
  readonly writeControl: (path: string, asked: "pause" | "play") => Promise<void>
  /** Removes the control file once the sound is over, so none is left behind. */
  readonly removeControl?: (path: string) => Promise<void>
  readonly onState: (state: SpeechState) => void
  readonly onError?: (message: string) => void
}

/** How one sound starts: with the control file its caller has to write. */
export interface SpeechRun {
  readonly start: (control: string) => SpeakingProcess
  /** The state before the process says it is sounding. */
  readonly initial: SpeechState
  /** Whether the engine's `voice ...` line moves thinking to playing. */
  readonly flipOnVoice?: boolean
}

export class SpeechSession {
  readonly #options: SpeechOptions
  #state: SpeechState = "idle"
  #process: SpeakingProcess | undefined
  #control: string | undefined
  /** Identifies the sound under way, so a stop mid-start is never overwritten by it. */
  #token: object | undefined

  constructor(options: SpeechOptions) {
    this.#options = options
  }

  get state(): SpeechState {
    return this.#state
  }

  #set(state: SpeechState): void {
    this.#state = state
    this.#options.onState(state)
  }

  async #removeControl(path: string): Promise<void> {
    if (!this.#options.removeControl) return
    try {
      await this.#options.removeControl(path)
    } catch {
      // The file is already gone, or the directory is unwritable: nothing to do.
    }
  }

  /** Plays one sound, ending whatever was playing before it. */
  async run(input: SpeechRun): Promise<void> {
    await this.stop()

    const control = this.#options.controlPath()
    const token = {}
    this.#token = token
    this.#control = control
    this.#set(input.initial)

    let process: SpeakingProcess | undefined
    try {
      await this.#options.writeControl(control, "play")
      // A stop issued while the control file was written must win over this sound.
      if (this.#token !== token) return

      process = input.start(control)
      this.#process = process

      let rest = ""
      for await (const chunk of process.output) {
        rest += chunk
        const lines = rest.split(/\r?\n/)
        rest = lines.pop() ?? ""
        for (const line of lines) this.#line(line, input)
      }
      if (rest) this.#line(rest, input)
    } catch (error) {
      this.#options.onError?.(error instanceof Error ? error.message : String(error))
    } finally {
      if (this.#token === token) {
        this.#token = undefined
        this.#process = undefined
        this.#control = undefined
        await this.#removeControl(control)
        this.#set("idle")
      }
    }
  }

  /** One complete line the engine printed. */
  #line(line: string, input: SpeechRun): void {
    if (input.flipOnVoice && line.startsWith("voice ") && this.#state === "thinking") this.#set("playing")
    if (line.startsWith("error ")) this.#options.onError?.(line.slice("error ".length))
  }

  async pause(): Promise<void> {
    const control = this.#control
    if (!control) return
    try {
      await this.#options.writeControl(control, "pause")
      if (this.#control === control) this.#set("paused")
    } catch (error) {
      this.#options.onError?.(error instanceof Error ? error.message : String(error))
    }
  }

  async resume(): Promise<void> {
    const control = this.#control
    if (!control) return
    try {
      await this.#options.writeControl(control, "play")
      if (this.#control === control) this.#set("playing")
    } catch (error) {
      this.#options.onError?.(error instanceof Error ? error.message : String(error))
    }
  }

  async stop(): Promise<void> {
    const control = this.#control
    this.#process?.stop()
    this.#token = undefined
    this.#process = undefined
    this.#control = undefined
    if (control) await this.#removeControl(control)
    this.#set("idle")
  }
}
