/**
 * The status line, ported from the original `statusline.py`: folder, branch,
 * version, model, effort, time, tokens, context used and cost, in color. In a
 * narrow terminal it keeps what matters most, in the order the settings give.
 *
 * Pure: it turns what the host knows into colored runs and touches no host API.
 */

import type { BarLevels } from "./settings"

/** One colored stretch of the line. */
export interface Run {
  readonly text: string
  readonly color: string
}

export const STATUS_COLORS = {
  folder: "#5fd7ff",
  branch: "#d787ff",
  model: "#ffaf5f",
  time: "#87d7ff",
  input: "#5fd7af",
  output: "#ff87af",
  cache: "#afafff",
  cost: "#ffd700",
  five: "#87afff",
  week: "#d7afff",
  label: "#8a8a8a",
  dim: "#585858",
  green: "#87d787",
  yellow: "#ffd75f",
  red: "#ff5f5f",
} as const

/** The effort color, from calm to hot, as the original paints it. */
export const EFFORT_COLORS: Readonly<Record<string, string>> = {
  none: "#8a8a8a",
  minimal: "#87d787",
  low: "#87d787",
  medium: "#afd75f",
  high: "#ffd75f",
  xhigh: "#ffaf5f",
  max: "#ff5f5f",
}

export const DEFAULT_PRIORITY: readonly string[] = [
  "core",
  "five_hour",
  "seven_day",
  "context",
  "time",
  "cost",
  "tokens",
  "folder",
]

/** What the line is drawn from. Every number may be missing: it counts as zero. */
export interface StatusInput {
  readonly cwd?: string
  readonly home?: string
  readonly branch?: string
  readonly version?: string
  readonly model?: string
  readonly effort?: string
  readonly durationMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly contextSize?: number
  readonly costUsd?: number
  /** The plan's windows, when the host knows them: 0% is a limit too. */
  readonly limits?: { readonly five_hour?: StatusLimit; readonly seven_day?: StatusLimit }
  /** The moment the reset times are told from; now when absent. */
  readonly now?: number
}

