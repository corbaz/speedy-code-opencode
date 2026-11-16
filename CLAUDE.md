# speedy-code for OpenCode — working notes

This repository is an independent OpenCode V2 port of the Claude Code
`speedy-code` plugin. It is discovered automatically by OpenCode when cloned
into the global plugin directory.

## Where to work

| What | Where |
| --- | --- |
| This repository (Windows) | `C:\Users\Sancho\.config\opencode\plugins\speedy-code` |
| This repository (macOS clone) | `~/.config/opencode/plugins/speedy-code` |
| Original Claude Code plugin (READ ONLY) | `C:\Users\Sancho\.claude\local-mods\plugins\speedy-code` |

**Never modify anything under `C:\Users\Sancho\.claude\local-mods`.** It is the
reference implementation, kept byte-identical on purpose. The engine under
`engine/` is a faithful copy of that project's MIT-licensed scripts; the host
code under `src/` is the rewrite.

## Git

- Branch: `feature/opencode-port`.
- The repository has **no remote yet**. Creating one, pushing, opening a pull
  request and merging are the maintainer's decisions; do not do them unasked.
- Commit in reviewable work units (about 400 authored changed lines) with
  Conventional Commit messages. Tests and docs travel with the behavior.

## Commands

```bash
bun install     # once, and after dependency changes
bun test        # 162 tests across 12 files
bun run typecheck
```

Both must pass before a commit. `bun test` is the only runner; there is no
other test framework in the project.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | The server part of the plugin (`speedy-code.server`) |
| `src/tui.tsx` | The terminal part (`speedy-code.tui`): footer, commands, dialogs, narration, dictation |
| `src/commands.ts` | Pure router for `/speedy <word>` |
| `src/settings.ts` | Durable settings, languages, voices, socials, status-line levels |
| `src/footer.ts` | Pure footer layout: controls, cell widths, adaptive fit |
| `src/speech.ts` | The one-sound-at-a-time contract narration and playback share |
| `src/narration.ts` | Reading a reply aloud, saving it, pausing it |
| `src/history.ts` | Listing kept narrations and playing one back |
| `src/dictation.ts` | The microphone contract of `engine/listen.py` |
| `src/polish.ts` | The wand contract of `engine/polish.py` |
| `src/socials.ts` | The social table and its link templates |
| `src/engine.ts` | Spawning the engine: errors as `error` lines, stderr drained, Windows tree kill |
| `src/capabilities.ts` | What this host exposes and what it does not |
| `engine/` | The original scripts, unchanged. Do not edit without the original |
| `odd/tasks/opencode-port.md` | The tracking document: specs, tasks, evidence, log |
| `tests/` | `bun test` suites, one per module |

## What the host actually gives us

Verified against OpenCode 2.3.0. These are facts, not guesses; do not build on
anything outside this list without checking it first.

- **TUI plugin part**: exported through `./tui` in `package.json`. The server
  part through `.`. Both are auto-discovered under `~/.config/opencode/plugins/`.
- **Slots**: `app`, `home.footer`, `home.footer.status`, `prompt.footer`,
  `prompt.footer.status`, `prompt.footer.file`, `session.composer.top`,
  `sidebar.content`, `sidebar.footer`, `session.panel`.
  - A **bare `<text>` at a slot root takes no room**: wrap slot content in a
    `<box>`.
  - **`<text content={styledText}>` stringifies to `[object Object]`**: build
    colored runs with `<span fg=...>` children instead.
  - **An ancestor replacement beats a descendant one.** Replacing
    `prompt.footer.status` is suppressed by whatever claims `prompt.footer`.
- **No pointer events reach slot content.** `onMouseDown` exists on renderables
  in OpenTUI, but the TUI does not route mouse events into slots in this build,
  and `cli.json` needs `"mouse": true` before the terminal captures any mouse
  at all. The footer's controls are therefore reachable by command, not by
  click.
- **No composer API.** There is no way to read or write the prompt text, so
  dictated words cannot be inserted into the composer; the transcript is copied
  through `renderer.copyToClipboardOSC52` instead.
- **Available and used**: `storage.store` (durable), `storage.memory`
  (ephemeral), `ui.dialog.select/alert/confirm/prompt`, `ui.toast.show`,
  `ui.model.current()`, `ui.model.variant.list/set`, `ui.router.navigate`,
  `ui.keymap.layer`, `data.on`, `data.session.list`, `renderer.copyToClipboardOSC52`.
- **Not resolvable locally**: `@opencode/client`. Do not build features on it;
  the last reply is tracked from `session.text.ended` for that reason.

## Deliberate differences from the original

- The original footer is click-driven. This port reaches the same actions by
  name (`/speedy on`, `voces`, `historial`, `dictado`, `copiar`, `pulir`,
  `modelo`, `sesiones`, `redes`, `leer`) and through palette commands.
- The original rewrites long or foreign-language replies with a model before
  reading them. That rewrite is **not** ported: replies are read as written.
- The original paints a status line. The thresholds are stored and editable,
  but the host owns that bar.
- `send`, `clear`, `compact`, `exit` and `reload` are the host's controls and
  are not duplicated.

## Open work

1. **Footer clicks.** The bar renders on one line with the original's glyphs
   and colors, but it cannot be clicked. Two things would be needed: `"mouse":
   true` in `cli.json`, and one `<box onMouseDown>` per control instead of
   spans inside a single text. The layout risk is real: an earlier row of
   per-control text elements wrapped onto several lines.
2. **Live verification.** Synthesis, playback and dictation were never run
   against a real speaker or microphone: `~/.config/opencode/speedy-code/venv`
   and the models do not exist in the development environment. Those paths are
   covered by contract tests only.
3. **Remote.** No remote URL yet, so the port has never been cloned or pulled
   anywhere.

## Rules for changes here

- Keep the engine's contract intact; the host-independent half of the original
  is the part that was proven.
- Every behavior change needs a test that fails before the fix and passes
  after.
- Do not fake a capability the host lacks. Document it instead.
- Keep the language of the code, comments, identifiers and docs in English.
