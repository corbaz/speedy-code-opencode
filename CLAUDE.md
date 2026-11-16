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
| `src/statusline.ts` | Pure status line: parts, colors, priority fit |
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
- **Slot content takes clicks.** The mouse is on by default (`cli.json`
  `mouse` defaults to `true`), and a `<box onMouseUp>` inside a slot receives
  the click; verified by driving the real TUI through a pseudo terminal. A
  `<span>` inside a `<text>` does not: give each control its own box.
- **Host commands run by name.** `keymap.dispatch(id)` runs any reachable
  host command: `prompt.paste`, `prompt.clear`, `prompt.submit`, `model.list`,
  `variant.list`, `session.compact`, `session.new`, `location.reload`,
  `app.exit`. `keymap.commands()` lists them. The footer uses these for paste,
  clear, send, the model, the effort, compact, new, reload and exit.
- **No call reads the prompt text.** Text goes in as a paste does: on the
  system clipboard, then `prompt.paste`. Dictation is delivered that way.
- **Session data**: `data.session.get(id)` (model, cost, tokens, time),
  `data.session.message.list(id)` (each assistant message has `tokens`),
  `data.location.model.list()` (`name`, `limit.context`),
  `data.location.vcs.info()`, `app.version`. The status line is drawn from these.
- **Layout**: `prompt.footer` is one row; a sibling placed `before` it lands in
  the same row. Two rows need one claim that renders a column. On the home
  screen the prompt is narrow and centered, so both rows go `before: "home.footer"`.
- **Available and used**: `storage.store` (durable), `storage.memory`
  (ephemeral), `ui.dialog.select/alert/confirm/prompt`, `ui.toast.show`,
  `ui.model.current()`, `ui.model.variant.list/set`, `ui.router.navigate`,
  `ui.keymap.layer`, `data.on`, `data.session.list`, `renderer.copyToClipboardOSC52`.
- **Not resolvable locally**: `@opencode/client`. Do not build features on it;
  the last reply is tracked from `session.text.ended` for that reason.

## Deliberate differences from the original

- The footer is click-driven like the original, and the same actions are also
  reachable by name (`/speedy on`, `voces`, `historial`, `dictado`, `copiar`, `pulir`,
  `modelo`, `sesiones`, `redes`, `leer`) and through palette commands.
- The original rewrites long or foreign-language replies with a model before
  reading them. That rewrite is **not** ported: replies are read as written.
- The status line has no 5-hour and weekly limits: those are Claude
  subscription figures the host does not have.
- The model and the effort open the host's own lists, which are the only way
  to change the model.

## Open work

1. **Framed menus.** The original opens its menus (voices by language and
   gender, kept audios, settings with accounts and the bar order) as framed
   panels above the prompt; this port opens the host's dialogs, with fewer
   choices. Also not ported: the pasted-image history (👁️), the microphone
   picker (▾) and correcting the draft with the pen (it polishes the reply).
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
