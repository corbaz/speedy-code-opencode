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
  line (OpenCode's version, time, tokens, context, the plan's 5-hour,
  weekly and monthly windows and speedy-code's version) and the controls, in the
  original's order. Both shed what does not fit as the terminal narrows; the
  controls left out go to the `⋯` menu.
- Every control takes a click. Menus open framed above the prompt, their
  title and their close mark on the border: voices, kept audios, images,
  microphones, networks and settings. A network takes several accounts
  (`GH`, `GH2`); one footer control opens them all.
- The reply of the session on screen is read aloud when the narrator is on,
  through the original engine, with pause and resume. On Windows a narration kept (a row of the audio
  menu, or ⏵ once the reply was read) plays in the viewer's popup, with its bar to seek back and forth. With the narrator on, an answer's narration is made whole first and then plays in that popup by itself, as soon as it is ready; the popup of a sound or a video has a switch for the speed, x0.5 x0.75 x1 x1.25 x1.5 x2; a narration's popup has **Resumen** after x2: Groq (the system's `GROQ_API_KEY`) sums the narrated text up as a list of points, shown in a popup of its own over the player, drawn as a Markdown preview, with **Escuchar**, Copiar (the clipboard and the prompt), the move mark and the close mark; pressed again, it shows the same points at once. **Escuchar** reads those points aloud with the narrator's voice: they are made into one more narration, kept in the 📎 history, and play in the player in the narration's place; pressed again, it plays them again at once.
  The popup and the footer follow each other: ⏸ on the footer or on the row pauses the popup, and a pause
  pressed in the popup shows on both. Every narration is kept under
  `~/.config/opencode/speedy-code/audio` from the moment it starts, whole even when it is stopped halfway,
  and the same text read again is kept once. A short text whose language cannot be told is read as it is,
  never sent to be translated.
- **leer selección** in the audio menu reads the newer of the text selected with the mouse and the
  clipboard's, as they are when it is pressed, so a text copied by any means while the menu is open is read.
  Where there is the viewer's popup it is made whole first and plays there, with its bar, its speeds and
  Resumen, as an answer does.
  What it reads is in the history at once, and that row is the one playing (⏸ while it sounds, ⏵ paused);
  the selection's own row stays ready for the next text. Clearing the history blanks it too, and passes over
  the text the clipboard and the selection held then.
- The narrator off (🔇) only keeps the replies from being read on their own: reading again, the selection
  and the kept audios work all the same.
- Dictation runs the original streaming model on this machine: nothing is sent
  anywhere. What it hears is written into the prompt.
- The pen corrects what is written in the prompt.
- Two icon sets for the footer, the menus and the status line: emojis, which every terminal has, and Nerd Fonts glyphs, one color each and all
  the same width. A session starts with the glyphs whenever a Nerd Font is installed (for the user or for
  all); with none, as last chosen. ⚙️ → **Barra de estado** → **Usar Nerd Fonts** switches; the row shows five glyphs
  to tell whether the terminal draws them. The setup installs Symbols Nerd Font Mono in the user's
  fonts; a terminal whose font is not a Nerd Font, and that does not fall back to the fonts
  installed, needs a Nerd Font picked in its settings.
- **Ver labels** (on by default): the pointer on a footer control shows what it does just above it,
  dark on yellow (`copiar`, `pegar`, `pegar imagen`, `salir`). ⚙️ → **Barra de estado** →
  **Ocultar labels** turns them off, and the choice is kept.
- The terminal's font, from the same tab: **Fuente de la terminal** puts JetBrains Mono or Meslo
  (their Nerd Fonts builds, so the icons are in them) at 8 to 16 points in Windows Terminal, macOS Terminal (while
  open), Ghostty, kitty, the terminal of VS Code, Kiro, Cursor, Windsurf, Antigravity or Zed (their own settings, when TERM_PROGRAM says it runs there) and iTerm2 (a profile of its own, `speedy-code`, that the tab is put on and whose new windows open maximized; set it as the default for new tabs), by `setup/terminal_font.py`. A program in a terminal has no font of its
  own: the terminal's settings change, and each file keeps a copy as it first was
  (`.speedy-font.bak`). Warp, WezTerm, Alacritty and editors take the font,
  `JetBrainsMono NF` or `MesloLGS Nerd Font`, in their own settings. The setup installs both, and
  ⚙ → Instalación says whether they are there.
