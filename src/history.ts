/**
 * The narrations kept on disk, and playing one back.
 *
 * `engine/speak.ps1` and `speak.py` save every narration under the data root's
 * `audio` folder; `engine/play.ps1` and `play.py` play one back through the same
 * control-file contract the narration uses. This module lists what was kept and
 * drives the player, so the history menu only chooses a clip.
 */

import { readdir, stat } from "node:fs/promises"
import { join, posix, win32 } from "node:path"

import type { SpeechState } from "./footer"
import { POWERSHELL } from "./powershell"
import { SpeechSession, type SpeakingProcess } from "./speech"

/** How many of the newest narrations the history lists and plays. */
export const HISTORY_LENGTH = 10

/** One kept narration. */
export interface HistoryClip {
  readonly path: string
  /** Its file name without the `.mp3`. */
  readonly name: string
}

/** One kept narration as the menu shows it: split for the aligned columns. */
export function clipParts(clip: HistoryClip): { description: string; stamp: string } {
  const match = /-(\d{2}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-\d+)?$/.exec(clip.name)
  return match
    ? { description: clip.name.slice(0, match.index), stamp: match[1] ?? "" }
    : { description: clip.name, stamp: "" }
}

/** How the history folder is read, so the listing is testable without a disk. */
export interface Directory {
  /** The narration files in `dir`, as names. */
  readonly read: (dir: string) => Promise<readonly string[]>
  /** When one file was last written, in milliseconds. */
  readonly modified: (path: string) => Promise<number>
  readonly join: (dir: string, name: string) => string
}

/** The real folder. */
export const fileDirectory: Directory = {
  read: async (dir) => (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".mp3")),
  modified: async (path) => (await stat(path)).mtimeMs,
  join,
}

/**
 * The newest narrations kept in `dir`, newest first. A folder that cannot be
 * read holds nothing, which is what a fresh install looks like.
 */
export async function listClips(
  dir: string,
  limit = HISTORY_LENGTH,
  directory: Directory = fileDirectory,
): Promise<HistoryClip[]> {
  let names: readonly string[]
  try {
    names = await directory.read(dir)
  } catch {
    return []
  }

  const files = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith(".mp3"))
      .map(async (name) => {
      const path = directory.join(dir, name)
      let modified = 0
      try {
        modified = await directory.modified(path)
      } catch {
        modified = 0
      }
      return { path, name: name.replace(/\.mp3$/i, ""), modified }
    }),
  )

  return files
    .sort((left, right) => right.modified - left.modified)
    .slice(0, limit)
    .map(({ path, name }) => ({ path, name }))
}

/** One clip to play, as the engine receives it. */
export interface PlayRequest {
  readonly clip: string
  /** The control file the pause button writes into. */
  readonly controlPath: string
}

export type Play = (request: PlayRequest) => SpeakingProcess

/** The command that plays `clip`: PowerShell on Windows, Python everywhere else. */
export function playCommand(input: {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
  readonly clip: string
  readonly control: string
}): { argv: string[]; env: Record<string, string> } {
  const { platform, root, python, clip, control } = input
  const join = platform === "win32" ? win32.join : posix.join

  const argv =
    platform === "win32"
      ? [
          POWERSHELL,
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(root, "engine", "play.ps1"),
        ]
      : [python, join(root, "engine", "play.py")]

  return { argv, env: { SPEEDY_CLIP: clip, SPEEDY_CONTROL: control } }
}

export interface ClipPlayerOptions {
  readonly play: Play
  readonly controlPath: () => string
  readonly writeControl: (path: string, asked: "pause" | "play") => Promise<void>
  readonly removeControl?: (path: string) => Promise<void>
  readonly onState: (state: SpeechState) => void
  readonly onError?: (message: string) => void
}

/**
 * Plays one kept narration, pausable and resumable exactly as a fresh narration
 * is: the footer's play control drives both, and both report the same states.
 */
export class ClipPlayer {
  readonly #options: ClipPlayerOptions
  readonly #session: SpeechSession

  constructor(options: ClipPlayerOptions) {
    this.#options = options
    this.#session = new SpeechSession(options)
  }

  get state(): SpeechState {
    return this.#session.state
  }

  async play(clip: HistoryClip): Promise<void> {
    await this.#session.run({
      initial: "playing",
      start: (control) => this.#options.play({ clip: clip.path, controlPath: control }),
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
