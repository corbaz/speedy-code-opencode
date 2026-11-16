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
bun test        # one suite per module
bun run typecheck
```

Both must pass before a commit. `bun test` is the only runner; there is no
other test framework in the project.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | The server part of the plugin (`speedy-code.server`) |
| `src/tui.tsx` | The terminal part (`speedy-code.tui`): state, engine, actions, slots |
| `src/menus.tsx` | The framed menus: voices, audios, microphone, settings, more |
| `src/voices.ts` | Pure voice list: names, countries, the edge-tts listing, microphones |
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
| `engine/` | The original scripts. `listen.py` differs only in where it finds its model |
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
  - **`<text content={styledText}>` stringifies to `[object Object]`**, and a
    `<span fg>` inside a text is drawn in the text's own color: every color
    needs its own `<text fg>`, laid out in a row box.
  - **An element built once cannot be shown twice.** JSX kept in a constant
    and placed under `<Show>` is gone after its first unmount: build it in a
    function called inside the `<Show>`.
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
- **The prompt's text is reachable through the renderer.** While the prompt
  has the focus, `renderer.currentFocusedRenderable` is its text field:
  `plainText` reads the draft, `setText(text)` replaces it and
  `insertText(text)` writes at the cursor. The pen and the dictation use it;
  the clipboard and `prompt.paste` are the fallback.
- **The plan's usage windows**: `client.usage.limits({})` answers
  `data.go.rolling` (the 5-hour window), `weekly` and `monthly`, each with
  `percent` and `resetsAt` in milliseconds. The status line asks every minute.
- **The selection**: `renderer.getSelection()?.getSelectedText()`.
- **Session data**: `data.session.get(id)` (model, cost, tokens, time),
  `data.session.message.list(id)` (each assistant message has `tokens`),
  `data.location.model.list()` (`name`, `limit.context`),
  `data.location.vcs.info()`, `app.version`. The status line is drawn from these.
- **Layout**: `prompt.footer` is one row; a sibling placed `before` it lands in
  the same row. The port replaces `prompt.footer` whole with a column (status
  line, then controls), so nothing of the host is beside it. A menu is drawn
  in `session.composer.top`. On the home screen the prompt is narrow and
  centered, so menu and rows go `before: "home.footer"`. A slot input is
  reactive: read it inside JSX (`<Show when={input.sessionID}>`), never once
  in the render body.
- **Menus are the port's own boxes**, not host dialogs: a bordered `<box>`
  with `title`, and a `<box onMouseUp>` per control. Escape closes the menu
  through a keymap command enabled only while one is open.
- **Available and used**: `storage.store` (durable), `storage.memory`
  (ephemeral), `ui.dialog.select/alert/confirm/prompt`, `ui.toast.show`,
  `ui.model.current()`, `ui.model.variant.list/set`, `ui.router.navigate`,
  `ui.keymap.layer`, `data.on`, `data.session.list`, `renderer.copyToClipboardOSC52`.
- **Not resolvable locally**: `@opencode/client`. Do not build features on it;
  the last reply is tracked from `session.text.ended` for that reason.

## Deliberate differences from the original

- The model and the effort open the host's own lists, which are the only way
  to change the model.
- The original rewrites long or foreign-language replies with Haiku before
  reading them. Here the same rewrite goes through Groq (the pen's key): a
  reply in another language is translated, a long one is told short. Without
  the key the reply is read as written. The reply is read once, when the
  turn ends (`session.execution.succeeded`).
- A pasted image is kept by the port itself, from the clipboard, when a paste
  control is clicked: the host does not list a session's images. An image
  pasted with the keyboard is not kept. An image is shown by the original's
  `engine/view.ps1` popup (Quick Look on macOS).
- On first run the voices, the microphone, the networks and the status line
  levels are read from the Claude Code plugin's store, once (`imported`).
- The status line is drawn by the plugin above its controls; its switch in
  the settings hides it. The 5-hour and weekly windows are the OpenCode Go
  plan's, and are absent on another plan.
- A user name is edited in the host's prompt dialog, not in a field of the menu.
- With no environment of its own, the engine runs with the one the Claude
  Code plugin installed (`~/.claude/speedy-code`), Python and dictation model.

## Open work

1. **Live checks still owed.** Dictating with a voice into the prompt, and
   pasting a real image from the footer inside the TUI, were not run by the
   agent: only their parts were.
2. **Narration voice report.** The maintainer heard a female English voice
   once while `Victor · ES` was chosen. It did not reproduce; every narration
   now appends its voice to `~/.config/opencode/speedy-code/narrations.log`.
3. **Remote.** No remote URL yet, so the port has never been cloned or pulled
   anywhere.

## Verifying in the real TUI

The host can be driven without a person: run `opencode` in a pseudo terminal
(pywinpty on Windows), feed the output to a terminal emulator (pyte) and send
SGR mouse reports (`ESC [ < 0 ; x ; y M` then `m`). Every click described in
the log was verified that way. Editing `src/` reloads the plugin in every
running TUI at once: work in a separate worktree and fast-forward this one
only when typecheck and tests pass.

## Rules for changes here

- Keep the engine's contract intact; the host-independent half of the original
  is the part that was proven.
- Every behavior change needs a test that fails before the fix and passes
  after.
- Do not fake a capability the host lacks. Document it instead.
- Keep the language of the code, comments, identifiers and docs in English.
