/**
 * Another machine's disk in the explorer, reached by ssh: a Mac's files in the explorer of Windows.
 *
 * The explorer writes such a path `mac:/Users/ana`: the machine, as ssh knows it, then its own path. The
 * engine's remote.py does the asking (a folder's entries, what a path is, a file's copy here, a search of
 * its disk), and `withRemotes` puts it under the explorer's own IO: a path of another machine goes to
 * remote.py, any other to the IO it was given. Nothing here runs a program itself: the `RemoteRunner` does.
 */

import { remoteOf, type ExplorerIO, type FsEntry } from "./explorer"
import type { FileCommand } from "./file-tools"

/** What remote.py is asked: the machines there are, a folder's entries, what a path is, a file's copy here, a search. */
export type RemoteMode = "hosts" | "mounts" | "list" | "stat" | "fetch" | "find" | "home" | "pause" | "pull" | "push" | "paste" | "mkdir"

/** remote.py run for one asking; the machine, the path and the pattern go in by the environment. */
export function remoteCommand(mode: RemoteMode, pluginRoot: string, python: string, env: Record<string, string> = {}): FileCommand {
  return { argv: [python, `${pluginRoot.replace(/[\\/]+$/, "")}/engine/remote.py`, mode], env }
}

/** What remote.py answered: the JSON of its last line, or nothing when it said none. */
export function remoteAnswer(stdout: string): unknown {
  try {
    return JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? "") as unknown
  } catch {
    return undefined
  }
}

/** One field of an answer, when it is there. */
const field = (said: unknown, name: string): unknown =>
  said && typeof said === "object" && !Array.isArray(said) ? (said as Record<string, unknown>)[name] : undefined

/** What runs remote.py: an asking answered once, and a search that says lines until it ends or is stopped. */
export interface RemoteRunner {
  ask(mode: "hosts" | "mounts" | "list" | "stat" | "fetch" | "home", host: string, path: string): Promise<unknown>
  /**
   * remote.py run for what goes by the environment alone: a search held or let go (`pause`), a file or a folder
   * from the machine here (`pull`), from here to it (`push`), or within it (`paste`), a folder made there (`mkdir`).
   */
  run(mode: "pause" | "pull" | "push" | "paste" | "mkdir", env: Record<string, string>): Promise<unknown>
  /** A search of the machine's disk; `token` is what it is held by. */
  find(host: string, pattern: string, most: number, token: string, onLine: (line: string) => void, onEnd: () => void): () => void
}

/**
 * The explorer's IO with the other machines' disks under it. A file of another machine is fetched before
 * the viewer shows it or the clipboard takes it; `platform` says how this machine writes the copy's path.
 */
export function withRemotes(io: ExplorerIO, runner: RemoteRunner, platform: string): ExplorerIO {
  const nameOf = (path: string) => path.split("/").pop() ?? path
  // The copy here of a file there, as this machine writes its path; empty when it was not fetched.
  const fetched = async (host: string, path: string): Promise<string> => {
    io.toast(`trayendo ${nameOf(path)} de ${host}…`)
    const file = field(await runner.ask("fetch", host, path).catch(() => undefined), "file")
    return typeof file === "string" && file ? (platform === "win32" ? file.replace(/\//g, "\\") : file) : ""
  }
  const kindOf = async (host: string, path: string) => field(await runner.ask("stat", host, path).catch(() => undefined), "kind")
  // The search running on another machine, while one does: the machine, and the token it is held by.
  let searching: { host: string; token: string } | undefined
  let searches = 0
  return {
    ...io,
    async remotes() {
      const said = await runner.ask("hosts", "", "").catch(() => undefined)
      return Array.isArray(said) ? said.filter((one): one is string => typeof one === "string" && /^[A-Za-z][\w.-]+$/.test(one)) : []
    },
    async mounts() {
      const said = await runner.ask("mounts", "", "").catch(() => undefined)
      return Array.isArray(said) ? said.filter((one): one is string => typeof one === "string") : []
    },
    async paste(verb, native, nativeTarget) {
      const from = remoteOf(native)
      const to = remoteOf(nativeTarget)
      if (!from && !to) return io.paste(verb, native, nativeTarget)
      if (from && to && from.host !== to.host) return false
      const answer = await (from && to
        ? runner.run("paste", { SPEEDY_HOST: from.host, SPEEDY_PATH: from.path, SPEEDY_TARGET: to.path, SPEEDY_VERB: verb })
        : from
          ? runner.run("pull", { SPEEDY_HOST: from.host, SPEEDY_PATH: from.path, SPEEDY_TARGET: nativeTarget, SPEEDY_VERB: verb })
          : runner.run("push", { SPEEDY_HOST: to?.host ?? "", SPEEDY_FILE: native, SPEEDY_PATH: to?.path ?? "", SPEEDY_VERB: verb })
      ).catch(() => undefined)
      const said = field(answer, "said")
      return said === "kept" ? "kept" : said === "done"
    },
    async mkdir(nativeTarget) {
      const remote = remoteOf(nativeTarget)
      if (!remote) return io.mkdir(nativeTarget)
      // 📁 there: remote.py makes it by ssh, writing over nothing.
      const answer = await runner.run("mkdir", { SPEEDY_HOST: remote.host, SPEEDY_PATH: remote.path }).catch(() => undefined)
      return field(answer, "said") === "made"
    },
    hold(isHeld) {
      if (!searching) return io.hold?.(isHeld)
      void runner.run("pause", { SPEEDY_HOST: searching.host, SPEEDY_TOKEN: searching.token, SPEEDY_PAUSED: isHeld ? "1" : "0" }).catch(() => undefined)
    },
    async home(host) {
      const home = field(await runner.ask("home", host, "/").catch(() => undefined), "home")
      return typeof home === "string" ? home : ""
    },
    async list(path) {
      const remote = remoteOf(path)
      if (!remote) return io.list(path)
      const entries = field(await runner.ask("list", remote.host, remote.path), "entries")
      if (!Array.isArray(entries)) throw new Error("not reached")
      return entries as FsEntry[]
    },
    async isDir(path) {
      const remote = remoteOf(path)
      return remote ? (await kindOf(remote.host, remote.path)) === "dir" : io.isDir(path)
    },
    async exists(native) {
      const remote = remoteOf(native)
      if (!remote) return io.exists(native)
      const kind = await kindOf(remote.host, remote.path)
      return kind === "dir" || kind === "file"
    },
    view(path, onShown) {
      const remote = remoteOf(path)
      if (!remote) return io.view(path, onShown)
      void fetched(remote.host, remote.path).then((file) => {
        if (file) return io.view(file, onShown)
        onShown?.(false)
        io.toast(`no pude traer ${nameOf(remote.path)} de ${remote.host}.`, true)
      })
    },
    async copyFile(native) {
      const remote = remoteOf(native)
      if (!remote) return io.copyFile(native)
      const file = await fetched(remote.host, remote.path)
      return file !== "" && (await io.copyFile(file))
    },
    find(ask, onLine, onEnd) {
      const remote = remoteOf(ask.root)
      searching = remote ? { host: remote.host, token: `${Date.now().toString(36)}-${++searches}` } : undefined
      return remote && searching ? runner.find(remote.host, ask.pattern, ask.most, searching.token, onLine, onEnd) : io.find(ask, onLine, onEnd)
    },
  }
}
