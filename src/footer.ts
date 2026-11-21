/**
 * The footer layout, ported from the Claude Code plugin unchanged.
 *
 * The engine is pure: it decides which controls fit in a given number of
 * terminal cells and which of them are drawn in their short form. OpenCode
 * hands the footer its own slot and width, so nothing here touches a host API.
 */

import { NERD_COLORS, nerdText, type IconSet } from "./icons"

/** The narration states the play control draws. */
export type SpeechState = "idle" | "thinking" | "playing" | "paused"

/** One footer control group: its name, its full width and its short width. */
export interface FooterGroup {
  readonly name: string
  readonly width: number
  readonly compactWidth?: number
}

/** What `footerFit` decided: the groups drawn, and those drawn in their short form. */
export interface FooterFit {
  readonly shown: Set<string>
  readonly compact: Set<string>
}

/**
 * A footer group's rank when the width is short: 0 is always drawn; then 1
 * first, 2 next, and so on. The tools, the model, the voice and the close
 * control always stay; the networks go first.
 */
export const FOOTER_RANKS: Readonly<Record<string, number>> = {
  play: 0,
  copy: 0,
  paste: 0,
  image: 0,
  images: 0,
  polish: 0,
  send: 0,
  new: 0,
  sessions: 0,
  bar: 0,
  clear: 0,
  model: 0,
  effort: 0,
  voice: 0,
  compact: 0,
  exit: 0,
  divider: 0,
  agent: 1,
  settings: 1,
  reload: 2,
  history: 3,
  mic: 3,
  mics: 3,
  narrator: 4,
  socials: 0,
  place: 1,
  branch: 1,
}

/** The rank a name gets: every network badge is drawn last, as one group. */
function rankOf(name: string): number {
  return name.startsWith("social:") ? 5 : (FOOTER_RANKS[name] ?? 9)
}

/**
 * The groups always drawn that give way, in this order, when even their short
 * forms do not fit, so the more button and the close control stay on screen.
 */
export const FOOTER_SHED: readonly string[] = ["voice", "compact", "clear", "image", "copy", "polish"]

/** The more button's width, drawn when something does not fit. */
export const MORE_WIDTH = 4

/** The right margin the footer keeps free. */
export const FOOTER_MARGIN = 4

/** The play control's glyph and color per speech state. */
export const PLAY_GLYPHS: Readonly<Record<SpeechState, { readonly glyph: string; readonly color: string }>> = {
  idle: { glyph: "⏵", color: "#51cf66" },
  thinking: { glyph: "⧗", color: "#748ffc" },
  playing: { glyph: "⏸︎", color: "#ffd43b" },
  paused: { glyph: "⏵", color: "#51cf66" },
}

/** The microphone's glyph and color per listening state. */
export const MIC_GLYPHS = {
  off: { glyph: "🎙️", color: "#adb5bd" },
  loading: { glyph: "🔵", color: "#748ffc" },
  on: { glyph: "🔴", color: "#ff6b6b" },
} as const

/** The effort beside the model, in its traffic-light color. */
export const EFFORT_TONES: Readonly<Record<string, string>> = {
  none: "#adb5bd",
  minimal: "#69db7c",
  low: "#69db7c",
  medium: "#a9e34b",
  high: "#ffd43b",
  xhigh: "#ffa94d",
  max: "#ff6b6b",
}

/** The most cells the folder takes after the exit: a longer one keeps its end, after a …. */
export const FOLDER_CELLS = 40

/**
 * The folder as the footer shows it: home as ~, with the system's own separator, and its end alone
 * after a … when it is longer than `most` cells.
 */
