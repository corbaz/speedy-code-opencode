# speedy-code for OpenCode

An OpenCode V2 port of speedy-code. This repository is independent from the
Claude Code plugin and is discovered automatically when cloned into:

- Windows: `%USERPROFILE%\.config\opencode\plugins\speedy-code`
- macOS: `~/.config/opencode/plugins/speedy-code`

The port is under active development. The current scaffold verifies global
plugin discovery, server storage, TUI slots, and the boundary around composer
draft insertion, which OpenCode 2.3.0 does not expose as a public plugin API.
