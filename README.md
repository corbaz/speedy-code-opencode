# speedy-code for OpenCode

An OpenCode V2 port of speedy-code. This repository is independent from the
Claude Code plugin and is discovered automatically when cloned into:

- Windows: `%USERPROFILE%\.config\opencode\plugins\speedy-code`
- macOS: `~/.config/opencode/plugins/speedy-code`

The port is under active development. The current scaffold verifies global
plugin discovery, server storage, TUI slots, and the boundary around composer
draft insertion, which OpenCode 2.3.0 does not expose as a public plugin API.

## Current status

The OpenCode package loads today, and the portable narration, playback,
dictation, polishing, history, and setup engine has been imported. The OpenCode
controls that invoke those capabilities are still being implemented. Until that
integration is complete, loading the plugin shows the `SPEEDY` footer marker
but does not provide the complete Claude Code feature set.

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
`%USERPROFILE%\.config\opencode\speedy-code`. To enable prompt polishing, pass
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
`~/.config/opencode/speedy-code`. To enable prompt polishing, export
`GROQ_API_KEY` in your shell before starting OpenCode.

## Update

From the plugin directory on either platform:

```bash
git pull
bun install
```

Run the platform setup script again only when engine dependencies change. An
open OpenCode TUI can load updated plugin code with `/reload`.

This repository currently has no remote URL. Replace `<repository-url>` after
the repository is published; publishing and pushing are separate maintainer
actions.
