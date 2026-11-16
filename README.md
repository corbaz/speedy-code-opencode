# speedy-code for OpenCode

An OpenCode V2 port of speedy-code. This repository is independent from the
Claude Code plugin and is discovered automatically when cloned into:

- Windows: `%USERPROFILE%\.config\opencode\plugins\speedy-code`
- macOS: `~/.config/opencode/plugins/speedy-code`

The narration, playback, dictation, polishing, history and setup engine is the
original one, unchanged: the same PowerShell and Python scripts, run by the
same commands, with the same output contract.

## Commands

The footer's controls take clicks, as the original's do. Each one is also
reached by name, through `/speedy <word>` or the palette. Both Spanish and English words work.

| Command | What it does |
| --- | --- |
| `/speedy` or `/speedy ajustes` | Settings menu: installer, status bar, networks |
| `/speedy on` / `/speedy off` | Turns narration on or off |
| `/speedy stop` | Stops whatever is playing and ends a dictation |
| `/speedy pausa` / `/speedy seguir` | Pauses and resumes the sound under way |
| `/speedy voces` | Voice menu: a tab per language, women or men, every voice |
| `/speedy historial` | Audio menu: read the selection, play a kept narration, clear |
| `/speedy dictado` | Starts and closes the microphone |
| `/speedy copiar` | Copies the last reply |
| `/speedy pulir` | Corrects what is written in the prompt, with Groq |
| `/speedy modelo` | Opens the model list |
| `/speedy sesiones` | Switches to another session |
| `/speedy redes` | Settings menu, on the networks |

Palette commands mirror the main ones: `speedy-code: configuración`, `voces`,
`alternar narrador`, `dictado`, `audios guardados`, `copiar la respuesta`,
`corregir lo escrito` and `detener la narración`. Escape closes a menu.

## What the port does

- Two rows under the prompt, and nothing of the host beside them: the status
  line (folder, branch, version, model, effort, time, tokens, context, cost
  and the plan's 5-hour and weekly windows) and the controls, in the
  original's order. Both shed what does not fit as the terminal narrows; the
  controls left out go to the `⋯` menu.
- Every control takes a click. Menus open framed above the prompt, their
  title on the border: voices, kept audios, microphones and settings.
- The reply of the session on screen is read aloud when the narrator is on,
  through the original engine, with pause and resume. Every narration is kept
  under `~/.config/opencode/speedy-code/audio` and can be played back later.
- Dictation runs the original streaming model on this machine: nothing is sent
  anywhere. What it hears is written into the prompt.
- The pen corrects what is written in the prompt.
- A reply in another language is translated before it is read, and a long
  one is told in a few sentences, with the voice chosen.
- An image pasted from the footer is kept: a chip over the prompt shows it,
  and the 👁️ menu shows the last ones and pastes one again.
- Paste, clear, send, new conversation, compact, reload, exit, the model and
  the effort run the host's own commands.
- Preferences survive a restart in one durable store entry.

## Known limitations

- Only an image pasted with the 🖼️ or 📥 control is kept for the 👁️ menu; one
  pasted with the keyboard is not.
- Translating a reply and telling a long one short need `GROQ_API_KEY`;
  without it the reply is read as written.
- The 5-hour and weekly windows are the OpenCode Go plan's; another plan shows none.
- A network keeps one account.

## Install on Windows

Open PowerShell:

```powershell
$plugin = Join-Path $HOME ".config\opencode\plugins\speedy-code"
git clone <repository-url> $plugin
Set-Location $plugin
bun install
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup\install.ps1
opencode plugin list
opencode
```

The setup script installs its Python environment and model under
`%USERPROFILE%\.config\opencode\speedy-code`. To enable `/speedy pulir`, pass
`-GroqKey <key>` once or define `GROQ_API_KEY` as a user environment variable.

## Install on macOS

Open Terminal:

```bash
git clone <repository-url> ~/.config/opencode/plugins/speedy-code
cd ~/.config/opencode/plugins/speedy-code
bun install
bash setup/install.sh
opencode plugin list
opencode
```

The setup script installs its Python environment and model under
`~/.config/opencode/speedy-code`. To enable `/speedy pulir`, export
`GROQ_API_KEY` in your shell before starting OpenCode.

## Update

From the plugin directory on either platform:

```bash
git pull
bun install
```

Run the platform setup script again only when engine dependencies change. An
open OpenCode TUI can load updated plugin code with `/reload`.

## Development

```bash
bun test
bun run typecheck
```

The engine scripts under `engine/` come from the original speedy-code plugin and
keep its MIT license; see `LICENSE`.

This repository currently has no remote URL. Replace `<repository-url>` after
the repository is published; publishing and pushing are separate maintainer
actions.
