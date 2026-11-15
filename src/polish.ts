/**
 * The wand: cleans up the reply on screen.
 *
 * `engine/polish.py` reads one JSON object on stdin — `{"model", "system",
 * "text"}` — and prints one on stdout, `{"text"}` or `{"error"}`, both pure
 * ASCII so no encoding on the way can break an accent. The key is the system's
 * `GROQ_API_KEY`. This module owns that contract; the process itself is
 * injected, so the parsing is testable without Groq.
 */

import { spawn as nodeSpawn } from "node:child_process"
import { posix, win32 } from "node:path"

/** The model the original polishes with. */
export const POLISH_MODEL = "openai/gpt-oss-120b"

/** What the wand is asked to do, word for word as the original says it. */
export const POLISH_SYSTEM = `You clean up a message a developer is about to send to an AI coding assistant. It was dictated to a microphone and transcribed, typed by hand, or both.

Return the same message, improved:
- Fix grammar, spelling, punctuation and syntax.
- Fix words the transcription most likely misheard, using the context: technical terms above all (pitest -> pytest, empoint -> endpoint, log de React -> hook de React, use effect -> useEffect).
- Put spoken thoughts in a clear, logical order; drop fillers, repetitions and false starts.
- Keep every marker like [[1]] exactly as it is, where it belongs in the message: it stands for an attached image or text.
- Keep the person's language, voice and register (rioplatense Spanish stays rioplatense) and keep English technical terms in English.
- Keep every request, detail, name, path, number and piece of code. Add nothing, answer nothing, explain nothing.

Answer with the improved message alone: no quotes, no preamble, no notes.`

/** What the wand gets. */
export interface PolishRequest {
  readonly text: string
  readonly model?: string
  readonly system?: string
}

/** What the wand answers: the improved message, or why it could not. */
export type PolishResult = { readonly text: string } | { readonly error: string }

export type Polish = (request: PolishRequest) => Promise<PolishResult>

/** The command that runs the wand. */
export function polishCommand(input: {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
}): { argv: string[]; env: Record<string, string> } {
  const join = input.platform === "win32" ? win32.join : posix.join
  return {
    argv: [input.python, join(input.root, "engine", "polish.py")],
    env: { PYTHONIOENCODING: "utf-8" },
  }
}

/** One JSON object the wand prints, read without letting a bad one crash the host. */
export function parsePolishResult(output: string): PolishResult {
  const trimmed = output.trim()
  if (!trimmed) return { error: "el motor no respondió" }

  try {
    const answer = JSON.parse(trimmed) as { text?: unknown; error?: unknown }
    if (typeof answer.error === "string" && answer.error) return { error: answer.error }
    if (typeof answer.text === "string" && answer.text.trim()) return { text: answer.text.trim() }
    return { error: "Groq no devolvió texto" }
  } catch {
    return { error: trimmed.slice(0, 200) }
  }
}

/** What this module needs of the process it starts. */
export interface PolishChild {
  readonly stdin?: { write(chunk: string): unknown; end(): unknown }
  readonly stdout?: AsyncIterable<string | Uint8Array>
  on(event: string, listener: (value?: unknown) => void): unknown
}

/** The wand as a real process: stdin in, one JSON object out. */
export function createPolisher(options: {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
  readonly spawn?: (argv: readonly string[], env: Record<string, string>) => PolishChild
}): Polish {
  const command = polishCommand(options)
  const run =
    options.spawn ??
    ((argv: readonly string[], env: Record<string, string>) =>
      nodeSpawn(argv[ 0 ] ?? "", [...argv.slice(1)], {
        env: { ...process.env, ...env },
        stdio: "pipe",
        windowsHide: true,
      }) as unknown as PolishChild)

  return async (request: PolishRequest): Promise<PolishResult> => {
    let child: PolishChild
    try {
      child = run(command.argv, command.env)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }

    const failed = new Promise<never>((_resolve, reject) => {
      child.on("error", reject)
    })
    const output = (async () => {
      let text = ""
      for await (const chunk of child.stdout ?? []) text += String(chunk)
      return text
    })()

    try {
      child.stdin?.write(
        `${JSON.stringify({
          model: request.model ?? POLISH_MODEL,
          system: request.system ?? POLISH_SYSTEM,
          text: request.text,
        })}\n`,
      )
      child.stdin?.end()
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }

    try {
      return parsePolishResult(await Promise.race([output, failed]))
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
}
