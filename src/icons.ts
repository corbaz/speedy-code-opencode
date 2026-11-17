/**
 * The two icon sets the plugin draws with: emojis, which every terminal has,
 * and Nerd Fonts glyphs, which need a Nerd Font in the terminal.
 *
 * A Nerd Fonts glyph is one color, takes the color of its control and is as
 * wide as any other: an emoji is drawn by another font, in its own colors and
 * at its own width. The code points are Font Awesome's and Codicons' in Nerd
 * Fonts 3 (`glyphnames.json`), all in the basic private use area.
 */

/** Which icons are drawn. */
export type IconSet = "emoji" | "nerd"

/** Each emoji the plugin writes, with the Nerd Fonts glyph that stands for it. */
export const NERD_ICONS: Readonly<Record<string, string>> = {
  "📋": "\uf0c5", // fa-copy
  "📥": "\uf0ea", // fa-paste
  "🖼": "\uf03e", // fa-image
  "👁": "\uf06e", // fa-eye
  "🗑": "\uf1f8", // fa-trash
  "🗣": "\uf075", // fa-comment
  "🗜": "\ued4d", // fa-down_left_and_up_right_to_center
  "🔊": "\uf028", // fa-volume_high
  "🔇": "\uf026", // fa-volume_off
  "📎": "\uf0c6", // fa-paperclip
  "🎙": "\uf130", // fa-microphone
  "🔵": "\uf130", // the microphone loading: its color says so
  "🔴": "\uf130", // the microphone open: its color says so
  "🖋": "\uf040", // fa-pencil
  "⏳": "\uf252", // fa-hourglass_half
  "🔄": "\uf021", // fa-refresh
  "⚙": "\uf013", // fa-gear
  "×": "\uea76", // cod-close: thin, and no wider than its cell
  // Signs a terminal may draw as emojis, in a color and a width of their own.
  "✔": "\uf00c", // fa-check
  "⏎": "\uf1d8", // fa-paper_plane: the prompt, sent
  "✘": "\uf00d", // fa-xmark
  "⚠": "\uf071", // fa-triangle_exclamation
  "▶": "\uf04b", // fa-play
  "⏵": "\uf04b", // fa-play
  "⏸": "\uf04c", // fa-pause
  "⧗": "\uf252", // fa-hourglass_half
  "♀": "\uf221", // fa-venus
  "♂": "\uf222", // fa-mars
  "✦": "\uf005", // fa-star
  "✎": "\uf044", // fa-edit
  "✚": "\uf067", // fa-plus
  "▤": "\uf1de", // fa-sliders
  "◈": "\uefcc", // fa-palette
}

const EMOJI = new RegExp(`(${Object.keys(NERD_ICONS).join("|")})[\ufe0e\ufe0f]?`, "gu")

/**
 * `text` with every emoji and sign replaced by its Nerd Fonts glyph. A terminal
 * draws a glyph wider than its cell, so each one is followed by a blank of its
 * own to spill over, in its color: a text with a two-cell emoji keeps its
 * width, one with a one-cell sign grows by a cell.
 */
export function nerdText(text: string): string {
  // The close mark is thin and stays in its cell: it takes no cell more.
  return text.replace(EMOJI, (_found, emoji: string) => (emoji === "×" ? NERD_ICONS[emoji]! : `${NERD_ICONS[emoji]} `))
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
