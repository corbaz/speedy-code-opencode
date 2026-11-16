/**
 * The voices the narrator can speak with, as the original lists them: the
 * neural voices edge-tts offers in the menu's languages, each with its own
 * name, its country and what sets it apart.
 *
 * Pure: it reads the text `python -m edge_tts --list-voices` prints.
 */

import { LANGUAGE_CODES, languageName, type Picks, DEFAULT_VOICES } from "./settings"

export interface Voice {
  /** The edge-tts id: `es-PR-VictorNeural`. */
  readonly value: string
  readonly lang: string
  readonly name: string
  /** `✦ multi`, `✦ expresiva`, a dialect, or nothing. */
  readonly tag: string
  readonly country: string
  readonly gender: "Female" | "Male"
}

/** Region names that would not fit their column, said short. */
const SHORT_COUNTRIES: Readonly<Record<string, string>> = {
  AE: "Emiratos",
  DO: "R. Dominicana",
  GB: "Reino Unido",
  GQ: "Guinea Ecuat.",
  HK: "Hong Kong",
  SA: "Arabia Saudí",
  US: "EE. UU.",
  ZA: "Sudáfrica",
}

const regions = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" })
  } catch {
    return undefined
  }
})()

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * A voice's name and what sets it apart: `en-US-AvaMultilingualNeural` → `Ava`,
 * `✦ multi`; `zh-CN-liaoning-XiaobeiNeural` → `Xiaobei`, `Liaoning`.
 */
export function nameOf(id: string): { name: string; tag: string } {
  const parts = id.split("-").slice(2)
  let name = (parts.at(-1) ?? "").replace(/Neural$/, "")
  const tags: string[] = []
  if (parts.length > 1) tags.push(capitalize(parts.slice(0, -1).join("-")))
  if (/Multilingual$/.test(name)) {
    name = name.replace(/Multilingual$/, "")
    tags.push("✦ multi")
  }
  if (/Expressive$/.test(name)) {
    name = name.replace(/Expressive$/, "")
    tags.push("✦ expresiva")
  }
  return { name, tag: tags.join(" ") }
}

/** `es-AR-TomasNeural` → `Argentina`. */
export function countryOf(id: string): string {
  const code = id.split("-")[1] ?? ""
  if (SHORT_COUNTRIES[code]) return SHORT_COUNTRIES[code] as string
  try {
    return regions?.of(code) ?? code
  } catch {
    return code
  }
}

/** The neural voices of the menu's languages in what `edge_tts --list-voices` prints, by country and name. */
export function parseVoices(stdout: string): Voice[] {
  const found: Voice[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const [id, gender] = line.trim().split(/\s+/)
    const lang = id?.split("-")[0] ?? ""
    if (!id || !id.endsWith("Neural") || !LANGUAGE_CODES.has(lang)) continue
    if (gender !== "Female" && gender !== "Male") continue
    found.push({ value: id, lang, ...nameOf(id), country: countryOf(id), gender })
  }
  return found.sort((a, b) => a.country.localeCompare(b.country, "es") || a.name.localeCompare(b.name, "es"))
}

/**
 * One voice per name, country and gender: `AndrewNeural` and
 * `AndrewMultilingualNeural` sound the same, and listing both repeats the name.
 * The one in use stays; else the multilingual one. An expressive voice is a
 * different style and stays apart.
 */
export function distinctVoices(list: readonly Voice[], current: string): Voice[] {
  const kept = new Map<string, Voice>()
  for (const voice of list) {
    const key = `${voice.name}|${voice.country}|${voice.gender}|${voice.tag.includes("expresiva")}`
    const was = kept.get(key)
    const isBetter =
      !was ||
      (was.value !== current &&
        (voice.value === current || (voice.tag.includes("multi") && !was.tag.includes("multi"))))
    if (isBetter) kept.set(key, voice)
  }
  return [...kept.values()]
}

/** The voice menu's title: `Voz: Natasha (Inglés - Australia)`, the voice narrating now. */
export function voiceTitle(picks: Picks): string {
  const active = picks.active || "es"
  const id = picks[active] || DEFAULT_VOICES[active] || DEFAULT_VOICES.es || ""
  return `Voz: ${nameOf(id).name} (${languageName(active)} - ${countryOf(id)})`
}

/** `Auriculares con micrófono (2- JBL Tune 520BT)` → `JBL Tune 520BT`: the device, not its kind. */
export function micName(name: string): string {
  const inner = /\(([^()]*)\)\s*$/.exec(name)?.[1] ?? name
  return inner.replace(/^\d+-\s*/, "").trim()
}

/** The microphones `listen.py --list` prints, one `mic <name>` line each. */
export function parseMics(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("mic "))
    .map((line) => line.slice(4).trim())
    .filter(Boolean)
}

/** Words common enough to tell a language by. */
const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  es: ["el", "la", "que", "de", "y", "en", "los", "las", "es", "por", "con", "una", "para", "del", "se"],
  en: ["the", "and", "is", "of", "to", "you", "it", "that", "with", "for", "this", "are"],
  pt: ["não", "você", "é", "uma", "com", "os", "do", "da", "que", "para", "em", "são"],
  fr: ["le", "les", "est", "et", "une", "des", "vous", "pas", "pour", "dans", "que", "sur"],
  it: ["il", "gli", "che", "di", "non", "per", "sono", "della", "questo", "anche", "come", "più"],
}

/** The language `text` is in, among the ones the stopwords know; empty when it cannot tell. */
export function guessLanguage(text: string): string {
  const words = text.toLowerCase().split(/[^\p{L}]+/u)
  let best = ""
  let bestCount = 2
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const known = new Set(list)
    const count = words.filter((word) => known.has(word)).length
    if (count > bestCount) {
      best = code
      bestCount = count
    }
  }
  return best
}

/** Past this length a reply is told short instead of read whole. */
export const SHORT_ANSWER = 3000

/** What turns a reply into text a voice reads, when it is not read as it is. */
export const NARRATION_SYSTEM =
  "You turn an assistant reply into text a speech synthesizer reads aloud. Plain sentences only: no markdown, lists, emojis or code; no URLs, file paths or hashes spelled out. Answer with the text alone."

/**
 * What to ask a model so `text` can be narrated in `lang`: nothing when it is
 * short and already in that language, a translation when it is in another, and
 * a few sentences telling it when it is long.
 */
export function narrationRequest(text: string, lang: string, target: string): { system: string; text: string } | undefined {
  if (!text.trim()) return undefined
  if (text.length <= SHORT_ANSWER && guessLanguage(text) === lang) return undefined
  const ask =
    text.length <= SHORT_ANSWER
      ? `Translate this reply into ${target}, faithfully and completely:\n\n${text}`
      : `Say what this reply tells, in ${target}, in two to four short sentences, in first person, speaking to the reader:\n\n${text}`
  return { system: NARRATION_SYSTEM, text: ask }
}
