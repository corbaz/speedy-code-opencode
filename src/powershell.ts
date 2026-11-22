/**
 * Windows PowerShell, by its own path.
 *
 * The bare name `powershell` is looked for along the PATH, and a machine may hold another program
 * under it first: a shim that runs PowerShell 7, or a stub that is no program at all. Then the script
 * asked for never runs, and nothing says so. The system's own folder names the real one.
 */
export function powershellPath(env: Record<string, string | undefined> = process.env): string {
  const root = env.SystemRoot || env.windir
  return root ? [root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"].join("\\") : "powershell"
}

/** Windows PowerShell on this system: what every command of the plugin runs it by. */
export const POWERSHELL = powershellPath()

/**
 * The clipboard's text, written in UTF-8 whatever the console's code page: PowerShell writes to a pipe in
 * that code page, where á and ñ come out as `?`.
 */
export const CLIPBOARD_READ = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"
