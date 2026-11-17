/**
 * The sessions OpenCode keeps, as the footer's menu lists them.
 *
 * The host answers `session.list` with every session of every folder; this
 * module keeps the ones a person opened, newest first, with what a row shows.
 */

/** One session in the menu: its id, its title, its folder's name and when it last changed (ms since 1970). */
export interface SessionRow {
  readonly id: string
  readonly title: string
  readonly folder: string
  readonly updated: number
}

/** How many sessions the menu lists. */
export const SESSIONS_LENGTH = 60

/** The title of a session the host gave none. */
export const UNTITLED = "(sin título)"

/**
 * The rows of the host's answer to `session.list`: the sessions with an id,
 * the ones an agent opened under another left out, newest first.
 */
export function sessionRowsOf(answer: unknown): SessionRow[] {
  const list = (answer as { data?: unknown } | undefined)?.data
  if (!Array.isArray(list)) return []
  const rows: SessionRow[] = []
  for (const one of list as Array<Record<string, unknown>>) {
    if (!one || typeof one.id !== "string" || one.parentID) continue
    const time = (one.time ?? {}) as { created?: unknown; updated?: unknown }
    const updated = typeof time.updated === "number" ? time.updated : typeof time.created === "number" ? time.created : 0
    const directory = (one.location as { directory?: unknown } | undefined)?.directory
    const folder = typeof directory === "string" ? (directory.split(/[\\/]/).filter(Boolean).pop() ?? "") : ""
    const title = typeof one.title === "string" && one.title.trim() ? one.title.trim() : UNTITLED
    rows.push({ id: one.id, title, folder, updated })
  }
  return rows.sort((a, b) => b.updated - a.updated).slice(0, SESSIONS_LENGTH)
}

/** When a session last changed, as the menu writes it: `dd/mm hh:mm`, in this machine's time. */
export function sessionStamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ""
  const at = new Date(ms)
  const two = (value: number) => String(value).padStart(2, "0")
  return `${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`
}
