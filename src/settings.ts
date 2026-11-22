/**
 * The preferences speedy-code keeps between sessions.
 *
 * They live in one durable OpenCode store entry instead of the Claude Code
 * preference API, and the shapes are the ones the original plugin wrote so a
 * hand-edited or older value still loads.
 */

import type { IconSet } from "./icons"

/** The status line parts, in the order the original declares them. */
export type BarPart = "core" | "five_hour" | "seven_day" | "monthly" | "context" | "time" | "tokens" | "app"

/** The four thresholds the status line colors. */
export type LevelKey = "contextYellow" | "contextRed" | "limitYellow" | "limitRed"

export type BarLevels = Record<LevelKey, number>

/** The voice picked for each language, and the language tab last shown. */
export interface Picks {
  active: string
  [language: string]: string
}

/** The one durable store key. */
export const SPEEDY_STORE_KEY = "speedy-code.settings"

/** The level thresholds as they start out, as the original ships them. */
export const DEFAULT_LEVELS: BarLevels = {
  contextYellow: 60,
  contextRed: 80,
  limitYellow: 75,
  limitRed: 90,
}

/** The status line parts with the label the settings menu shows for each. */
/** The fonts terminal_font.py knows, by the name it takes, and what each is called. */
export const FONT_FAMILIES = [
  ["jetbrains", "JetBrains Mono"],
  ["meslo", "Meslo"],
] as const
export type FontFamily = (typeof FONT_FAMILIES)[number][0]

export const BAR_PARTS: ReadonlyArray<readonly [BarPart, string]> = [
  ["core", "Versión de OpenCode"],
  ["app", "Versión de speedy-code"],
  ["five_hour", "Límite de 5 horas"],
  ["seven_day", "Límite semanal"],
  ["monthly", "Límite mensual"],
  ["context", "Contexto"],
  ["time", "Tiempo de sesión"],
  ["tokens", "Tokens in, out y caché"],
]

export const DEFAULT_ORDER: BarPart[] = BAR_PARTS.map(([key]) => key)

/** The level that goes with each, in the other direction. */
export const PAIR: Record<LevelKey, LevelKey> = {
  contextYellow: "contextRed",
  contextRed: "contextYellow",
  limitYellow: "limitRed",
  limitRed: "limitYellow",
}

export const LEVEL_KEYS: readonly LevelKey[] = ["contextYellow", "contextRed", "limitYellow", "limitRed"]

/** The voice a fresh install speaks each language with: a Microsoft Edge neural voice. */
export const DEFAULT_VOICES: Readonly<Record<string, string>> = {
  es: "es-PR-VictorNeural",
  en: "en-US-AriaNeural",
  fr: "fr-FR-DeniseNeural",
  it: "it-IT-ElsaNeural",
  pt: "pt-BR-FranciscaNeural",
  ru: "ru-RU-SvetlanaNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ar: "ar-EG-SalmaNeural",
  hi: "hi-IN-SwaraNeural",
  bn: "bn-BD-NabanitaNeural",
  ur: "ur-PK-UzmaNeural",
}

/** The voices the original fills in on a fresh install: one per language, then the tab shown. */
export const DEFAULT_PICKS: Picks = { ...DEFAULT_VOICES, active: "es" }

/** The voice to speak `code` with, falling back to the language shown, then to Spanish. */
export function voiceFor(picks: Picks, code: string): string {
  return picks[code] || picks[picks.active] || DEFAULT_VOICES.es || ""
}

/** A voice's own name, as the footer writes it: `es-PR-VictorNeural` → `Victor`. */
export function voiceShortName(id: string): string {
  const last = id.split("-").slice(2).at(-1) ?? ""
  return last.replace(/Neural$/, "").replace(/(Multilingual|Expressive)$/, "")
}

/** A language tab: its code, its Spanish name, its English name and its color. */
export const LANGUAGES: ReadonlyArray<readonly [code: string, es: string, en: string, color: string]> = [
  ["es", "Español", "Spanish", "#ff6b6b"],
  ["en", "Inglés", "English", "#4dabf7"],
  ["fr", "Francés", "French", "#748ffc"],
  ["it", "Italiano", "Italian", "#f06595"],
  ["pt", "Portugués", "Portuguese", "#51cf66"],
  ["ru", "Ruso", "Russian", "#da77f2"],
  ["zh", "Chino", "Chinese", "#ffa94d"],
  ["ar", "Árabe", "Arabic", "#20c997"],
  ["hi", "Hindi", "Hindi", "#ff922b"],
  ["bn", "Bengalí", "Bengali", "#94d82d"],
  ["ur", "Urdu", "Urdu", "#38d9a9"],
]