/** One usage window: how much of it is used, and when it starts over, in milliseconds. */
export interface StatusLimit {
  readonly percent: number
  readonly resetsAt?: number
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const

/** `hoy 13:40`, `mañana 09:00`, `Dom 13:00`: local time. */
export function formatReset(at: number | undefined, now = Date.now()): string {
  if (!at) return ""
  const when = new Date(at)
  const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((day(when) - day(new Date(now))) / 86400000)
  if (days === 0) return `hoy ${time}`
  if (days === 1) return `mañana ${time}`
  return `${DAYS[when.getDay()]} ${time}`
}

/** One decimal at most, none when it is `.0`. */
function oneDecimal(value: number): string {
  const text = value.toFixed(1)
  return text.endsWith(".0") ? text.slice(0, -2) : text
}

/** `1500` → `1.5k`, `1200000` → `1.2M`. Past 999.95k the k rounds to a million. */
export function formatTokens(value: number | undefined): string {
  const n = Number(value) || 0
  if (!n) return "0"
  if (n >= 999950) return `${oneDecimal(n / 1000000)}M`
  if (n >= 1000) return `${oneDecimal(n / 1000)}k`
  return String(Math.trunc(n))
}

/** `43m`, `2h 5m`, `1d 0h 3m`. */
export function formatDuration(ms: number | undefined): string {
  const value = Number(ms) || 0
  if (value <= 0) return "0m"
  const minutes = Math.round(value / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days >= 1) return `${days}d ${hours}h ${mins}m`
  if (hours >= 1) return `${hours}h ${mins}m`
  return `${mins}m`
}

/** `$1,234.50`. */
export function formatCost(value: number | undefined): string {
  return `$${(Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** The cells a run list takes: the status line draws no wide glyphs. */
export function runsWidth(runs: readonly Run[]): number {
  return runs.reduce((total, run) => total + [...run.text].length, 0)
}

/** The known parts in the saved order, once each; any it lacks after them, in the default order. */
export function priorityOf(saved: readonly string[] | undefined): string[] {
  const known: string[] = []
  for (const key of saved ?? []) {
    if (DEFAULT_PRIORITY.includes(key) && !known.includes(key)) known.push(key)
  }
  return [...known, ...DEFAULT_PRIORITY.filter((key) => !known.includes(key))]
}

/**
 * The line in `columns` cells: the parts in priority order until one does not
 * fit, drawn in their fixed order. The first by priority always goes; nothing
 * is cut with an ellipsis. The folder is set off by `»`, the rest by `│`.
 */
export function statusLine(
  input: StatusInput,
  columns: number,
  levels: BarLevels,
  priority: readonly string[] = DEFAULT_PRIORITY,
): Run[] {
  const C = STATUS_COLORS
  const order = priorityOf(priority)
  const rank = (key: string) => order.indexOf(key) + 1
  const run = (text: string, color: string): Run => ({ text, color })
  const part = (name: string, value: string, tone: string): Run[] => [run(`${name} `, C.label), run(value, tone)]

  let cwd = input.cwd ?? ""
  if (input.home && cwd.toLowerCase().startsWith(input.home.toLowerCase())) cwd = `~${cwd.slice(input.home.length)}`
  const folder: Run[] = [run(cwd, C.folder)]
  if (input.branch) folder.push(run(` ⎇ ${input.branch}`, C.branch))

  const tokens: Run[] = [
    ...part("in", formatTokens(input.inputTokens), C.input),
    run(" ", C.label),
    ...part("out", formatTokens(input.outputTokens), C.output),
    run(" ", C.label),
    ...part("caché", formatTokens(input.cacheReadTokens), C.cache),
  ]

  const size = Number(input.contextSize) || 0
  const held =
    (Number(input.inputTokens) || 0) + (Number(input.cacheWriteTokens) || 0) + (Number(input.cacheReadTokens) || 0)
  const used = Math.round(size ? (held / size) * 100 : 0)
  const tone = used >= levels.contextRed ? C.red : used >= levels.contextYellow ? C.yellow : C.green
  const full = Math.round((Math.min(100, Math.max(0, used)) / 100) * 4)
  const context: Run[] = [
    run("ctx: ", C.label),
    run("▰".repeat(full), tone),
    run("▱".repeat(4 - full), C.dim),
    run(` ${used}%`, tone),
  ]
  if (size) context.push(run(` ${formatTokens(held)}/${formatTokens(size)}`, tone))
  if (used >= levels.contextRed) context.push(run(" ⚠  compactar", C.red))

  const core: Run[] = []
  if (input.version) core.push(run(`v${input.version} `, C.time))
  core.push(run(`◆ ${input.model ?? ""}`, C.model))
  if (input.effort) {
    core.push(run(" · ", C.label), run(input.effort, EFFORT_COLORS[input.effort] ?? C.label))
  }

  const meter = (percent: number, color: string): Run[] => {
    const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 4)
    return [run("▰".repeat(filled), color), run("▱".repeat(4 - filled), C.dim)]
  }

  const parts: Array<{ key: string; runs: Run[]; short?: Run[]; shown?: Run[] }> = [
    { key: "folder", runs: folder },
    { key: "core", runs: core },
    { key: "time", runs: [run(`⏱  ${formatDuration(input.durationMs)}`, C.time)] },
    { key: "tokens", runs: tokens },
    { key: "context", runs: context },
    { key: "cost", runs: part("sesión", formatCost(input.costUsd), C.cost) },
  ]

  for (const [key, label, color] of [
    ["five_hour", "5hs", C.five],
    ["seven_day", "semana", C.week],
  ] as const) {
    const limit = input.limits?.[key]
    if (!limit || !Number.isFinite(limit.percent)) continue
    const usedLimit = Math.round(limit.percent)
    const limitTone = usedLimit >= levels.limitRed ? C.red : usedLimit >= levels.limitYellow ? C.yellow : C.green
    const short: Run[] = [run(`${label} `, color), ...meter(usedLimit, limitTone), run(` ${usedLimit}%`, limitTone)]
    if (usedLimit >= levels.limitRed) short.push(run(" ⚠ ", C.red))
    const reset = formatReset(limit.resetsAt, input.now)
    parts.push({ key, short, runs: reset ? [...short, run(` ↻ ${reset}`, C.label)] : short })
  }

  // The parts in rank order, each in its short form, until one does not fit;
  // then the limits get their reset time back with the room left.
  const room = columns > 0 ? columns - 4 : Number.POSITIVE_INFINITY
  const ranked = [...parts].sort((x, y) => rank(x.key) - rank(y.key))
  let taken = 0
  for (const one of ranked) {
    const form = one.short ?? one.runs
    const gap = taken ? 3 : 0
    if (taken > 0 && taken + gap + runsWidth(form) > room) break
    one.shown = form
    taken += gap + runsWidth(form)
  }
  for (const one of ranked) {
    if (!one.shown || !one.short) continue
    const more = runsWidth(one.runs) - runsWidth(one.short)
    if (taken + more <= room) {
      one.shown = one.runs
      taken += more
    }
  }

  const line: Run[] = []
  const shown = parts.filter((one) => one.shown)
  shown.forEach((one, index) => {
    if (index > 0) {
      line.push(shown[index - 1]?.key === "folder" ? run(" » ", C.dim) : run(" │ ", C.dim))
    }
    line.push(...(one.shown ?? one.runs))
  })
  return line
}
