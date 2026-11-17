/**
 * The two icon sets the plugin draws with: emojis, which every terminal has,
 * and Nerd Fonts glyphs, which need a Nerd Font in the terminal.
 *
 * A Nerd Fonts glyph is one color, takes the color of its control and is as
 * wide as any other: an emoji is drawn by another font, in its own colors and
 * at its own width. The code points are Font Awesome's in Nerd Fonts 3
 * (`glyphnames.json`), all in the basic private use area.
 */

/** Which icons are drawn. */
export type IconSet = "emoji" | "nerd"

/** Each emoji the plugin writes, with the Nerd Fonts glyph that stands for it. */
export const NERD_ICONS: Readonly<Record<string, string>> = {
  "📋": "", // fa-copy
  "📥": "", // fa-paste
  "🖼": "", // fa-image
  "👁": "", // fa-eye
  "🗑": "", // fa-trash
  "🗣": "", // fa-comment
  "🗜": "", // fa-compress
  "🔊": "", // fa-volume_high
  "🔇": "", // fa-volume_off
  "📎": "", // fa-paperclip
  "🎙": "", // fa-microphone
  "🔵": "", // the microphone loading: its color says so
  "🔴": "", // the microphone open: its color says so
  "🖋": "", // fa-pencil
  "⏳": "", // fa-hourglass_half
  "🔄": "", // fa-refresh
  "⚙": "", // fa-gear
  "×": "", // fa-xmark
}

const VARIATION = "️"
const EMOJI = new RegExp(`(${Object.keys(NERD_ICONS).join("|")})${VARIATION}?`, "gu")

/** Whether the layout counts this emoji as two cells: the astral ones, and any said with U+FE0F. */
const isWide = (emoji: string) => (emoji.codePointAt(0) ?? 0) >= 0x1f000 || emoji.endsWith(VARIATION)

/**
 * `text` with every emoji replaced by its Nerd Fonts glyph. A glyph is one
 * cell, so one that replaces a two-cell emoji is followed by a blank: every
 * label keeps its width, and a glyph drawn wide has the room.
 */
export function nerdText(text: string): string {
  return text.replace(EMOJI, (found, emoji: string) => `${NERD_ICONS[emoji]}${isWide(found) ? " " : ""}`)
}

/** `text` as the icon set draws it. */
export function iconText(text: string, icons: IconSet): string {
  return icons === "nerd" ? nerdText(text) : text
}

/**
 * The colors the footer's tools take with Nerd Fonts glyphs. With emojis they
 * are gray, since an emoji takes no color; a glyph does.
 */
export const NERD_COLORS: Readonly<Record<string, string>> = {
  copy: "#74c0fc",
  paste: "#63e6be",
  image: "#b197fc",
  clear: "#ff8787",
  reload: "#4dabf7",
  settings: "#ced4da",
}