export const LANGUAGE_CODES: ReadonlySet<string> = new Set(LANGUAGES.map(([code]) => code))

/** The Spanish name of a language code, or the code itself when unknown. */
export function languageName(code: string): string {
  return LANGUAGES.find(([one]) => one === code)?.[1] ?? code
}

/** The author's own profiles, as the original fills them in on a fresh install. */
export const DEFAULT_SOCIALS: Record<string, string> = {
  github: "corbaz",
  linkedin: "julio-corbaz",
  x: "chipy_corbaz",
  youtube: "juliocorbaz",
  instagram: "chipy_corbaz",
  tiktok: "chipy.mdp",
  facebook: "JulioCesarCorbazArgentina",
  twitch: "che_argentino",
  threads: "chipy_corbaz",
  reddit: "corbazjcc",
  gmail: "julio.corbaz",
  discord: "chipy_corbaz",
}

/** What survives a restart. Everything else is session state. */
export interface SpeedySettings {
  narrator: boolean
  picks: Picks
  mic: string
  socials: Record<string, string>
  barLevels: BarLevels
  barOrder: BarPart[]
  /** Whether the status line is drawn over the controls. */
  statusBar: boolean
  /** The icons drawn: emojis, or Nerd Fonts glyphs where the terminal has a Nerd Font. */
  icons: IconSet
  /** Whether a footer control's name shows above it while the pointer is on it (⚙ → Ver labels). */
  labels: boolean
  /** The size, in points, the terminal's font was last set to from here; 0 while it never was. */
  fontSize: number
  /** The font the terminal was last set to from here. */
  fontFamily: FontFamily
  /** Whether what the Claude Code plugin keeps was already brought in. */
  imported: boolean
}

export const DEFAULT_SETTINGS: SpeedySettings = {
  narrator: false,
  picks: { ...DEFAULT_PICKS },
  mic: "",
  socials: { ...DEFAULT_SOCIALS },
  barLevels: { ...DEFAULT_LEVELS },
  barOrder: [...DEFAULT_ORDER],
  statusBar: true,
  icons: "emoji",
  labels: true,
  fontSize: 0,
  fontFamily: "jetbrains",
  imported: false,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isBarPart = (value: unknown): value is BarPart =>
  typeof value === "string" && (DEFAULT_ORDER as readonly string[]).includes(value)

/**
 * A priority list as saved, made whole: the parts it knows in its order, once
 * each, then any it lacks in the default order. An old or hand-edited list
 * never drops a part from the status line.
 */
export function barOrderOf(saved: unknown): BarPart[] {
  // An order saved when the session's cost was a part: the monthly window takes its place.
  const named = Array.isArray(saved) ? saved.map((key) => (key === "cost" ? "monthly" : key)) : []
  const known = named.filter(isBarPart)
  const order = [...new Set(known)]
  return [...order, ...DEFAULT_ORDER.filter((key) => !order.includes(key))]
}

/** Reads a saved priority list, ignoring anything unusable. */
export function normalizeOrder(saved: unknown): BarPart[] {
  return barOrderOf(saved)
}

/** Reads saved levels key by key, falling back to the default of each. */
export function normalizeLevels(saved: unknown): BarLevels {
  const source = isRecord(saved) ? saved : {}
  const next = { ...DEFAULT_LEVELS }
  for (const key of LEVEL_KEYS) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) next[key] = value
  }
  return next
}

/** One part a place up (-1) or down (+1) in the priority, swapping with the one there. */
export function movePart(order: readonly BarPart[], key: BarPart, delta: -1 | 1): BarPart[] {
  const next = [...order]
  const at = next.indexOf(key)
  const to = at + delta
  if (at < 0 || to < 0 || to >= next.length) return next
  ;[next[at], next[to]] = [next[to] as BarPart, key]
  return next
}

/**
 * One level up or down, within its bounds: yellow stays five under its red,
 * red five over its yellow, and neither passes a hundred.
 */
