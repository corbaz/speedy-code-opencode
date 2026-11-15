/**
 * The bridge between the narration state machine and the portable engine.
 *
 * The engine scripts are the original ones: the reply text, the voice and the
 * control file travel in the environment, and the process reports what happens
 * on stdout. This module owns the three things the original host inherited from
 * Electron and had to be rebuilt here: a missing interpreter must become an
 * `error ...` line instead of an uncaught exception, a chatty engine must not
 * stall on its own stderr, and a Windows stop must reach the child process the
 * PowerShell wrapper delegates to.
 */

import { spawn as nodeSpawn } from "node:child_process"

import { speakCommand, type Speak, type SpeakRequest, type SpeakingProcess } from "./narration"

/** What this module needs of a child process. */
export interface ChildLike {
  readonly pid?: number
  readonly stdout?: AsyncIterable<string | Uint8Array>
  readonly stderr?: AsyncIterable<string | Uint8Array>
  on(event: string, listener: (value?: unknown) => void): unknown
  kill(signal?: string): boolean
}

export interface SpeakerOptions {
  readonly platform: NodeJS.Platform
  readonly root: string
  readonly python: string
  /** Starts the process. Defaults to `node:child_process`. */
  readonly spawn?: (argv: readonly string[], env: Record<string, string>) => ChildLike
  /** Ends the process and the children it started. Defaults to `taskkill /T` on Windows. */
  readonly killTree?: (pid: number) => void
}

/** A queue an async iterator reads, so events and chunks arrive in one order. */
function channel(): {
  push: (chunk: string) => void
  close: () => void
  readonly output: AsyncIterable<string>
} {
  const pending: string[] = []
  let waiting: ((result: IteratorResult<string>) => void) | undefined
  let closed = false

  const settle = () => {
    if (!waiting) return
    const resolve = waiting
    waiting = undefined
    const next = pending.shift()
    resolve(next === undefined ? { done: true, value: undefined } : { done: false, value: next })
  }

  return {
    push: (chunk) => {
      if (closed) return
      pending.push(chunk)
      settle()
    },
    close: () => {
      if (closed) return
      closed = true
      settle()
    },
    output: {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        return {
          next: () => {
            const next = pending.shift()
            if (next !== undefined) return Promise.resolve({ done: false, value: next })
            if (closed) return Promise.resolve({ done: true, value: undefined })
            return new Promise<IteratorResult<string>>((resolve) => {
              waiting = resolve
            })
          },
        }
      },
    },
  }
}

/** Reads everything the engine writes to stderr, so its pipe never fills. */
async function drain(stream: AsyncIterable<string | Uint8Array> | undefined): Promise<void> {
  if (!stream) return
  try {
    for await (const _chunk of stream) {
      // The engine's stderr is diagnostics only: it is read and dropped.
    }
  } catch {
    // A stream that fails to read is already unusable.
  }
}

/** Ends a Windows engine and the Python child its wrapper starts. */
function taskkill(pid: number): void {
  try {
    nodeSpawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
  } catch {
    // Nothing else to try: the wrapper is already gone.
  }
}

/**
 * Speaks one request through the engine. Every way the process can fail while
 * starting becomes an `error ...` line in the output, which is the contract the
 * engine itself uses, so the narration machine has one failure path only.
 */
export function createSpeaker(options: SpeakerOptions): Speak {
  const run = options.spawn ?? defaultSpawn

  return (request: SpeakRequest): SpeakingProcess => {
    const command = speakCommand({
      platform: options.platform,
      root: options.root,
      python: options.python,
      request,
    })

    const output = channel()

    let child: ChildLike
    try {
      child = run(command.argv, command.env)
    } catch (error) {
      output.push(`error ${messageOf(error)}\n`)
      output.close()
      return { stop: () => {}, output: output.output }
    }

    void drain(child.stderr)

    child.on("error", (value) => {
      const error = value as unknown as Error | undefined
      output.push(`error ${messageOf(error)}\n`)
      output.close()
    })

    void (async () => {
      try {
        for await (const chunk of child.stdout ?? []) output.push(String(chunk))
      } catch (error) {
        output.push(`error ${messageOf(error)}\n`)
      } finally {
        output.close()
      }
    })()

    return {
      stop: () => {
        if (options.platform === "win32" && typeof child.pid === "number") {
          const stop = options.killTree ?? taskkill
          stop(child.pid)
          return
        }
        child.kill()
      },
      output: output.output,
    }
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return error === undefined ? "unknown engine failure" : String(error)
}

function defaultSpawn(argv: readonly string[], env: Record<string, string>): ChildLike {
  const [command, ...args] = argv
  if (!command) throw new Error("the engine command is empty")

  return nodeSpawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }) as unknown as ChildLike
}