- After the exit, the footer shows the folder, home as `~`, and its git branch; a click on the folder
  opens the explorer in OpenCode's side panel, beside the chat, and another click closes it. On top
  are the disks (each lettered drive on Windows; `/` and each mounted volume on macOS); under them the
  chosen disk's tree, open down to the session's folder, which is marked `●` and put in the middle. A
  folder opens or closes on a click and is read afresh; links show `↪` and are not followed; a folder
  lists at most 500 entries, then `… y N más`. Each disk keeps the folders open in it.
  On the home screen, where OpenCode has no side panel, the mod draws the same explorer at the right
  of the screen, over it, above the footer; a session opened from there takes it to the side panel.
  The explorer is open from the start, and each session shown (a new one, another one, or one moved
  by 📍's **Seguir esta**) opens it again on that session's folder.
  Under the disks, a field takes a path pasted (`D:\Excel\rand.xlsx`, quoted or not; one not absolute
  is taken from the session's folder) and, on Enter, opens the tree down to it and marks it in yellow
  until the next press. Under that field, the filter's: a pattern (`*.pdf`, `a*.docx`; `*` is any text, `?` one character, the case does not matter, and a pattern with neither is a part of the name) and, on Enter, the disk shown is searched, the session's folder and the person's own first, and the tree holds only the files found, under their folders, as they are found; the rule under it says how many, and that it still searches. `× limpiar` beside it ends the search and brings the whole tree back. A filter shows 1000 files at most, and leaves out every `node_modules` and `.git`, Windows' own folder, the Recycle Bin and, on a Mac, the system's folders and each person's Library. Another machine reached by ssh has a disk of its own after this machine's: `mac` and `windows`, when `~/.ssh/config` has a `Host` of that name (a machine with Windows holds its disks under its root, `windows:/C:/Users/ana`, and its filter searches the system's disk) (or the names in `SPEEDY_REMOTES`, apart by commas), with paths written `mac:/Users/ana`. Its folders are read there, the filter searches its whole disk, and a file pressed is copied to the temporary folder and shown; 📋 copies that copy and 🔗 the path as that machine writes it. ✏ renames its files and folders there and 🗑 sends them to that machine's Recycle Bin or Trash, where they can be got back, once the same dialogs asked. ssh must reach it without asking anything (a key, no password), and it needs Python (`python3`, or `python` on Windows); nothing is installed on it. A machine's disk opens down to its person's folder, marked and in the middle; one with Windows at its root, where its disks are. A presentation (pptx, ppt) opens as its slides and a Word document (docx, doc) as its pages, under the bar a PDF has (go to a page, zoom, fit the width, the whole page), with Texto beside them: on Windows the pages are PowerPoint's and Word's own where they are installed, and without them Edge prints the popup's own drawing of a .pptx or a .docx. A presentation's bar has `Run` (F5): it plays the slides one at a time, each whole over the entire screen; the arrows, Space, Enter, the page keys or a click go on and back, and Esc ends it. `↗ abrir en el sistema` still opens the session's folder in Explorer, or in
  Finder. `⊟` beside the
  disks collapses every disk: the session's stays open down to its folder, the others close to their
  first level, and the disk shown stays shown. Every file is drawn yellow, its name cut
  with `…` to its row. A click selects a file or a folder, its row filled and `⋯` at its end, and a double
  click opens it: a folder open or closed, which one click on its `▸` or `▾` does too, and a file in a
  popup in the middle of the screen with dark scroll
  bars (`engine/view_file.ps1`; on macOS `engine/view_file.py`, the same popup in HTML): text and code selectable, with Copiar; md, html
  and svg drawn, with a switch to their source; minified code laid out; pdf (its pages, and its text by
  `pdfminer.six`), pictures, spreadsheets and documents; sound and video, played; databases as tables;
  shortcuts with their target; any other file read as text when it is text and described when it is
  not. Copiar's text goes to the clipboard and into the prompt, on a line of its own; a picture it takes
  is attached to the prompt as `@path`. `✥` beside the popup's `×`, held down with the mouse, carries the
  popup elsewhere to read what is behind it; opened again, it stands in the middle. The image popup and
  the rename and delete dialogs have it too, in one style. While the pointer is on a file's row, the row keeps a yellow
  fill; a folder's, a blue fill; and so while it is the one selected. The tools of a file or a folder are its menu, which opens inside the explorer, under the row (over it where the room under is short): with the right button on the row, with Ctrl and a click, or with a press on `⋯` at the end of the row selected. Its tools stand one under the other, each with what it does at its right; a press on one does it, and a press anywhere else closes the menu, as moving the tree does. While a popup of the explorer is up, a dialog's (rename, delete, paste, new folder) or the viewer a file of the tree opened, the explorer holds still: no row fills under the pointer, none is selected or opened, no menu opens, and its header and the wheel move nothing, so the one row filled is the one the popup is about; the popup closed, it is as before. `📋` puts the file on the clipboard (to paste in a folder) and
  attaches it to the prompt as `@path`; `🔗` puts its path on the clipboard and in the prompt; `✏`
  asks the new name in a dialog in the middle of the screen (`engine/dialog.ps1`; on macOS
  `engine/dialog.py`, the same popup drawn in HTML) and renames it, refusing an empty name, `\ / : * ? " < > |` or another file's name; `🗑` asks
  and sends it to the Recycle Bin, or the Trash. 📥, right after 📋, pastes what 📋 took, a file or a folder: it is grey until 📋 took one, and 📋 and 📥 go one right after the other: any other tool of the explorer, or a control of the footer, lets go of what 📋 took. In a folder's menu (a file's has no 📥), it asks whether to copy or to move it there and, once chosen, whether for sure. With a filter on, a file pasted shows in the filter's tree when its name matches the pattern. Where its name is taken (the folder it is in, or another that has one of that name) it first says so and asks a new name, a free one offered (`informe (2).txt`, `fotos (2)`), name and extension apart for a file; into the folder it is in it is then copied alone, as moved there it would only be renamed. The tools stand in this order: 📁 crear carpeta, 📋 copiar, 📥 pegar carpeta, 🔗 copiar path, ✏ renombrar, 🗑 borrar, 📍 espacio de trabajo. Nothing is written over, a folder does not go into itself, and what was moved is taken no more. 📥 goes across machines as well, copied or moved: what 📋 took on another machine comes here, what it took here goes there, and within that machine too (a folder with its files and folders, by tar over ssh; links are left out); not from one machine to another one. 📁, the first tool, makes a folder, on this machine or on another one reached by ssh: a dialog in the middle of the screen asks its name (the first free of `Nueva carpeta`, `Nueva carpeta (2)`…, all selected) and says where it goes, with **Crear** and **Cancelar**; it goes inside the folder of the row (a file's menu has no 📁). A name the system does not take, or one already there, is refused and nothing is written over; the folder it went into is read again and opened to show it. 📍, the last tool, is on the folders of this machine alone: it opens the `+` menu for that folder, which says `Trabajar en:` and the folder and names the session after it. **Nueva sesión** makes a session in that folder; **Seguir esta** moves the session open there (OpenCode's own session move; with none open, it makes one); **Cancelar** leaves everything as it was. The session's own folder opens nothing. A disk's root has the seven tools as well, to make a folder or paste into it; 📋, ✏ and 🗑 are grey there, and say why. A file's name pressed is green until its popup is up, then stays marked yellow, as the file being looked at, until another press. A tool of the menu acts on one press. What 📋 and 🔗 put into the prompt (a file's mention, a path) goes there once: pressed again, they write nothing that is there already. The menu says what each tool does: Crear carpeta, Copiar archivo or Copiar carpeta, Copiar path, Renombrar and Borrar the file or the folder, Pegar archivo or Pegar carpeta for what 📋 took, Cambiar espacio de trabajo; a grey one says why (`Pegar: primero copiá algo`, `Borrar: no se hace con un disco`). Beside the filter's ×, `‖ pausar` holds a search that runs, the tree keeping what it found, and `▸ seguir` lets it go on from where it was; a search goes on up to 50,000 files. The panel draws the first 300 rows of a filter's tree and says how many files more were found: thousands of rows stall it. An empty cell parts the rows from the scroll bar. With ⚙'s Nerd Fonts icons the tools are glyphs in their
  colors; the row whose `📋`, `🔗`, `📁` or `📍` was pressed is green for a second. One
  popup at a time: another closes it. In the status line, a click on `opencode:v…` opens that version's
  release notes and one on `5hs`, `semana` or `mes` the console of the workspace the host names: the links are in Claude's orange. speedy-code's version,
  `vyy.mmdd(hhmm)` (the moment of the clone's last commit, in Buenos Aires time), closes the
  status line; it is asked of git every minute. Every hour the plugin asks GitHub (a `git fetch`,
  which changes no file) whether main has commits the clone lacks: then a yellow `↓` follows the
  version, and 🔄 takes them (a fast-forward that never overwrites a change of your own, then
  `bun install` when the packages changed) before it reloads.
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
- The popups (the viewer, the player and its Resumen, the image, the dialogs of ✏ 🗑 📥 📁) belong to the terminal they were opened from: they stand above its window and no other, open on its screen, and another program in front covers them. On Windows they are owned by the terminal's window, so they go and come back with it when it is minimized and restored; on macOS they hide while another program is in front and come back with the terminal. Where no terminal is found (over ssh, under tmux's server) they stay above every window, as before.

## Known limitations

- In VS Code (and its forks) the window's zoom must be a whole level (`window.zoomLevel` 0, 1, 2…): at a fractional one the terminal places the clicks in the wrong cells, and the footer's controls do not answer or answer for their neighbor. A terminal opened before the zoom changed keeps the old measures: open a new one.
- Only an image pasted with the 🖼️ or 📥 control is kept for the 👁️ menu; one
  pasted with the keyboard is not.
- Translating a reply and telling a long one short need `GROQ_API_KEY`;
  without it the reply is read as written.
- The 5-hour and weekly windows are the OpenCode Go plan's; another plan shows none.
- Another machine's disk in the explorer is reached by ssh (a `Host mac` or `Host windows` in `~/.ssh/config`, with a key that asks no password, and a Python there; `remote.py`). A connection cut at once, as on a network that falters, is tried again twice before the explorer says there is none. On a Mac, a folder that is that machine's disk mounted over the network (`/Volumes/share`) is left out of the disks: the disk shows once, under its machine.

## Install

Requirements: [OpenCode](https://opencode.ai) 2.3 or later, git and [bun](https://bun.sh). Nothing needs
administrator rights; everything else (uv, Python 3.12, the voices, the dictation and its model, about
750 MB) is installed under the user's own folders.

Office is not needed on Windows: with none, Office's old files are read by the readers the setup adds (`msdoc2docx`, `sharepoint-to-text`): a .doc with its headings, bold and tables, an .xls as its sheets, and of a .ppt the words of each slide, not its drawing. With Office they open through it, as before; `SPEEDY_NO_OFFICE=1` in the environment shows them as on a machine with none.

The setup also looks for what the mod uses beside its own Python (`setup/extras.py`), and ⚙️ → Instalación shows each: ffmpeg, which on Windows it downloads when there is none (gyan.dev's release build, about 120 MB, into the mod's own folder; on macOS it only says how to get it); git and bun; the other machines the explorer reaches by ssh, each tried; and on macOS the Accessibility permission, whose settings' pane it opens when the terminal does not have it.

⚙️ → Instalación has two buttons more: **Instalar sin dictado** installs all but the dictation's model (750 MB less; `SPEEDY_NO_DICTATION`), and **Desinstalar**, pressed twice, takes away what the setup put in the mod's own folder (the Python environment, the model and its own ffmpeg; `setup/uninstall.ps1`, `uninstall.sh`) and keeps the audios, images, history and settings, the fonts and uv.

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

Then restart OpenCode (or 🔄 in the footer). With a yellow `↓` after the version, 🔄 does all of
this by itself. Run the setup script again only when the engine's
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
