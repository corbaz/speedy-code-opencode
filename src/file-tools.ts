/**
 * The commands behind each file's tools in the explorer: 📋 puts the file on the clipboard as a file,
 * ✏ and 🗑 ask in a dialog in the middle of the screen, then rename the file or send it to the trash.
 *
 * Every path and name goes in by the environment, never inside a command. Windows runs them in Windows
 * PowerShell by its path; macOS by AppleScript and the shell. A platform with no way to do one gets
 * `undefined`, and the tool says it could not.
 */

import { POWERSHELL } from "./powershell"
import { fromBase64Utf8 } from "./viewer"

/** A command to run and the environment it reads. */
export interface FileCommand {
  readonly argv: string[]
  readonly env: Record<string, string>
}

/** 📋: the file to the clipboard as a file, as Explorer's or Finder's Copy leaves it. It says `copied`. */
export function fileCopyCommand(platform: string, native: string): FileCommand | undefined {
  if (platform === "win32") {
    return {
      // The clipboard of Windows Forms needs a single-threaded apartment.
      argv: [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; $files = New-Object System.Collections.Specialized.StringCollection; [void]$files.Add($env:SPEEDY_FILE); [System.Windows.Forms.Clipboard]::SetFileDropList($files); 'copied'",
      ],
      env: { SPEEDY_FILE: native },
    }
  }
  if (platform === "darwin") {
    return {
      argv: ["osascript", "-e", "on run argv", "-e", "set the clipboard to (POSIX file (item 1 of argv))", "-e", 'return "copied"', "-e", "end run", native],
      env: {},
    }
  }
  return undefined
}

/**
 * ✏ and 🗑's dialog: the engine's dialog.ps1 on Windows (the new name, or whether the file goes to the
 * Recycle Bin), the engine's dialog.py popup on macOS, drawn the same. Where pywebview is not installed
 * dialog.py says nothing, and an AppleScript dialog asks. It answers `rename <base64 name>` (the
 * AppleScript dialog: `name <name>`), `delete` or `cancel`. `python` is the engine's Python, for macOS.
 */
export function dialogCommand(
  platform: string,
  mode: "rename" | "delete",
  native: string,
  root: string,
  kind: "file" | "dir" = "file",
  python = "",
): FileCommand | undefined {
  if (platform === "win32") {
    return {
      argv: [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", `${root.replace(/\\/g, "/")}/engine/dialog.ps1`],
      // A folder: one name with no extension, and Borrar says it goes with what it holds.
      env: { SPEEDY_FILE: native, SPEEDY_MODE: mode, SPEEDY_KIND: kind },
    }
  }
  if (platform !== "darwin") return undefined
  const name = native.split("/").pop() ?? native
  const script =
    mode === "rename"
      ? [
          "on run argv",
          "try",
          'set answer to text returned of (display dialog "Nombre nuevo:" default answer (item 1 of argv) with title "Renombrar" buttons {"Cancelar", "Aceptar"} default button "Aceptar" cancel button "Cancelar")',
          'return "name " & answer',
          "on error",
          'return "cancel"',
          "end try",
          "end run",
        ]
      : [
          "on run argv",
          "try",
          'display dialog ("¿Mandar " & (item 1 of argv) & " a la papelera?") with title "Borrar" buttons {"No", "Sí, borrar"} default button "No" cancel button "No"',
          'return "delete"',
          "on error",
          'return "cancel"',
          "end try",
          "end run",
        ]
  // The popup first; what it says is the answer. Saying nothing, the AppleScript dialog after it asks.
  const ask = [
    'answer=$("$SPEEDY_PYTHON" "$SPEEDY_POPUP" 2>/dev/null)',
    `if [ -n "$answer" ]; then printf '%s\\n' "$answer"; exit 0; fi`,
    'exec "$@"',
  ].join("\n")
  return {
    argv: ["/bin/sh", "-c", ask, "sh", "osascript", ...script.flatMap((line) => ["-e", line]), name],
    env: { SPEEDY_FILE: native, SPEEDY_MODE: mode, SPEEDY_KIND: kind, SPEEDY_PYTHON: python, SPEEDY_POPUP: `${root}/engine/dialog.py` },
  }
}

/**
 * The explorer's filter: find_files.py searches `root` for the files whose names match `pattern`, `first`
 * before the rest, up to `most`, and says what it finds a JSON line at a time.
 */
export function findCommand(ask: { root: string; first: string; pattern: string; most: number }, pluginRoot: string, python: string): FileCommand {
  return {
    argv: [python, `${pluginRoot.replace(/[\\/]+$/, "")}/engine/find_files.py`],
    env: { SPEEDY_ROOT: ask.root, SPEEDY_FIRST: ask.first, SPEEDY_PATTERN: ask.pattern, SPEEDY_MOST: String(ask.most) },
  }
}

/** The dialog's answer: its first line that says something; `cancel` when it said nothing. */
export function dialogAnswer(stdout: string): string {
  return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "cancel"
}

/** The new name a rename dialog answered; empty when it was cancelled. */
export function newNameOf(answer: string): string {
  if (answer.startsWith("rename ")) return fromBase64Utf8(answer.slice("rename ".length))
  if (answer.startsWith("name ")) return answer.slice("name ".length)
  return ""
}

/** ✏: the file renamed in its folder. Windows by Rename-Item; elsewhere by `mv -n`, which never overwrites. It says `renamed`. */
export function renameCommand(platform: string, native: string, name: string, nativeTarget: string): FileCommand {
  const env = { SPEEDY_FILE: native, SPEEDY_NAME: name, SPEEDY_TARGET: nativeTarget }
  if (platform === "win32") {
    return {
      argv: [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", "Rename-Item -LiteralPath $env:SPEEDY_FILE -NewName $env:SPEEDY_NAME -ErrorAction Stop; 'renamed'"],
      env,
    }
  }
  return { argv: ["/bin/sh", "-c", 'mv -n -- "$SPEEDY_FILE" "$SPEEDY_TARGET" && echo renamed'], env }
}

/** 🗑: the file to the Recycle Bin, or to the Trash by Finder, where it can be got back. It says `deleted`. */
export function trashCommand(platform: string, native: string): FileCommand | undefined {
  if (platform === "win32") {
    return {
      argv: [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        // A folder goes whole, with what it holds.
        "Add-Type -AssemblyName Microsoft.VisualBasic; if (Test-Path -LiteralPath $env:SPEEDY_FILE -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:SPEEDY_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:SPEEDY_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin') }; 'deleted'",
      ],
      env: { SPEEDY_FILE: native },
    }
  }
  if (platform === "darwin") {
    return {
      argv: ["osascript", "-e", "on run argv", "-e", 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)', "-e", 'return "deleted"', "-e", "end run", native],
      env: {},
    }
  }
  return undefined
}
