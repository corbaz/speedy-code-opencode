/**
 * What `/speedy` does with its argument.
 *
 * The original footer was click-driven: each control sent its own message. The
 * OpenCode footer has no pointer surface, so the same controls are reached by
 * naming them. This router is pure so the documented keywords are pinned by
 * tests instead of living only in TUI wiring.
 */

export type CommandAction =
  | { readonly kind: "settings" }
  | { readonly kind: "narrator"; readonly on: boolean }
  | { readonly kind: "voices" }
  | { readonly kind: "history" }
  | { readonly kind: "dictation" }
  | { readonly kind: "stop" }
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "unknown" }

/** Shown when the argument names nothing. */
export const COMMAND_HELP = "speedy-code: usa on, off, stop, pausa, seguir, voces, historial o dictado"

/** Routes one `/speedy` argument, ignoring case and surrounding spaces. */
export function routeCommand(input: string): CommandAction {
  switch (input.trim().toLowerCase()) {
    case "":
    case "ajustes":
    case "settings":
      return { kind: "settings" }
    case "on":
      return { kind: "narrator", on: true }
    case "off":
      return { kind: "narrator", on: false }
    case "voces":
    case "voices":
      return { kind: "voices" }
    case "historial":
    case "history":
      return { kind: "history" }
    case "dictado":
    case "dictation":
      return { kind: "dictation" }
    case "stop":
      return { kind: "stop" }
    case "pausa":
    case "pause":
      return { kind: "pause" }
    case "seguir":
    case "resume":
      return { kind: "resume" }
    default:
      return { kind: "unknown" }
  }
}
