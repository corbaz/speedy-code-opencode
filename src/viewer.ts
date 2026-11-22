/**
 * What shows a file in a popup in the middle of the screen: the engine's PowerShell popup on Windows,
 * Quick Look on macOS, the default program elsewhere. One popup at a time is the host's part.
 *
 * While it is up, the file popup speaks on stdout: `shown`, then a dot ten times a second, and, when its
 * Copiar is pressed, `copied <base64>` (the text taken) or `attach <base64>` (a picture file to attach).
 * `createViewerReader` turns those lines into what goes into the prompt.
 */

import { POWERSHELL } from "./powershell"

/** `view.ps1` shows a pasted image; `view_file.ps1` a file the explorer lists: text, PDF or picture. */
export type ViewerScript = "view.ps1" | "view_file.ps1"

/**
 * The command that shows `path`, and the environment it runs with. The path goes in by the environment
 * on Windows, never in a command: view.ps1 reads SPEEDY_IMAGE, view_file.ps1 SPEEDY_FILE, and reads a
 * PDF's text and lays out minified code with the engine's Python, SPEEDY_PYTHON.
 */
export function viewerCommand(
  platform: string,
  script: ViewerScript,
  path: string,
  root: string,
  python: string,
): { argv: string[]; env: Record<string, string> } {
  if (platform === "win32") {
    const native = path.replace(/\//g, "\\")
    return {
      argv: [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        `${root.replace(/\\/g, "/")}/engine/${script}`,
      ],
      env: { SPEEDY_FILE: native, SPEEDY_IMAGE: native, SPEEDY_PYTHON: python },
    }
  }
  return { argv: platform === "darwin" ? ["qlmanage", "-p", path] : ["xdg-open", path], env: {} }
}

/** UTF-8 text from Base64, as the viewer and the dialog write it; empty for what is not Base64. */
export function fromBase64Utf8(base64: string): string {
  const clean = base64.trim().replace(/=+$/, "")
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) return ""
  return Buffer.from(clean, "base64").toString("utf8")
}

/** What a popup's Copiar puts into the prompt: a line break, the text without its own trailing ones, a line break. */
export function popupPaste(text: string): string {
  return `\n${text.replace(/\n+$/, "")}\n`
}

/** A file as a prompt mentions it: `@path`, quoted when it holds a space. */
export function fileMention(path: string): string {
  return /\s/.test(path) ? `@"${path}"` : `@${path}`
}

/**
 * What goes into the prompt at the cursor for `text`, as typed there: `separator` first unless the text
 * before the cursor is empty or already ends apart; after a space-separated text, a space.
 */
export function promptInsertion(before: string, text: string, separator: " " | "\n"): string {
  const lead = before === "" || /\s$/.test(before) ? "" : separator
  return `${lead}${text}${separator === " " ? " " : ""}`
}

/** What one of the viewer's lines asks of the prompt: a text pasted on its own line, or a file mentioned. */
export type ViewerSaid = { kind: "paste"; text: string } | { kind: "mention"; text: string }

/** One line the viewer said, read: `copied` and `attach` ask something of the prompt, the rest nothing. */
export function viewerSaid(line: string): ViewerSaid | undefined {
  if (line.startsWith("attach ")) {
    const file = fromBase64Utf8(line.slice("attach ".length))
    return file ? { kind: "mention", text: fileMention(file) } : undefined
  }
  if (line.startsWith("copied ")) {
    const copied = fromBase64Utf8(line.slice("copied ".length))
    return copied ? { kind: "paste", text: popupPaste(copied) } : undefined
  }
  return undefined
}

/** Reads the viewer's stdout in whatever chunks it comes, a line at a time, and hands on what asks something. */
export function createViewerReader(onSaid: (said: ViewerSaid) => void): { push(chunk: string): void } {
  let pending = ""
  return {
    push(chunk) {
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ""
      for (const line of lines) {
        const said = viewerSaid(line.trim())
        if (said) onSaid(said)
      }
    },
  }
}