export function adjustLevel(levels: BarLevels, key: LevelKey, delta: number): BarLevels {
  const isYellow = key.endsWith("Yellow")
  const other = levels[PAIR[key]]
  const low = isYellow ? 5 : other + 5
  const high = isYellow ? other - 5 : 100
  return { ...levels, [key]: Math.min(high, Math.max(low, levels[key] + delta)) }
}

/** Reads a saved settings value, filling in whatever it lacks. */
export function settingsFromSaved(saved: unknown): SpeedySettings {
  if (!isRecord(saved)) return cloneSettings(DEFAULT_SETTINGS)

  const picked: Picks = { ...DEFAULT_PICKS }
  for (const [key, value] of Object.entries(isRecord(saved.picks) ? saved.picks : {})) {
    // An empty voice is not a choice: an older save wrote "" for the languages
    // never picked, and that muted the language shown. The default keeps it.
    if (typeof value !== "string" || !value.trim()) continue
    picked[key] = value
  }
  if (!LANGUAGE_CODES.has(picked.active)) picked.active = DEFAULT_SETTINGS.picks.active ?? "es"

  const socials: Record<string, string> = { ...DEFAULT_SOCIALS }
  for (const [key, value] of Object.entries(isRecord(saved.socials) ? saved.socials : {})) {
    if (typeof value === "string") socials[key] = value
  }

  return {
    narrator: typeof saved.narrator === "boolean" ? saved.narrator : DEFAULT_SETTINGS.narrator,
    mic: typeof saved.mic === "string" ? saved.mic : DEFAULT_SETTINGS.mic,
    picks: picked,
    socials,
    barLevels: normalizeLevels(saved.barLevels),
    barOrder: barOrderOf(saved.barOrder),
    statusBar: typeof saved.statusBar === "boolean" ? saved.statusBar : DEFAULT_SETTINGS.statusBar,
    icons: saved.icons === "nerd" ? "nerd" : DEFAULT_SETTINGS.icons,
    labels: typeof saved.labels === "boolean" ? saved.labels : DEFAULT_SETTINGS.labels,
    fontSize: Number.isInteger(saved.fontSize) && Number(saved.fontSize) > 0 ? Number(saved.fontSize) : 0,
    fontFamily: FONT_FAMILIES.some(([id]) => id === saved.fontFamily) ? (saved.fontFamily as FontFamily) : DEFAULT_SETTINGS.fontFamily,
    imported: saved.imported === true,
  }
}

/**
 * What the Claude Code plugin keeps, laid over these settings: its voices, its
 * microphone, its networks and its status line levels. Anything it lacks or
 * holds in another shape is left as it is here.
 */
export function importClaude(settings: SpeedySettings, claude: unknown): SpeedySettings {
  const next = cloneSettings(settings)
  next.imported = true
  if (!isRecord(claude)) return next
  for (const [key, value] of Object.entries(isRecord(claude.picks) ? claude.picks : {})) {
    if (typeof value !== "string" || !value.trim()) continue
    if (key === "active" ? LANGUAGE_CODES.has(value) : LANGUAGE_CODES.has(key)) next.picks[key] = value
  }
  for (const [key, value] of Object.entries(isRecord(claude.socials) ? claude.socials : {})) {
    if (typeof value === "string") next.socials[key] = value.trim().replace(/^@/, "")
  }
  if (typeof claude.mic === "string") next.mic = claude.mic
  if (isRecord(claude.barLevels)) next.barLevels = normalizeLevels({ ...next.barLevels, ...claude.barLevels })
  if (Array.isArray(claude.barOrder)) next.barOrder = barOrderOf(claude.barOrder)
  return next
}

/** A fresh copy, so a caller never mutates the shared defaults. */
export function cloneSettings(settings: SpeedySettings): SpeedySettings {
  return {
    ...settings,
    picks: { ...settings.picks },
    socials: { ...settings.socials },
    barLevels: { ...settings.barLevels },
    barOrder: [...settings.barOrder],
  }
}

/** The status line's levels and priority back to the defaults. */
export function resetSettings(settings: SpeedySettings): SpeedySettings {
  return { ...cloneSettings(settings), barLevels: { ...DEFAULT_LEVELS }, barOrder: [...DEFAULT_ORDER] }
}

/** One value as a string whose objects compare by key and not by insertion order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** Whether a stored value already says exactly what the repaired settings say. */
export function sameSettings(settings: SpeedySettings, saved: unknown): boolean {
  return canonical(settings) === canonical(saved)
}
