/**
 * The agents a person can pick in OpenCode, as the footer's menu lists them.
 *
 * OpenCode has no permission modes: what may run without asking belongs to the
 * agent, by its rules. This module keeps the agents a person picks, with what
 * the host says of each.
 */

/** One agent in the menu: its id, its name and what the host says of it. */
export interface AgentRow {
  readonly id: string
  readonly name: string
  readonly description: string
}

/** The rows of the host's agents: the primary ones a person picks, the hidden left out, in the host's order. */
export function agentRowsOf(list: unknown): AgentRow[] {
  if (!Array.isArray(list)) return []
  const rows: AgentRow[] = []
  for (const one of list as Array<Record<string, unknown>>) {
    if (!one || typeof one.id !== "string" || one.mode !== "primary" || one.hidden === true) continue
    rows.push({
      id: one.id,
      name: typeof one.name === "string" && one.name.trim() ? one.name.trim() : one.id,
      description: typeof one.description === "string" ? one.description.trim() : "",
    })
  }
  return rows
}
