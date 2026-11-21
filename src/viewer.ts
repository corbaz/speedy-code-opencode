/**
 * What shows a file in a popup in the middle of the screen: the engine's PowerShell popup on Windows,
 * Quick Look on macOS, the default program elsewhere. One popup at a time is the host's part.
 */

import { POWERSHELL } from "./powershell"

/** `view.ps1` shows a pasted image; `view_file.ps1` a file the explorer lists: text, PDF or picture. */
export type ViewerScript = "view.ps1" | "view_file.ps1"

/**
 * The command that shows `path`, and the environment it runs with. The path goes in by the environment
 * on Windows, never in a command: view.ps1 reads SPEEDY_IMAGE, view_file.ps1 SPEEDY_FILE.
 */
export function viewerCommand(
  platform: string,
  script: ViewerScript,
  path: string,
  root: string,
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
      env: { SPEEDY_FILE: native, SPEEDY_IMAGE: native },
    }
  }
  return { argv: platform === "darwin" ? ["qlmanage", "-p", path] : ["xdg-open", path], env: {} }
}
