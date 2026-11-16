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
| `/speedy` or `/speedy ajustes` | Settings menu: narrator, voice, status bar, reset |
| `/speedy on` / `/speedy off` | Turns narration on or off |
| `/speedy stop` | Stops whatever is playing and ends a dictation |
| `/speedy pausa` / `/speedy seguir` | Pauses and resumes the sound under way |
| `/speedy voces` | Chooses the language, and with it the voice |
| `/speedy historial` | Plays back one of the narrations kept on disk |
| `/speedy dictado` | Starts and closes the microphone |
| `/speedy copiar` | Copies the last reply |
| `/speedy pulir` | Cleans up the last reply with Groq |
| `/speedy modelo` | Picks a variant of the selected model |
| `/speedy sesiones` | Switches to another session |
| `/speedy redes` | Copies the link of one of your social profiles |

Palette commands mirror them: `speedy-code: ajustes`, `alternar narrador`,
`detener la narración`, `historial de narraciones`, `copiar la respuesta`,
`pulir la respuesta`, `variante del modelo`, `sesiones`, `redes` and `dictado`.

## What the port does

- A `speedy-code` footer above the prompt shows the narration state, the model,
  the language, the narrator switch, the microphone and the settings entry. It
  shortens and sheds its controls as the terminal narrows.
- The reply of the session on screen is read aloud when the narrator is on,
  through the original engine, with pause and resume. Every narration is kept
  under `~/.config/opencode/speedy-code/audio` and can be played back later.
- Every language offered ships a voice, so choosing one is never silently mute.
- Preferences survive a restart in one durable store entry.
- Dictation runs the original streaming model on this machine: nothing is sent
  anywhere. What it hears is copied to the terminal's clipboard.

## Known limitations

- **OpenCode 2.3.0 exposes no API to write into the prompt**, so the port cannot
  append dictated words into the composer the way the original did. It copies
  the transcript to the clipboard instead, and shows it in a dialog when the
  terminal has no clipboard.
- The original opens its menus as framed panels above the prompt and paints a
  statistics bar. Here a click opens the host's own dialog, and there is no
  statistics bar yet.
- Paste, image actions, send, clear, compact, exit and reload stay OpenCode's own
  controls; the plugin does not duplicate what the host already offers.
- A long reply is read as written; the original's model rewrite before narrating
  is not ported.
- The status-bar thresholds are stored and editable, but the bar itself is drawn
  by the host, so the plugin does not paint it.

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
