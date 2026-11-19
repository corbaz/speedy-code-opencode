/**
 * The agents a person can pick in OpenCode, as the footer's menu lists them.
 *
 * OpenCode has no permission modes: what may run without asking belongs to the
 * agent, by its rules. This module keeps the agents a person picks, and says
 * each one's scope in a line.
 */

/** One agent in the menu: its id, its name, what the host says of it, and what it may do without asking. */
export interface AgentRow {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly scope: string
}

/** One permission rule of an agent, as the host gives it: later rules stand over earlier ones. */
interface Rule {
  readonly action?: unknown
  readonly resource?: unknown
  readonly effect?: unknown
}

const EFFECT_WORDS: Readonly<Record<string, string>> = { allow: "sin preguntar", ask: "pregunta antes", deny: "no puede" }

/** What an agent does about every resource of an action: its last rule for all of them, else it asks. */
function effectOf(rules: readonly Rule[], action: string): string {
  const all = rules.filter((rule) => (rule.action === action || rule.action === "*") && rule.resource === "*")
  const effect = all.at(-1)?.effect
  return typeof effect === "string" && effect in EFFECT_WORDS ? effect : "ask"
}

/**
 * What an agent may do without asking, in a line: editing files, running
 * commands, and how many rules of its own set a file or a command apart.
 */
export function agentScope(permissions: unknown): string {
  const rules = (Array.isArray(permissions) ? permissions : []) as Rule[]
  const apart = rules.filter((rule) => rule.resource !== "*" && (rule.action === "edit" || rule.action === "shell")).length
  const said = `Editar archivos: ${EFFECT_WORDS[effectOf(rules, "edit")]} · Comandos: ${EFFECT_WORDS[effectOf(rules, "shell")]}`
  return apart > 0 ? `${said} · ${apart} excepciones` : said
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
      scope: agentScope(one.permissions),
    })
  }
  return rows
}