export function folderLabel(cwd: string, home: string, separator: "\\" | "/", most = FOLDER_CELLS): string {
  if (!cwd) return ""
  const plain = cwd.replace(/\\/g, "/")
  const homePlain = home.replace(/\\/g, "/").replace(/\/$/, "")
  const inHome =
    homePlain !== "" && (plain === homePlain || plain.toLowerCase().startsWith(`${homePlain.toLowerCase()}/`))
  const shown = (inHome ? `~${plain.slice(homePlain.length)}` : plain).replace(/\//g, separator)
  return shown.length > most ? `…${shown.slice(shown.length - most + 1)}` : shown
}

/** The colors of the folder and the branch after the exit: the status line's own. */
export const FOLDER_COLOR = "#5fd7ff"
export const BRANCH_COLOR = "#d787ff"

/**
 * The version the footer shows: the moment of the last commit, in Buenos Aires (UTC-3, which has
 * no summer time), as `v:yy.mmdd-(hhmm)`. It changes with every push, and needs no file kept.
 */
export function versionLabel(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return ""
  const local = new Date((epochSeconds - 3 * 3600) * 1000)
  const two = (value: number) => String(value).padStart(2, "0")
  const day = `${two(local.getUTCFullYear() % 100)}.${two(local.getUTCMonth() + 1)}${two(local.getUTCDate())}`
  return `v:${day}-(${two(local.getUTCHours())}${two(local.getUTCMinutes())})`
}

/** What `+` does with the name typed: a session with that title, one the host names, or none. */
export type NewSessionChoice =
  | { readonly kind: "named"; readonly title: string }
  | { readonly kind: "plain" }
  | { readonly kind: "none" }

/** Reads the answer to `+`'s dialog: closed starts nothing, empty leaves the name to the host. */
export function newSessionChoice(typed: string | undefined): NewSessionChoice {
  if (typed === undefined) return { kind: "none" }
  const title = typed.trim()
  return title ? { kind: "named", title } : { kind: "plain" }
}

/** The agents' control and menu: the color of who does the work. */
export const AGENT_COLOR = "#ffa94d"

/** The sessions' control and menu: the color of what was said before. */
export const SESSIONS_COLOR = "#63e6be"

/** The networks' control, in the color of their settings tab. */
export const SOCIALS_COLOR = "#f783ac"

/** A control that does nothing right now. */
export const DISABLED_COLOR = "#495057"

/** The cells a label takes on a terminal: an emoji two, a selector or joiner none, the rest one. */
export function cells(text: string): number {
  const points = [...text]
  return points.reduce((total, point, index) => {
    const code = point.codePointAt(0) ?? 0
    if (code === 0xfe0e || code === 0xfe0f || code === 0x200d) return total
    return total + (code >= 0x1f000 || points[index + 1] === "\ufe0f" ? 2 : 1)
  }, 0)
}

/** Cuts `text` to `width`, with an ellipsis, and pads it to it. */
export function fit(text: string, width: number): string {
  if (width <= 0) return ""
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

/** The room the footer has: the width, less the mode label and the right margin. */
export function footerRoom(columns: number, modesWidth = 0): number {
  return columns - (modesWidth > 0 ? modesWidth + 3 : 0) - FOOTER_MARGIN
}

/**
 * The footer groups drawn in `room` cells: all of them, whole, when they fit.
 * If not, those ranked 0 and the more button, the model and then the voice in
 * their short form while that is still too wide, then the rest in rank order
 * until one does not fit: a lower rank never takes a higher one's place.
 */
export function footerFit(groups: readonly FooterGroup[], room: number): FooterFit {
  const rank = rankOf
  const compact = new Set<string>()
  if (groups.reduce((sum, group) => sum + group.width, 0) <= room) {
    return { shown: new Set(groups.map((group) => group.name)), compact }
  }

  const always = groups.filter((group) => rank(group.name) === 0)
  const shown = new Set(always.map((group) => group.name))
  let used = always.reduce((sum, group) => sum + group.width, MORE_WIDTH)

  for (const name of ["socials", "model", "voice"]) {
    const group = always.find((one) => one.name === name)
    if (used > room && group?.compactWidth !== undefined) {
      used -= group.width - group.compactWidth
      compact.add(name)
    }
  }

  for (const name of FOOTER_SHED) {
    const group = always.find((one) => one.name === name)
    if (used > room && group) {
      used -= compact.has(name) && group.compactWidth !== undefined ? group.compactWidth : group.width
      shown.delete(name)
      compact.delete(name)
    }
  }

  const rest = groups.filter((one) => !shown.has(one.name)).sort((x, y) => rank(x.name) - rank(y.name))
  for (const group of rest) {
    if (used + group.width > room) break
    shown.add(group.name)
    used += group.width
  }

  return { shown, compact }
}

/** The groups the footer left out for want of room: the more panel draws them. */
export function hiddenGroups(groups: readonly FooterGroup[], result: FooterFit): FooterGroup[] {
  return groups.filter((group) => !result.shown.has(group.name))
}

/** The microphone states the footer draws. */
export type ListeningState = "off" | "loading" | "on"

/** One control the footer draws: its label, its color, its short label and what it runs. */
export interface FooterControl extends FooterGroup {
  readonly text: string
  readonly color: string
  readonly compactText?: string
  /** What clicking it runs; absent on a control that is only decoration. */
  readonly id?: string
  /** Its label in the more menu, where it has room for its name. */
  readonly panel?: string
  /** Drawn bold, as the original draws the networks, the model and the effort. */
  readonly bold?: boolean
}

/** One network drawn as a badge, like the original footer draws the linked ones. */
export interface FooterSocial {
  readonly id: string
  readonly badge: string
  readonly color: string
}

/** What the footer needs to decide what to draw. */
export interface FooterInput {
  readonly narrator: boolean
  readonly speech: SpeechState
  readonly listening: ListeningState
  readonly model?: string
  /** The variant in force, shown beside the model as the original shows effort. */
  readonly effort?: string
  readonly voice?: string
  /** The color of the language narrated in: the voice is drawn in it. */
  readonly voiceColor?: string
  /** The language's short code, as the original writes it (`ES`). */
  readonly language?: string
  /** True while the wand is working, so its glyph says so. */
  readonly polishing?: boolean
  /** The networks with a handle set, in the original's order. */
  readonly socials?: readonly FooterSocial[]
  /** The icons the controls are drawn with: emojis unless Nerd Fonts glyphs are asked for. */
  readonly icons?: IconSet
  /** The folder drawn after the exit, home as ~; none draws nothing. */
  readonly folder?: string
  /** Its git branch, beside it. */
  readonly branch?: string
}

/** The family of a model id, for the short footer label. */
export function modelFamily(model: string): string {
  const parts = model.split(/[-/]/)
  return parts.length > 1 ? (parts[1] as string) : model
}

/** What each control is called in the more menu. */
export const PANEL_LABELS: Readonly<Record<string, string>> = {
  copy: " 📋 copiar ",
  paste: " 📥 pegar ",
  image: " 🖼️ imagen ",
  images: " 👁️ ver imágenes ",
  clear: " 🗑️ borrar ",
  compact: " 🗜️ compactar ",
  narrator: " 🔊 narrador ",
  play: " ⏵ leer de nuevo ",
  history: " 📎 audios y selección ",
  mic: " 🎙️ dictar ",
  mics: " ▾ micrófono ",
  polish: " 🖋️ corregir ",
  send: " ⏎ enviar ",
  new: " + conversación nueva ",
  reload: " 🔄 recargar ",
  settings: " ⚙️ configuración ",
  socials: " Redes sociales ",
}

/** One control, sized from the label it draws. */
function control(id: string, name: string, text: string, color: string, compactText?: string): FooterControl {
  const full = { name, id, text, color, width: cells(text), panel: PANEL_LABELS[name] }
  return compactText === undefined
    ? full
    : { ...full, compactText, compactWidth: cells(compactText) }
}

/**
 * The footer controls, in the order the original draws them and with the same
 * glyphs: the linked networks, the tools, the model with its variant, the voice
 * with its language, compact, the narrator with play and the kept audios, the
 * microphone, the pen, send and new, reload, the settings and exit.
 */
export function footerControls(input: FooterInput): FooterControl[] {
  const play = PLAY_GLYPHS[input.speech]
  const mic = MIC_GLYPHS[input.listening]
  const controls: FooterControl[] = []

  // The networks are one control that opens their menu: a badge each took half the row.
  if ((input.socials?.length ?? 0) > 0) {
    controls.push({ ...control("socials", "socials", " Redes ▾ ", SOCIALS_COLOR), bold: true })
    controls.push({ name: "divider", text: "│", color: DISABLED_COLOR, width: cells("│") })
  }

  controls.push(control("copy", "copy", " 📋 ", "#adb5bd"))
  controls.push(control("paste", "paste", " 📥 ", "#adb5bd"))
  controls.push(control("image", "image", " 🖼️ ", "#adb5bd"))
  controls.push(control("images", "images", " 👁️ ", "#74c0fc"))
  controls.push(control("clear", "clear", " 🗑️ ", "#adb5bd"))

  if (input.model) {
    controls.push({ name: "bar", text: "│", color: DISABLED_COLOR, width: cells("│") })
    const full = input.effort ? ` ${input.model} ` : ` ${input.model} ▾ `
    const short = ` ${modelFamily(input.model)} ▾ `
    controls.push({ ...control("model", "model", full, "#ffa94d", short), bold: true })
  }
  if (input.effort) {
    controls.push({
      ...control("effort", "effort", `· ${input.effort} ▾ `, EFFORT_TONES[input.effort] ?? "#adb5bd"),
      bold: true,
    })
  }

  const language = input.language ? ` · ${input.language}` : ""
  const voice = ` 🗣  ${input.voice ?? "Español"}${language} ▾`
  const voiceShort = input.language ? ` 🗣  ${input.language} ▾` : undefined
  controls.push(control("voice", "voice", voice, input.voiceColor ?? "#adb5bd", voiceShort))

  // The agent decides what runs without asking: the host tells no plugin which one is picked, so none is named.
  controls.push(control("agent", "agent", " Agente ▾ ", AGENT_COLOR))

  controls.push(control("compact", "compact", " 🗜️ ", "#ff6b6b"))

  const narrator = input.narrator ? " 🔊 " : " 🔇 "
  controls.push(control("narrator", "narrator", narrator, input.narrator ? "#51cf66" : "#868e96"))
  controls.push(control("play", "play", ` ${play.glyph} `, play.color))
  controls.push(control("history", "history", " 📎 ", input.narrator ? "#ffd43b" : DISABLED_COLOR))

  controls.push(control("mic", "mic", ` ${mic.glyph} `, mic.color))
  controls.push(control("mics", "mics", "▾ ", MIC_GLYPHS.off.color))
  controls.push(control("polish", "polish", input.polishing ? " ⏳ " : " 🖋️ ", "#da77f2"))
  controls.push(control("send", "send", " ⏎ ", "#51cf66"))
  controls.push(control("new", "new", " + ", "#51cf66"))
  controls.push(control("sessions", "sessions", " ☰ ", SESSIONS_COLOR))
  controls.push(control("reload", "reload", " 🔄 ", "#adb5bd"))
  controls.push(control("settings", "settings", " ⚙️ ", "#adb5bd"))
  // `×` is in every font, in one color and one cell: `✕` came from a fallback font.
  controls.push(control("exit", "exit", " × ", "#ff6b6b"))
  if (input.folder) {
    const text = ` ${input.folder}${input.branch ? "" : " "}`
    controls.push({ name: "place", text, color: FOLDER_COLOR, width: cells(text), panel: text, bold: true })
    if (input.branch) {
      const branch = ` ⎇ ${input.branch} `
      controls.push({ name: "branch", text: branch, color: BRANCH_COLOR, width: cells(branch), panel: branch })
    }
  }

  return input.icons === "nerd" ? controls.map(nerdControl) : controls
}

/** A control drawn with Nerd Fonts glyphs: as wide as its glyphs make it, in the color a glyph can take. */
function nerdControl(control: FooterControl): FooterControl {
  return {
    ...control,
    text: nerdText(control.text),
    width: cells(nerdText(control.text)),
    ...(control.compactText === undefined
      ? {}
      : { compactText: nerdText(control.compactText), compactWidth: cells(nerdText(control.compactText)) }),
    ...(control.panel === undefined ? {} : { panel: nerdText(control.panel) }),
    color: NERD_COLORS[control.name] ?? control.color,
  }
}

/** The footer as one string, in control order, with the short forms the fit chose. */
export function footerText(controls: readonly FooterControl[], result: FooterFit): string {
  return visibleControls(controls, result)
    .map((control) => control.text)
    .join("")
}

/**
 * The controls the fit kept, in order, each carrying the text it is drawn with:
 * its short form when the fit chose it. The renderer uses this instead of
 * repeating the filter and compact logic, so what is drawn is what is tested.
 */
export function visibleControls(controls: readonly FooterControl[], result: FooterFit): FooterControl[] {
  return controls
    .filter((control) => result.shown.has(control.name))
    .map((control) =>
      result.compact.has(control.name) && control.compactText !== undefined
        ? { ...control, text: control.compactText }
        : control,
    )
}
