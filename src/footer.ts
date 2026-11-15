/**
 * The footer layout, ported from the Claude Code plugin unchanged.
 *
 * The engine is pure: it decides which controls fit in a given number of
 * terminal cells and which of them are drawn in their short form. OpenCode
 * hands the footer its own slot and width, so nothing here touches a host API.
 */

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
  polish: 0,
  send: 0,
  clear: 0,
  model: 0,
  effort: 0,
  voice: 0,
  compact: 0,
  exit: 0,
  divider: 0,
  settings: 1,
  reload: 2,
  history: 3,
  mic: 3,
  narrator: 4,
  socials: 5,
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

  for (const name of ["model", "voice"]) {
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
  /** The language's short code, as the original writes it (`ES`). */
  readonly language?: string
  /** True while the wand is working, so its glyph says so. */
  readonly polishing?: boolean
  /** The networks with a handle set, in the original's order. */
  readonly socials?: readonly FooterSocial[]
}

/** The family of a model id, for the short footer label. */
export function modelFamily(model: string): string {
  const parts = model.split(/[-/]/)
  return parts.length > 1 ? (parts[1] as string) : model
}

/** One control, sized from the label it draws. */
function control(id: string, name: string, text: string, color: string, compactText?: string): FooterControl {
  const full = { name, id, text, color, width: cells(text) }
  return compactText === undefined
    ? full
    : { ...full, compactText, compactWidth: cells(compactText) }
}

/**
 * The footer controls, in the order the original draws them and with the same
 * glyphs: the linked networks, the tools, the model with its variant, the voice
 * with its language, the narrator, the microphone, the play control and the
 * settings. Only the controls this port can actually run are drawn; the ones
 * that belong to the host (send, clear, compact, exit, reload) stay the host's.
 */
export function footerControls(input: FooterInput): FooterControl[] {
  const play = PLAY_GLYPHS[input.speech]
  const mic = MIC_GLYPHS[input.listening]
  const controls: FooterControl[] = []

  for (const social of input.socials ?? []) {
    controls.push(control(`social:${social.id}`, `social:${social.id}`, ` ${social.badge} `, social.color))
  }
  if ((input.socials?.length ?? 0) > 0) {
    controls.push({ name: "divider", text: "│", color: DISABLED_COLOR, width: cells("│") })
  }

  controls.push(control("copy", "copy", " 📋 ", "#adb5bd"))
  controls.push(control("polish", "polish", input.polishing ? " ⏳ " : " 🖋️ ", "#da77f2"))

  if (input.model) {
    const full = ` ${input.model} `
    const short = ` ${modelFamily(input.model)} ▾ `
    controls.push(control("model", "model", full, "#ffa94d", short))
  }
  if (input.effort) {
    controls.push(control("effort", "effort", `· ${input.effort} ▾ `, "#adb5bd"))
  }

  const language = input.language ? ` · ${input.language}` : ""
  const voice = ` 🗣  ${input.voice ?? "Español"}${language} ▾`
  controls.push(control("voice", "voice", voice, "#adb5bd"))

  const narrator = input.narrator ? " 🔊 " : " 🔇 "
  controls.push(
    control("narrator", "narrator", narrator, input.narrator ? "#51cf66" : DISABLED_COLOR),
  )

  controls.push(control("mic", "mic", ` ${mic.glyph} `, mic.color))
  controls.push(control("play", "play", ` ${play.glyph} `, play.color))
  controls.push(control("history", "history", " 📎 ", "#ffd43b"))
  controls.push(control("settings", "settings", " ⚙️ ", "#adb5bd"))

  return controls
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
