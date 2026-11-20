# speedy-code for OpenCode

**Hablale a OpenCode y escuchalo responder.** Un plugin de OpenCode para Windows y macOS: lee las
respuestas en voz alta con las voces neurales de Microsoft Edge, convierte tu voz en el prompt mientras
hablás, con un modelo que corre en tu máquina, y suma al pie de la pantalla una línea de estado a color y
una barra de atajos (copiar, pegar texto o imagen, corregir el prompt con IA, enviar, sesión nueva, tus
redes, salir).

*Talk to OpenCode and hear it answer: Edge neural voices, local dictation streamed as you speak, a colored
status line and a footer of shortcuts. Windows and macOS.*

---

An OpenCode V2 port of [speedy-code](https://github.com/corbaz/speedy-code), the Claude Code plugin. This repository is independent from the
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
| `/speedy redes` | Networks menu: a click opens a profile |

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
  title and their close mark on the border: voices, kept audios, images,
  microphones, networks and settings. A network takes several accounts
  (`GH`, `GH2`); one footer control opens them all.
- The reply of the session on screen is read aloud when the narrator is on,
  through the original engine, with pause and resume. Every narration is kept
  under `~/.config/opencode/speedy-code/audio` and can be played back later.
- Dictation runs the original streaming model on this machine: nothing is sent
  anywhere. What it hears is written into the prompt.
- The pen corrects what is written in the prompt.
- Two icon sets for the footer, the menus and the status line: emojis, which every terminal has, and Nerd Fonts glyphs, one color each and all
  the same width. ⚙️ → **Barra de estado** → **Usar Nerd Fonts** switches; the row shows five glyphs
  to tell whether the terminal draws them. The setup installs Symbols Nerd Font Mono in the user's
  fonts; a terminal whose font is not a Nerd Font, and that does not fall back to the fonts
  installed, needs a Nerd Font picked in its settings.
- The terminal's font, from the same tab: **Fuente de la terminal** puts JetBrains Mono or Meslo
  (their Nerd Fonts builds, so the icons are in them) at 8 to 16 points in Windows Terminal, macOS Terminal (while
  open), Ghostty, kitty, the terminal of VS Code, Kiro, Cursor or Windsurf (their own settings, when it runs there) and iTerm2 (a profile of its own, `speedy-code`, that the tab is put on; set it as the default for new tabs), by `setup/terminal_font.py`. A program in a terminal has no font of its
  own: the terminal's settings change, and each file keeps a copy as it first was
  (`.speedy-font.bak`). Warp, WezTerm, Alacritty and editors take the font,
  `JetBrainsMono NF` or `MesloLGS Nerd Font`, in their own settings. The setup installs both, and
  ⚙ → Instalación says whether they are there.
- After the exit, the footer shows the version, `v:yy.mmdd-(hhmm)`: the moment of the clone's
  last commit, in Buenos Aires time.
- `Agente ▾`, beside the voice, opens the menu of the agents a person picks: OpenCode has no permission
  modes, what runs without asking is the agent's. Each one with the host's description; a button goes
  to the next one, as Tab, and another opens the host's own list. The host tells no plugin which agent is picked, so the control names none.
- `☰`, after `+`, opens the menu of the sessions OpenCode keeps, newest first, each with its folder and
  when it last changed; the list scrolls, and a click goes to one.
- `+` asks for the new session's name and opens it under that title; an
  empty name leaves the title to OpenCode, and `esc` starts nothing.
- A reply in another language is translated before it is read, and a long
  one is told in a few sentences, with the voice chosen.
- An image pasted from the footer is kept: a chip over the prompt shows it,
  and the 👁️ menu shows the last ones and pastes one again.
- Paste, clear, send, new conversation, compact, reload, exit, the model and
  the effort run the host's own commands.
- Preferences survive a restart in one durable store entry.

## Known limitations

- In VS Code (and its forks) the window's zoom must be a whole level (`window.zoomLevel` 0, 1, 2…): at a fractional one the terminal places the clicks in the wrong cells, and the footer's controls do not answer or answer for their neighbor. A terminal opened before the zoom changed keeps the old measures: open a new one.
- Only an image pasted with the 🖼️ or 📥 control is kept for the 👁️ menu; one
  pasted with the keyboard is not.
- Translating a reply and telling a long one short need `GROQ_API_KEY`;
  without it the reply is read as written.
- The 5-hour and weekly windows are the OpenCode Go plan's; another plan shows none.

## Install

Requirements: [OpenCode](https://opencode.ai) 2.3 or later, git and [bun](https://bun.sh). Nothing needs
administrator rights; everything else (uv, Python 3.12, the voices, the dictation and its model, about
750 MB) is installed under the user's own folders.

### Windows

```powershell
git clone https://github.com/corbaz/speedy-code-opencode "$HOME\.config\opencode\plugins\speedy-code"
Set-Location "$HOME\.config\opencode\plugins\speedy-code"
bun install
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup\install.ps1
```

Option: `-GroqKey <key>` (saves the key the 🖋️ button and the translated narration use).

### macOS

```bash
git clone https://github.com/corbaz/speedy-code-opencode ~/.config/opencode/plugins/speedy-code
cd ~/.config/opencode/plugins/speedy-code
bun install
bash setup/install.sh
```

For 🖋️ and the translated narration, export `GROQ_API_KEY` in `~/.zshrc`.

OpenCode finds the plugin by its folder: no marketplace and no config entry. Restart OpenCode: the
status line and the footer show under the prompt, and `opencode plugin list` names `speedy-code`.
⚙️ → **Instalación** → **Instalar / reparar todo** runs the same setup again at any time. The setup keeps
its Python environment and model under `~/.config/opencode/speedy-code`.

The setup also sets `session.sidebar` to `hide` in `~/.config/opencode/cli.json`, so OpenCode's
session sidebar stays out of the way (a copy of the file as it was is kept as `cli.json.bak`).
`ctrl+x` then `b` shows it again.

### Update

```bash
cd ~/.config/opencode/plugins/speedy-code     # Windows: cd $HOME\.config\opencode\plugins\speedy-code
git pull
bun install
```

Then restart OpenCode (or 🔄 in the footer). Run the setup script again only when the engine's
dependencies change.

### For an AI agent installing it

Do these steps in order, without asking; each is safe to run again.

1. Check that `opencode --version`, `git --version` and `bun --version` work. If `opencode` is missing or
   older than 2.3, stop and tell the user. If `bun` is missing, install it with its official installer
   (`curl -fsSL https://bun.sh/install | bash` on macOS, `irm bun.sh/install.ps1 | iex` on Windows).
2. Detect the system: Windows (PowerShell, `$env:OS -eq 'Windows_NT'`) or macOS (`uname` prints `Darwin`).
3. If `~/.config/opencode/plugins/speedy-code/.git` exists, run `git pull` in it; otherwise clone as above.
   Do not clone anywhere else: OpenCode discovers the plugin by this folder.
4. Run `bun install` in the clone.
5. Run the setup for the system (`setup/install.ps1` on Windows, `bash setup/install.sh` on macOS) and read
   its output: every line starting with `fail` is a step that failed, with the reason after it. The
   Groq key failing is optional (only 🖋️ and the translated narration need it); any other `fail` needs
   fixing before you finish.
6. Run `opencode plugin list` and check that `speedy-code` is listed and not marked `failed`.
7. Tell the user to restart OpenCode. Never ask for or print the Groq key yourself.

## Development

```bash
bun test
bun run typecheck
```

The engine scripts under `engine/` come from the original speedy-code plugin and
keep its MIT license; see `LICENSE`.
