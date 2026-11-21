import { execFile, spawn, spawnSync } from "node:child_process"
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"

import { Plugin } from "@opencode/plugin/tui"
import { Show, createEffect, createSignal } from "solid-js"

import { COMMAND_HELP, routeCommand } from "./commands"
import { Dictation } from "./dictation"
import { createListener, createPlayer, createSpeaker } from "./engine"
import {
  DISABLED_COLOR,
  footerControls,
  newSessionChoice,
  versionLabel,
  folderLabel,
  opensFolder,
  folderCommand,
  footerFit,
  footerRoom,
  hiddenGroups,
  visibleControls,
  type FooterControl,
  type SpeechState,
} from "./footer"
import { POWERSHELL } from "./powershell"
import { ClipPlayer, listClips, type HistoryClip } from "./history"
import {
  DraftImages,
  INITIAL_MENU,
  MenuFrame,
  setMenuIcons,
  SELECTION_CLIP,
  type KeptImage,
  type MenuApi,
  type MenuName,
  type MenuState,
  type SetupCheck,
} from "./menus"
import { Narration, historyName, plain } from "./narration"
import { createPolisher } from "./polish"
import {
  DEFAULT_SETTINGS,
  SPEEDY_STORE_KEY,
  LANGUAGES,
  adjustLevel,
  cloneSettings,
  importClaude,
  languageName,
  movePart,
  resetSettings,
  sameSettings,
  settingsFromSaved,
  voiceFor,
  voiceShortName,
  type SpeedySettings,
} from "./settings"
import { SOCIALS, accountLabel, accountUrl, accountsOf, networkOf, nextAccount, withoutEmptyAccounts } from "./socials"
import { iconText } from "./icons"
import { sessionRowsOf } from "./sessions"
import { agentRowsOf } from "./agents"
import { FONT_FAMILIES } from "./settings"
import { statusLine, type Run, type StatusLimit } from "./statusline"
import { nameOf, narrationRequest, parseMics, parseVoices, type Voice } from "./voices"

/** What the status line reads of a session, a message and a model: the host types do not resolve locally. */
interface SessionShape {
  readonly model?: { readonly id?: string; readonly variant?: string }
  readonly time?: { readonly created?: number }
  readonly location?: { readonly directory?: string }
}
interface MessageShape {
  readonly type?: string
  readonly tokens?: {
    readonly input?: number
    readonly output?: number
    readonly cache?: { readonly read?: number; readonly write?: number }
  }
}
interface ModelShape {
  readonly name?: string
  readonly limit?: { readonly context?: number }
}
/** The plan's usage windows, as the host's `usage.limits` answers. */
interface LimitsShape {
  readonly data?: {
    readonly workspace?: { readonly id?: string }
    readonly go?: Record<string, { readonly percent?: number; readonly resetsAt?: number } | undefined>
  }
}
/** The prompt's text field, as the renderer holds it while it has the focus. */
interface EditorShape {
  readonly plainText?: string
  setText?: (text: string) => void
  insertText?: (text: string) => void
}

/**
 * One colored stretch of a row: a text of its own. A `<span fg>` inside a text
 * is drawn in the text's color, so every color needs its own text element.
 */
function Tinted(props: { fg: string; bold?: boolean; children?: string }) {
  return (
    <text wrapMode="none" selectable={false} flexShrink={0} fg={props.fg} attributes={props.bold ? 1 : 0}>
      {props.children}
    </text>
  )
}

/** The plugin's own folder: the engine scripts live beside `src`. */
export const PLUGIN_ROOT = resolve(import.meta.dir, "..")

/** The runtime data root the setup scripts create. */
export const DATA_ROOT = join(homedir(), ".config", "opencode", "speedy-code")

/** Where the Claude Code plugin keeps the same environment: used when this one was never installed. */
export const CLAUDE_ROOT = join(homedir(), ".claude", "speedy-code")

/**
 * The Python that runs the engine: this port's own environment, else the one
 * the Claude Code plugin installed, else whatever the PATH finds.
 */
export function pythonPath(): string {
  const inVenv = (root: string) =>
    process.platform === "win32" ? join(root, "venv", "Scripts", "python.exe") : join(root, "venv", "bin", "python")
  for (const root of [DATA_ROOT, CLAUDE_ROOT]) {
    if (existsSync(inVenv(root))) return inVenv(root)
  }
  return process.platform === "win32" ? "python" : "python3"
}

/** Runs one short command and gives what it printed; a command that cannot start exits with -1. */
function run(
  argv: readonly string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string }> {
  return new Promise((done) => {
    let stdout = ""
    try {
      const child = spawn(argv[0] as string, argv.slice(1), {
        env: { ...process.env, PYTHONIOENCODING: "utf-8", ...env },
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      })
      child.stdout?.setEncoding("utf8")
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk
      })
      child.on("error", () => done({ code: -1, stdout }))
      child.on("exit", (code) => done({ code: code ?? -1, stdout }))
    } catch {
      done({ code: -1, stdout })
    }
  })
}

export default Plugin.define({
  id: "speedy-code.tui",
  setup(context) {
    const [settings, update] = context.storage.store(SPEEDY_STORE_KEY, { initial: DEFAULT_SETTINGS })
    const [speech, setSpeech] = context.storage.memory<{ state: SpeechState }>("speedy-code.speech", {
      initial: { state: "idle" },
    })
    const [listen, setListen] = context.storage.memory<{
      state: "off" | "loading" | "on"
      heard: string
      partial: string
    }>("speedy-code.listen", { initial: { state: "off", heard: "", partial: "" } })
    // The reply on screen, so it can be copied or read again.
    const [reply, setReply] = context.storage.memory<{ sessionID: string; text: string }>(
      "speedy-code.reply",
      { initial: { sessionID: "", text: "" } },
    )
    // The pen's glyph says it is at work while the request is out.
    const [wand, setWand] = context.storage.memory<{ busy: boolean }>("speedy-code.wand", {
      initial: { busy: false },
    })
    const [menus, setMenus] = context.storage.memory<MenuState>("speedy-code.menus.2", {
      initial: { ...INITIAL_MENU },
    })
    // The plan's usage windows, asked now and then.
    const [limits, setLimits] = createSignal<{ five_hour?: StatusLimit; seven_day?: StatusLimit; monthly?: StatusLimit }>({})
    // The page of the workspace's usage, as the host names the workspace: where a click on a window goes.
    const [usageUrl, setUsageUrl] = createSignal("")
    // The minute the status line counts the session in: read by its render, so it redraws.
    const [clock, setClock] = createSignal(Date.now())
    // The version that closes the status line: the last commit of this clone, asked of git before the
    // first draw and again every minute, so a pull shows without a new session.
    const versionArgs = ["-C", PLUGIN_ROOT.split(sep).join("/"), "log", "-1", "--format=%ct"]
    const [version, setVersion] = createSignal((() => {
      try {
        // Forward slashes: a git reached through a shell wrapper loses the backslashes of a Windows path.
        const asked = spawnSync("git", versionArgs, {
          encoding: "utf8",
          windowsHide: true,
          timeout: 3000,
        })
        return asked.status === 0 ? versionLabel(Number(asked.stdout.trim())) : ""
      } catch {
        return ""
      }
    })())
    /** Asks git again, apart from the draw: the label changes only when the clone's last commit did. */
    const askVersion = (): void => {
      try {
        execFile("git", versionArgs, { windowsHide: true, timeout: 3000 }, (error, stdout) => {
          const label = error ? "" : versionLabel(Number(String(stdout).trim()))
          if (label && label !== version()) setVersion(label)
        })
      } catch {
        // No git to run: the label stays as it was.
      }
    }

    // Repair an older or hand-edited value once, without writing when it is already whole.
    const repaired = settingsFromSaved(settings)
    if (!sameSettings(repaired, settings)) {
      void update((draft) => {
        Object.assign(draft, repaired)
      })
    }

    // What the Claude Code plugin keeps is brought in once: the voices, the microphone and the networks.
    if (!settings.imported) {
      void (async () => {
        let claude: unknown
        try {
          const dir = join(homedir(), ".claude", "plugins", "store")
          const name = (await readdir(dir)).find((one) => /^speedy-code_speedy-code-.*\.json$/.test(one))
          if (name) claude = JSON.parse(await readFile(join(dir, name), "utf8"))
        } catch {
          // No Claude Code plugin on this machine: the defaults stay.
        }
        await update((draft) => {
          Object.assign(draft, importClaude(cloneSettings(draft as SpeedySettings), claude))
        })
      })()
    }

    const toast = (message: string, variant: "info" | "success" | "error" | "warning" = "info") =>
      context.ui.toast.show({ message: `speedy-code: ${message}`, variant })

    const writeControl = async (path: string, asked: "pause" | "play") => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, asked, "utf8")
    }

    const writeDictation = async (path: string, asked: "listen" | "stop") => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, asked, "utf8")
    }

    const removeControl = async (path: string) => {
      await rm(path, { force: true })
    }

    const engine = { platform: process.platform, root: PLUGIN_ROOT, python: pythonPath() }

    // A sound that ends leaves no row of the history menu marked as playing.
    const onSpeech = (state: SpeechState) => {
      setSpeech((draft) => {
        draft.state = state
      })
      if (state === "idle") {
        setMenus((draft) => {
          draft.clipNow = ""
        })
      }
    }

    const narration = new Narration({
      speak: createSpeaker(engine),
      controlPath: () => join(DATA_ROOT, "control", `control-${crypto.randomUUID()}.txt`),
      savePath: (input) => join(DATA_ROOT, "audio", historyName(input.text, new Date())),
      writeControl,
      removeControl,
      onState: onSpeech,
      onError: (message) => toast(message, "error"),
    })

    const clipPlayer = new ClipPlayer({
      play: createPlayer(engine),
      controlPath: () => join(DATA_ROOT, "control", `clip-${crypto.randomUUID()}.txt`),
      writeControl,
      removeControl,
      onState: onSpeech,
      onError: (message) => toast(message, "error"),
    })

    // The pause, resume and stop commands drive whichever sound is playing.
    const activeSpeech = () => (clipPlayer.state === "idle" ? narration : clipPlayer)

    const voiceForCode = (code: string) => voiceFor(settings.picks, code)
    // The footer names the voice itself, as the original does: `Victor · ES`.
    const voiceName = () =>
      voiceShortName(voiceForCode(settings.picks.active)) || languageName(settings.picks.active)

    const polish = createPolisher(engine)

    // The narration under way: one asked for after it takes its place.
    let narrating = 0

    /**
     * Reads `answer` aloud with the voice of the language narrated in: as it
     * is, or translated or told short by a model when it is in another
     * language or long, as the original does.
     */
    const narrate = async (answer: string) => {
      const voice = voiceForCode(settings.picks.active)
      const lang = settings.picks.active || "es"
      const mine = ++narrating
      let text = answer
      const request = narrationRequest(answer, lang, LANGUAGES.find(([code]) => code === lang)?.[2] ?? "Spanish")
      if (request) {
        await clipPlayer.stop()
        await narration.stop()
        onSpeech("thinking")
        const result = await polish(request)
        if (mine !== narrating) return
        if ("text" in result && result.text.trim()) text = result.text.trim()
        else onSpeech("idle")
      }
      void appendFile(
        join(DATA_ROOT, "narrations.log"),
        `${new Date().toISOString()} voice=${voice} active=${settings.picks.active} chars=${text.length}\n`,
      ).catch(() => {})
      await clipPlayer.stop()
      await narration.narrate({ text, voice })
    }

    /** The prompt's text field, when it has the focus. */
    const editor = (): EditorShape | undefined => {
      const focused = (context.renderer as unknown as { currentFocusedRenderable?: EditorShape })
        .currentFocusedRenderable
      return focused && typeof focused.plainText === "string" ? focused : undefined
    }

    /** Puts `text` on the system clipboard; false when the system has no way to. */
    const writeClipboard = async (text: string): Promise<boolean> => {
      const argv =
        process.platform === "win32"
          ? [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value $env:SPEEDY_TEXT"]
          : process.platform === "darwin"
            ? ["/bin/sh", "-c", 'printf %s "$SPEEDY_TEXT" | pbcopy']
            : ["/bin/sh", "-c", 'printf %s "$SPEEDY_TEXT" | xclip -selection clipboard']
      return (await run(argv, { SPEEDY_TEXT: text })).code === 0
    }

    /** The system clipboard's text; empty when it holds none. */
    const readClipboard = async (): Promise<string> => {
      const argv =
        process.platform === "win32"
          ? [
              POWERSHELL,
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw",
            ]
          : process.platform === "darwin"
            ? ["pbpaste"]
            : ["xclip", "-selection", "clipboard", "-o"]
      const result = await run(argv)
      return result.code === 0 ? result.stdout.trim() : ""
    }

    /** Writes `text` into the prompt where the cursor is: straight into its field, else as a paste. */
    const typeIntoPrompt = async (text: string): Promise<boolean> => {
      const field = editor()
      if (field?.insertText) {
        field.insertText(text)
        return true
      }
      if (await writeClipboard(text)) {
        context.keymap.dispatch("prompt.paste")
        return true
      }
      return false
    }

    // What is heard goes into the prompt as it is heard, as the original writes it;
    // only what could not be written there is delivered when the dictation ends.
    let deliverOnEnd = false
    let dictationField: EditorShape | undefined

    const deliverDictation = async () => {
      const text = listen.heard.trim()
      setListen((draft) => {
        draft.heard = ""
        draft.partial = ""
      })
      if (!text) return
      if (await typeIntoPrompt(`${text} `)) return
      await context.ui.dialog.alert({ title: "speedy-code · dictado", message: text })
    }

    const dictation = new Dictation({
      listen: createListener(engine),
      controlPath: () => join(DATA_ROOT, "control", `listen-${crypto.randomUUID()}.txt`),
      writeControl: writeDictation,
      removeControl,
      onState: (state) => {
        setListen((draft) => {
          draft.state = state
        })
        if (state === "off" && deliverOnEnd) {
          deliverOnEnd = false
          void deliverDictation()
        }
      },
      onText: (words) => {
        const field = dictationField ?? editor()
        if (field?.insertText) {
          field.insertText(words)
          setListen((draft) => {
            draft.partial = ""
          })
          return
        }
        setListen((draft) => {
          draft.heard += words
        })
      },
      onPartial: (text) => {
        setListen((draft) => {
          draft.partial = text
        })
      },
      onError: (message) => toast(message, "error"),
    })

    const toggleDictation = async () => {
      if (listen.state === "off") {
        // The voice would be heard by the microphone near the speakers: it pauses.
        if (speech.state === "playing") await activeSpeech().pause()
        deliverOnEnd = true
        dictationField = editor()
        setListen((draft) => {
          draft.heard = ""
          draft.partial = ""
        })
        void dictation.start(settings.picks.active ?? "es", settings.mic || undefined)
        return
      }
      // The engine still writes the phrase under way before it ends.
      await dictation.finish()
    }

    const stopEverything = async () => {
      deliverOnEnd = false
      setListen((draft) => {
        draft.heard = ""
        draft.partial = ""
      })
      await Promise.all([activeSpeech().stop(), dictation.stop()])
    }

    const copyText = async (text: string, label: string) => {
      if ((await writeClipboard(text)) || (context.renderer?.copyToClipboardOSC52?.(text) ?? false)) {
        toast(`${label} copiado al portapapeles`, "success")
        return true
      }
      await context.ui.dialog.alert({ title: `speedy-code · ${label}`, message: text })
      return false
    }

    const copyReply = async () => {
      const text = plain(reply.text).trim()
      if (!text) {
        toast("no hay respuesta para copiar")
        return
      }
      await copyText(text, "respuesta")
    }

    /** The pen: corrects what is written in the prompt, as the original does. */
    const polishDraft = async () => {
      if (wand.busy) return
      const field = editor()
      const draft = field?.plainText?.trim() ?? ""
      if (!field || !draft) {
        toast("escribí algo en el prompt para corregirlo")
        return
      }
      setWand((one) => {
        one.busy = true
      })
      let result: Awaited<ReturnType<typeof polish>>
      try {
        result = await polish({ text: draft })
      } finally {
        setWand((one) => {
          one.busy = false
        })
      }
      if ("error" in result) {
        toast(result.error, "error")
        return
      }
      if (field.setText) field.setText(result.text)
      else await copyText(result.text, "texto corregido")
    }

    // Opens a link in the system's browser; false when the system cannot.
    const openLink = (url: string): boolean => {
      const argv =
        process.platform === "win32"
          ? ["cmd", "/c", "start", "", url.replaceAll("&", "^&")]
          : [process.platform === "darwin" ? "open" : "xdg-open", url]
      try {
        const child = spawn(argv[0] as string, argv.slice(1), { stdio: "ignore", windowsHide: true, detached: true })
        child.on("error", () => {})
        child.unref()
        return true
      } catch {
        return false
      }
    }

    /** Reads the sessions the host keeps, for their menu. */
    const refreshSessions = async () => {
      try {
        const sessions = (context.client as unknown as { session: { list: (input?: object) => Promise<unknown> } }).session
        const found = sessionRowsOf(await sessions.list({}))
        setMenus((draft) => {
          draft.sessions = found
        })
      } catch {
        // No answer: the menu says there are none.
      }
    }

    /** The `☰` menu's click: goes to that session, in its tab when it has one. */
    const openSession = (id: string) => {
      closeMenu()
      if (!context.ui.tabs.focus(id)) context.ui.router.navigate({ type: "session", sessionID: id })
    }

    /** The `+` menu's answer: a session under the name typed; an empty name is the host's own. */
    const startSession = async (name: string) => {
      closeMenu()
      const choice = newSessionChoice(name)
      if (choice.kind === "none") return
      if (choice.kind === "plain") return context.keymap.dispatch("session.new")
      try {
        const made = await context.client.session.create({
          title: choice.title,
          location: context.location ?? context.data.location.default(),
        })
        if (!context.ui.tabs.focus(made.id)) context.ui.router.navigate({ type: "session", sessionID: made.id })
      } catch (error) {
        toast(`no pude crear la sesión: ${error instanceof Error ? error.message : String(error)}`, "error")
      }
    }

    /** Asks for a network's user name and keeps it; an empty answer clears it. */
    const editSocial = async (id: string) => {
      const social = SOCIALS.find((one) => one.id === networkOf(id))
      if (!social) return
      const typed = await context.ui.dialog.prompt({
        title: `speedy-code · ${social.name}`,
        description: social.hint ?? "Usuario",
        placeholder: settings.socials[id] || social.hint || "usuario",
      })
      await update((draft) => {
        if (typed !== undefined) draft.socials[id] = typed.trim()
        // An added account left empty goes.
        draft.socials = withoutEmptyAccounts(draft.socials)
      })
    }

    /** The + of a network: another account of it, asked for at once. */
    const addAccount = async (id: string) => {
      const key = nextAccount(settings.socials, id)
      await update((draft) => {
        draft.socials[key] = draft.socials[key] ?? ""
      })
      await editSocial(key)
    }

    /** The − of an added account: it goes, whatever it holds. */
    const removeAccount = async (key: string) => {
      if (!key.includes("#")) return
      await update((draft) => {
        delete draft.socials[key]
      })
    }

    // Clicking a badge does what the original's badge did: opens that profile.
    const openSocial = async (id: string) => {
      const social = SOCIALS.find((one) => one.id === networkOf(id))
      if (!social) return
      const url = accountUrl(id, settings.socials[id] ?? "")
      if (!url) return editSocial(id)
      if (!openLink(url)) await copyText(url, `enlace de ${social.name}`)
    }

    // The play control: pauses what sounds, or reads the last reply again.
    const togglePlay = async () => {
      const sound = activeSpeech()
      if (sound.state === "playing") return sound.pause()
      if (sound.state === "paused") return sound.resume()
      const text = plain(reply.text).trim()
      if (!text) {
        toast("no hay respuesta para leer")
        return
      }
      await narrate(text)
    }

    // Switching the narrator off while it speaks pauses it, so switching it on goes on from there.
    let pausedByOff = false

    const setNarrator = async (on: boolean) => {
      await update((draft) => {
        draft.narrator = on
      })
      if (!on && speech.state === "playing") {
        await activeSpeech().pause()
        pausedByOff = true
      } else if (!on && speech.state === "thinking") {
        await narration.stop()
      } else if (on && pausedByOff && speech.state === "paused") {
        await activeSpeech().resume()
      }
      if (on) pausedByOff = false
    }

    const toggleNarrator = () => setNarrator(!settings.narrator)

    /** The neural voices edge-tts offers in the tabs' languages. */
    const loadVoices = async () => {
      const result = await run([pythonPath(), "-m", "edge_tts", "--list-voices"])
      const found = result.code === 0 ? parseVoices(result.stdout) : []
      if (found.length > 0) {
        setMenus((draft) => {
          draft.voices = found
        })
      }
      return found
    }

    /** The microphones connected, as the engine lists them. */
    const loadMics = async () => {
      const result = await run([pythonPath(), join(PLUGIN_ROOT, "engine", "listen.py"), "--list"])
      const found = result.code === 0 ? parseMics(result.stdout) : []
      setMenus((draft) => {
        draft.mics = found
      })
      return found
    }

    const refreshClips = async () => {
      const found = await listClips(join(DATA_ROOT, "audio"))
      setMenus((draft) => {
        draft.clips = found
      })
    }

    const setCheck = (name: string, check: SetupCheck) =>
      setMenus((draft) => {
        draft.setup = { ...draft.setup, [name]: check }
      })

    /** What is installed, checked as the engine uses it. */
    const checkSetup = async () => {
      const python = pythonPath()
      const owned = python !== "python" && python !== "python3"
      setCheck("uv", (await run(["uv", "--version"])).code === 0 ? { state: "ok", detail: "listo" } : { state: "fail", detail: "falta" })
      setCheck("python", owned ? { state: "ok", detail: "listo" } : { state: "fail", detail: "falta" })
      const packages = (await run([python, "-c", "import edge_tts, transcribe_cpp, sounddevice, numpy"])).code === 0
      setCheck("packages", packages ? { state: "ok", detail: "listos" } : { state: "fail", detail: "faltan" })
      const loaded = packages
        ? (await run([python, join(PLUGIN_ROOT, "engine", "listen.py"), "--check", settings.picks.active || "es"])).stdout.trim()
        : ""
      setCheck(
        "model",
        loaded.startsWith("ok ")
          ? { state: "ok", detail: loaded.slice(3) }
          : { state: "fail", detail: loaded.startsWith("fail ") ? loaded.slice(5) : "faltan los paquetes" },
      )
      const mics = packages ? await loadMics() : []
      setCheck(
        "mics",
        mics.length > 0
          ? { state: "ok", detail: `${mics.length} conectado(s)` }
          : { state: "fail", detail: packages ? "ninguno conectado" : "se buscan al instalar" },
      )
      const voices = menus.voices.length > 0 ? menus.voices : await loadVoices()
      setCheck(
        "voices",
        voices.length > 0 ? { state: "ok", detail: `${voices.length} voces` } : { state: "fail", detail: "sin conexión" },
      )
      const sidebar = (await run([python, join(PLUGIN_ROOT, "setup", "cli_prefs.py"), "--check"])).stdout.trim()
      setCheck(
        "sidebar",
        sidebar.startsWith("ok ")
          ? { state: "ok", detail: sidebar.slice(3) }
          : { state: "fail", detail: sidebar.startsWith("fail ") ? sidebar.slice(5) : "sin revisar" },
      )
      const font = (await run([python, join(PLUGIN_ROOT, "setup", "nerd_font.py"), "--check"])).stdout.trim()
      setCheck(
        "font",
        font.startsWith("ok ")
          ? { state: "ok", detail: font.slice(3) }
          : { state: "fail", detail: font.startsWith("fail ") ? font.slice(5) : "sin revisar" },
      )
      const fonts = (await run([python, join(PLUGIN_ROOT, "setup", "terminal_font.py"), "--check"])).stdout.trim()
      setCheck(
        "fonts",
        fonts.startsWith("ok ")
          ? { state: "ok", detail: fonts.slice(3) }
          : { state: "fail", detail: fonts.startsWith("fail ") ? fonts.slice(5) : "sin revisar" },
      )
      setCheck(
        "groq",
        process.env.GROQ_API_KEY ? { state: "ok", detail: "presente" } : { state: "fail", detail: "falta GROQ_API_KEY" },
      )
    }

    /** Runs the installer, showing each step as it reports it. */
    const runSetup = () => {
      if (menus.installing) return
      setMenus((draft) => {
        draft.installing = true
        draft.setupLog = []
      })
      const argv =
        process.platform === "win32"
          ? [
              POWERSHELL,
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              join(PLUGIN_ROOT, "setup", "install.ps1"),
            ]
          : ["/bin/bash", join(PLUGIN_ROOT, "setup", "install.sh")]
      const finish = () => {
        setMenus((draft) => {
          draft.installing = false
        })
        engine.python = pythonPath()
        void loadVoices()
        void checkSetup()
      }
      try {
        const child = spawn(argv[0] as string, argv.slice(1), { stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
        let pending = ""
        child.stdout?.setEncoding("utf8")
        child.stdout?.on("data", (chunk: string) => {
          pending += chunk
          const lines = pending.split(/\r?\n/)
          pending = lines.pop() ?? ""
          for (const line of lines) {
            const [word, name = "", ...rest] = line.split(" ")
            const detail = rest.join(" ")
            if (word === "step") setCheck(name, { state: "working", detail })
            else if (word === "ok" || word === "fail") setCheck(name, { state: word, detail })
            else if (word === "info" && line.length > 5) {
              setMenus((draft) => {
                draft.setupLog = [...draft.setupLog, line.slice(5)].slice(-6)
              })
            }
          }
        })
        child.on("error", (error) => {
          toast(`no pude correr el instalador: ${error.message}`, "error")
          finish()
        })
        child.on("exit", finish)
      } catch (error) {
        toast(`no pude correr el instalador: ${error instanceof Error ? error.message : String(error)}`, "error")
        finish()
      }
    }

    // What the 📎 menu reads from its first row: taken when the menu opens.
    let pendingSelection = ""
    // The clipboard while it is still being read for the 📎 menu: its first row waits for it.
    let pendingRead: Promise<void> | undefined

    const closeMenu = () =>
      setMenus((draft) => {
        draft.open = ""
      })

    /** Opens a menu above the prompt; its icon clicked again closes it. */
    const openMenu = async (which: Exclude<MenuName, "">) => {
      if (menus.open === which) return closeMenu()
      if (which === "voices") {
        const active = settings.picks.active || "es"
        const current = menus.voices.find((voice) => voice.value === settings.picks[active])
        setMenus((draft) => {
          draft.tab = active
          draft.page = 0
          if (current) draft.gender = current.gender
        })
        if (menus.voices.length === 0) {
          void loadVoices().then((found) => {
            const now = found.find((voice) => voice.value === settings.picks[active])
            if (now) {
              setMenus((draft) => {
                draft.gender = now.gender
              })
            }
          })
        }
      }
      if (which === "history") {
        const selected =
          (context.renderer as unknown as { getSelection?: () => { getSelectedText?: () => string } | null })
            .getSelection?.()
            ?.getSelectedText?.()
            ?.trim() ?? ""
        // A click leaves a selection of a glyph or two behind: only one that holds words counts. The
        // clipboard is read after the menu is open: PowerShell takes seconds to start on a busy machine.
        pendingSelection = /\p{L}{3,}/u.test(selected) ? selected : ""
        pendingRead = pendingSelection
          ? undefined
          : readClipboard().then((text) => {
              pendingSelection = text
            })
        await refreshClips()
      }
      if (which === "images") await refreshImages()
      if (which === "sessions") await refreshSessions()
      if (which === "agent") {
        const found = agentRowsOf((context.data.location.agent as unknown as { list: () => unknown }).list())
        setMenus((draft) => {
          draft.agents = found
        })
      }
      if (which === "mic") void loadMics()
      if (which === "settings") void checkSetup()
      setMenus((draft) => {
        draft.open = which
      })
    }

    const pickVoice = async (voice: Voice) => {
      await update((draft) => {
        draft.picks[voice.lang] = voice.value
        draft.picks.active = voice.lang
      })
      toast(`el narrador ahora habla en ${languageName(voice.lang)}, con ${voice.name} · ${voice.country}`)
      closeMenu()
    }

    /** The first row of the 📎 menu: reads the selection taken when 📎 was pressed. */
    const readSelection = async () => {
      await pendingRead?.catch(() => {})
      if (!plain(pendingSelection).trim()) {
        toast("seleccioná o copiá un texto primero")
        return
      }
      if (menus.clipNow === SELECTION_CLIP && speech.state !== "idle") {
        if (speech.state === "playing") await narration.pause()
        else if (speech.state === "paused") await narration.resume()
        return
      }
      const text = plain(pendingSelection)
      setReply((draft) => {
        draft.text = text
      })
      await clipPlayer.stop()
      await narration.stop()
      setMenus((draft) => {
        draft.clipNow = SELECTION_CLIP
      })
      void narrate(text).then(refreshClips)
      // The row is marked after the stops above cleared it.
      setMenus((draft) => {
        draft.clipNow = SELECTION_CLIP
      })
    }

    /** A row's button: the narration playing from it pauses or goes on; another row starts. */
    const pressClip = async (clip: HistoryClip) => {
      if (menus.clipNow === clip.path && speech.state === "playing") return clipPlayer.pause()
      if (menus.clipNow === clip.path && speech.state === "paused") return clipPlayer.resume()
      await narration.stop()
      await clipPlayer.stop()
      setMenus((draft) => {
        draft.clipNow = clip.path
      })
      await clipPlayer.play(clip)
    }

    const clearClips = async () => {
      await activeSpeech().stop()
      const dir = join(DATA_ROOT, "audio")
      const names = await readdir(dir).catch(() => [] as string[])
      await Promise.all(
        names.filter((name) => /\.(mp3|txt)$/i.test(name)).map((name) => rm(join(dir, name), { force: true })),
      )
      await refreshClips()
    }

    const pickMic = async (name: string) => {
      await update((draft) => {
        draft.mic = name
      })
      closeMenu()
    }

    const imagesDir = join(DATA_ROOT, "images")

    const refreshImages = async () => {
      const names = (await readdir(imagesDir).catch(() => [] as string[]))
        .filter((name) => /\.png$/i.test(name))
        .sort()
        .reverse()
        .slice(0, 10)
      const found = names.map((name) => ({ path: join(imagesDir, name), stamp: name.replace(/\.png$/i, "") }))
      setMenus((draft) => {
        draft.images = found
      })
      return found
    }

    /** Keeps the image on the clipboard, if it holds one, so it can be seen and pasted again. */
    const keepClipboardImage = async (): Promise<KeptImage | undefined> => {
      const now = new Date()
      const two = (value: number) => String(value).padStart(2, "0")
      const stamp = `${String(now.getFullYear()).slice(2)}-${two(now.getMonth() + 1)}-${two(now.getDate())}_${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`
      const path = join(imagesDir, `${stamp}.png`)
      await mkdir(imagesDir, { recursive: true })
      const argv =
        process.platform === "win32"
          ? [
              POWERSHELL,
              "-NoProfile",
              "-NonInteractive",
              "-STA",
              "-Command",
              "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $image = [Windows.Forms.Clipboard]::GetImage(); if ($image) { $image.Save($env:SPEEDY_IMAGE, [Drawing.Imaging.ImageFormat]::Png); 'kept' } else { 'none' }",
            ]
          : [
              "/bin/sh",
              "-c",
              "osascript -e 'set png to (the clipboard as «class PNGf»)' -e 'set out to open for access POSIX file (system attribute \"SPEEDY_IMAGE\") with write permission' -e 'write png to out' -e 'close access out' >/dev/null 2>&1 && echo kept || echo none",
            ]
      const result = await run(argv, { SPEEDY_IMAGE: path })
      if (result.stdout.trim() !== "kept") return undefined
      await refreshImages()
      return { path, stamp }
    }

    /** The paste controls: the image on the clipboard is kept and shown as a chip, then the host pastes. */
    /** 🖼️: pastes the image on the clipboard, and only an image: it is kept and shown as a chip. */
    const pasteClipboardImage = async () => {
      const kept = await keepClipboardImage()
      if (!kept) {
        toast("no hay una imagen en el portapapeles")
        return
      }
      setMenus((draft) => {
        draft.draftImages = [...draft.draftImages, kept]
      })
      context.keymap.dispatch("prompt.paste")
    }

    /** 📥: pastes the text on the clipboard, and only text. */
    const pasteClipboardText = async () => {
      const text = await readClipboard()
      if (!text) {
        toast("no hay texto en el portapapeles")
        return
      }
      const field = editor()
      if (field?.insertText) field.insertText(text)
      else context.keymap.dispatch("prompt.paste")
    }

    // The image popup open, if any: opening another closes it.
    let viewer: ReturnType<typeof spawn> | undefined

    const closeViewer = () => {
      const open = viewer
      viewer = undefined
      if (!open) return
      try {
        if (process.platform === "win32" && typeof open.pid === "number") {
          spawn("taskkill", ["/pid", String(open.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })
        } else open.kill()
      } catch {
        // Already gone.
      }
    }

    /** Shows an image in a popup in the middle of the screen, in its own proportions, as the original does. */
    const viewImage = (image: KeptImage) => {
      closeViewer()
      const argv =
        process.platform === "win32"
          ? [
              POWERSHELL,
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              join(PLUGIN_ROOT, "engine", "view.ps1"),
            ]
          : process.platform === "darwin"
            ? ["qlmanage", "-p", image.path]
            : ["xdg-open", image.path]
      try {
        const child = spawn(argv[0] as string, argv.slice(1), {
          env: { ...process.env, SPEEDY_IMAGE: image.path },
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        })
        // It says a dot ten times a second while it is up: read and dropped, so it never stalls.
        child.stdout?.on("data", () => {})
        child.on("error", () => toast("no pude abrir la imagen", "error"))
        child.on("exit", () => {
          if (viewer === child) viewer = undefined
        })
        viewer = child
      } catch {
        toast("no pude abrir la imagen", "error")
      }
    }

    /** Pastes a kept image again: it goes on the clipboard, then the host pastes. */
    const pasteImage = async (image: KeptImage) => {
      const argv =
        process.platform === "win32"
          ? [
              POWERSHELL,
              "-NoProfile",
              "-NonInteractive",
              "-STA",
              "-Command",
              "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $image = [Drawing.Image]::FromFile($env:SPEEDY_IMAGE); [Windows.Forms.Clipboard]::SetImage($image); $image.Dispose(); 'set'",
            ]
          : [
              "/bin/sh",
              "-c",
              "osascript -e 'set the clipboard to (read (POSIX file (system attribute \"SPEEDY_IMAGE\")) as «class PNGf»)' >/dev/null 2>&1 && echo set",
            ]
      if ((await run(argv, { SPEEDY_IMAGE: image.path })).stdout.trim() !== "set") {
        toast("no pude pegar la imagen", "error")
        return
      }
      closeMenu()
      setMenus((draft) => {
        draft.draftImages = [...draft.draftImages, image]
      })
      context.keymap.dispatch("prompt.paste")
    }

    const clearImages = async () => {
      const names = await readdir(imagesDir).catch(() => [] as string[])
      await Promise.all(names.map((name) => rm(join(imagesDir, name), { force: true })))
      setMenus((draft) => {
        draft.draftImages = []
      })
      await refreshImages()
    }

    // The controls the footer left out, for the ⋯ menu.
    let hiddenNow: readonly FooterControl[] = []

    // Every control the footer draws runs the same thing its command runs.
    // Opens a folder in the system's file manager, its window in front: see folderCommand.
    const openFolder = (folder: string): void => {
      const { argv, env } = folderCommand(process.platform, folder, PLUGIN_ROOT)
      try {
        // Not detached: Windows PowerShell started with no console at all ends at once, its script unread.
        const child = spawn(argv[0] as string, argv.slice(1), {
          stdio: "ignore",
          windowsHide: true,
          env: { ...process.env, ...env },
        })
        child.on("error", () => {})
        child.unref()
      } catch {
        // No file manager to run: nothing opens.
      }
    }
    // When the folder after the exit was last opened: see opensFolder.
    let folderOpened = 0
    const runControl = async (id: string): Promise<void> => {
      if (id.startsWith("social:")) return openSocial(id.slice("social:".length))
      switch (id) {
        case "copy":
          return void (await copyReply())
        case "polish":
          return polishDraft()
        // The host's own commands, run by their names: its model list changes
        // the model, which no plugin call can.
        case "paste":
          return pasteClipboardText()
        case "image":
          return pasteClipboardImage()
        case "socials":
          return openMenu("socials")
        case "images":
          return openMenu("images")
        case "clear":
          setMenus((draft) => {
            draft.draftImages = []
          })
          return context.keymap.dispatch("prompt.clear")
        case "model":
          return context.keymap.dispatch("model.list")
        case "effort":
          return context.keymap.dispatch("variant.list")
        case "compact":
          return context.keymap.dispatch("session.compact")
        case "send":
          return context.keymap.dispatch("prompt.submit")
        case "new":
          return openMenu("new")
        case "sessions":
          return openMenu("sessions")
        case "agent":
          return openMenu("agent")
        case "reload":
          return context.keymap.dispatch("location.reload")
        case "exit":
          return context.keymap.dispatch("app.exit")
        case "place":
          // The folder after the exit: the system's file manager opens it.
          if (!opensFolder(folderOpened, Date.now())) return
          folderOpened = Date.now()
          return openFolder(context.location?.directory ?? process.cwd())
        case "voice":
          return openMenu("voices")
        case "narrator":
          return toggleNarrator()
        case "mic":
          return toggleDictation()
        case "mics":
          return openMenu("mic")
        case "play":
          return togglePlay()
        case "history":
          return openMenu("history")
        case "settings":
          return openMenu("settings")
        case "more":
          return openMenu("more")
      }
    }

    const runCommand = async (input: string) => {
      const action = routeCommand(input)
      switch (action.kind) {
        case "settings":
          return openMenu("settings")
        case "narrator":
          return setNarrator(action.on)
        case "voices":
          return openMenu("voices")
        case "history":
          return openMenu("history")
        case "dictation":
          return toggleDictation()
        case "copy":
          return void (await copyReply())
        case "polish":
          return polishDraft()
        case "model":
          return context.keymap.dispatch("model.list")
        case "sessions":
          return openMenu("sessions")
        case "socials":
          return openMenu("socials")
        case "play":
          return togglePlay()
        case "stop":
          return stopEverything()
        case "pause":
          return activeSpeech().pause()
        case "resume":
          return activeSpeech().resume()
        default:
          context.ui.toast.show({ message: COMMAND_HELP, variant: "warning" })
      }
    }

    context.keymap.layer(() => ({
      commands: [
        {
          id: "speedy",
          title: "speedy-code",
          description: "Narración y voz: on, off, stop, pausa, seguir, voces, historial, dictado",
          group: "speedy-code",
          slash: { name: "speedy", arguments: true },
          run: (input) => runCommand(input ?? ""),
        },
        {
          id: "speedy.menu.close",
          title: "speedy-code: cerrar el menú",
          group: "speedy-code",
          bind: "escape",
          enabled: () => menus.open !== "",
          run: () => closeMenu(),
        },
        {
          id: "speedy.settings",
          title: "speedy-code: configuración",
          group: "speedy-code",
          palette: true,
          run: () => openMenu("settings"),
        },
        {
          id: "speedy.voices",
          title: "speedy-code: voces",
          group: "speedy-code",
          palette: true,
          run: () => openMenu("voices"),
        },
        {
          id: "speedy.narrator",
          title: "speedy-code: alternar narrador",
          group: "speedy-code",
          palette: true,
          run: () => toggleNarrator(),
        },
        {
          id: "speedy.dictation",
          title: "speedy-code: dictado",
          description: "Escuchar el micrófono y escribir lo dicho en el prompt",
          group: "speedy-code",
          palette: true,
          run: () => toggleDictation(),
        },
        {
          id: "speedy.history",
          title: "speedy-code: audios guardados",
          group: "speedy-code",
          palette: true,
          run: () => openMenu("history"),
        },
        {
          id: "speedy.copy",
          title: "speedy-code: copiar la respuesta",
          group: "speedy-code",
          palette: true,
          run: () => void copyReply(),
        },
        {
          id: "speedy.polish",
          title: "speedy-code: corregir lo escrito",
          group: "speedy-code",
          palette: true,
          run: () => polishDraft(),
        },
        {
          id: "speedy.stop",
          title: "speedy-code: detener la narración",
          group: "speedy-code",
          palette: true,
          run: () => stopEverything(),
        },
      ],
    }))

    // The session whose last text was not read aloud yet.
    let unread = ""

    // A reply's text is kept as each part ends; only the session on screen is read aloud.
    const disposeNarration = context.data.on("session.text.ended", (event) => {
      const route = context.ui.router.current()
      if (route.type !== "session" || route.sessionID !== event.data.sessionID) return
      const text = plain(event.data.text)
      if (!text.trim()) return
      setReply((draft) => {
        draft.sessionID = event.data.sessionID
        draft.text = text
      })
      unread = event.data.sessionID
    })
    // The turn is over: its last words are read, once, as the original reads the answer.
    const disposeTurn = context.data.on("session.execution.succeeded", (event) => {
      if (unread !== event.data.sessionID) return
      unread = ""
      const text = plain(reply.text).trim()
      if (settings.narrator && text) void narrate(text)
    })
    // A message sent takes its image chips with it.
    const disposeSent = context.data.on("session.execution.started", () => {
      setMenus((draft) => {
        draft.draftImages = []
      })
    })

    /** Asks the host for the plan's windows: the rolling one is the 5-hour window. */
    const askLimits = async () => {
      try {
        const usage = (context.client as unknown as { usage?: { limits?: (input: object) => Promise<LimitsShape> } })
          .usage
        const data = (await usage?.limits?.({}))?.data
        const go = data?.go
        // The workspace's id is letters, digits and `_` alone: anything else names no page.
        const workspace = data?.workspace?.id ?? ""
        setUsageUrl(/^[\w-]+$/.test(workspace) ? `https://opencode.ai/console/${workspace}` : "")
        const window = (one: { percent?: number; resetsAt?: number } | undefined): StatusLimit | undefined =>
          one && typeof one.percent === "number" ? { percent: one.percent, resetsAt: one.resetsAt } : undefined
        setLimits({ five_hour: window(go?.rolling), seven_day: window(go?.weekly), monthly: window(go?.monthly) })
      } catch {
        // No plan, or no answer: the line is drawn without the windows.
      }
    }
    void askLimits()

    let ticks = 0
    const ticking = setInterval(() => {
      setClock(Date.now())
      ticks += 1
      if (ticks % 2 === 0) {
        void askLimits()
        askVersion()
      }
    }, 30000)

    // The terminal's size, read again when it changes: a window made smaller or larger (a font changed
    // in a terminal that keeps its rows and columns) fits the footer and the status line again.
    const [resized, setResized] = createSignal(0)
    ;(context.renderer as unknown as { on?: (event: string, listener: () => void) => void } | undefined)?.on?.("resize", () =>
      setResized((count) => count + 1),
    )
    const columnsNow = () => (resized(), context.renderer?.terminalWidth ?? 80)
    const rowsNow = () => (resized(), (context.renderer as unknown as { terminalHeight?: number }).terminalHeight ?? 40)

    /** The status line of the session on screen, or of none on the home screen. */
    const statusRuns = (sessionID: string | undefined, columns: number): Run[] => {
      const picked = context.ui.model.current()
      const session = sessionID ? (context.data.session.get(sessionID) as SessionShape | undefined) : undefined
      const messages = sessionID ? (context.data.session.message.list(sessionID) as MessageShape[]) : []
      const last = [...messages].reverse().find((one) => one.type === "assistant" && one.tokens)
      const modelID = picked?.modelID ?? session?.model?.id
      const info = (context.data.location.model.list() ?? []).find(
        (one) => one.modelID === modelID && (!picked || one.providerID === picked.providerID),
      ) as ModelShape | undefined
      return statusLine(
        {
          cwd: session?.location?.directory ?? context.location?.directory ?? process.cwd(),
          home: homedir(),
          branch: context.data.location.vcs.info()?.branch?.current,
          version: context.app.version,
          app: version(),
          durationMs: session?.time?.created ? clock() - session.time.created : 0,
          inputTokens: last?.tokens?.input,
          outputTokens: last?.tokens?.output,
          cacheReadTokens: last?.tokens?.cache?.read,
          cacheWriteTokens: last?.tokens?.cache?.write,
          contextSize: info?.limit?.context,
          limits: limits(),
          usageUrl: usageUrl(),
          now: clock(),
          icons: settings.icons,
        },
        columns,
        settings.barLevels,
        settings.barOrder,
      )
    }

    const StatusRow = (props: { sessionID?: string }) => (
      <Show when={settings.statusBar}>
        <box flexDirection="row" flexShrink={0} justifyContent="center" width="100%">
          {statusRuns(props.sessionID, columnsNow()).map((run) => (
            <Show
              when={run.link}
              fallback={
                <Tinted fg={run.color} bold={run.bold}>
                  {run.text}
                </Tinted>
              }
            >
              {/* A link: its own box, so it takes its own click. */}
              <box flexShrink={0} onMouseUp={() => void openLink(run.link as string)}>
                <Tinted fg={run.color} bold={run.bold}>
                  {run.text}
                </Tinted>
              </box>
            </Show>
          ))}
        </box>
      </Show>
    )

    /** The row of controls, each its own box so each takes its own click. */
    const FooterRow = () => {
      const view = () => {
        const model = context.ui.model.current()
        // A badge per account with a user name that builds a link, in the networks' order.
        const linked = SOCIALS.flatMap((social) =>
          accountsOf(settings.socials, social.id)
            .filter((key) => accountUrl(key, settings.socials[key] ?? ""))
            .map((key) => ({ id: key, badge: accountLabel(social.badge, key), color: social.color })),
        )
        const named = (context.data.location.model.list() ?? []).find(
          (one) => one.modelID === model?.modelID && one.providerID === model?.providerID,
        ) as ModelShape | undefined
        const voice = voiceForCode(settings.picks.active)
        const controls = footerControls({
          narrator: settings.narrator,
          speech: speech.state,
          listening: listen.state,
          model: named?.name ?? model?.modelID,
          effort: model?.variant,
          voice: nameOf(voice).name || voiceName(),
          voiceColor: LANGUAGES.find(([code]) => code === settings.picks.active)?.[3],
          language: settings.picks.active.toUpperCase(),
          polishing: wand.busy,
          socials: linked,
          icons: settings.icons,
          folder: folderLabel(context.location?.directory ?? process.cwd(), homedir(), sep === "\\" ? "\\" : "/"),
          branch: context.data.location.vcs.info()?.branch?.current,
        })
        const result = footerFit(controls, footerRoom(columnsNow()))
        hiddenNow = hiddenGroups(controls, result) as FooterControl[]
        const shown = visibleControls(controls, result)
        // The bar after the networks goes with them.
        const hasSocials = shown.some((control) => control.name === "socials")
        return { shown: shown.filter((control) => control.name !== "divider" || hasSocials), hidden: hiddenNow }
      }
      return (
        <box flexDirection="row" flexShrink={0} justifyContent="center" width="100%">
          {view().shown.map((control) => (
            <box
              flexShrink={0}
              onMouseUp={control.id === undefined ? undefined : () => void runControl(control.id as string)}
            >
              <Tinted fg={control.color} bold={control.bold}>
                {control.text}
              </Tinted>
            </box>
          ))}
          {view().hidden.length > 0 ? (
            <box flexShrink={0} onMouseUp={() => void runControl("more")}>
              <Tinted fg="#adb5bd" bold>
                {iconText(" ⋯ ", settings.icons)}
              </Tinted>
            </box>
          ) : null}
        </box>
      )
    }

    /** While dictating: what was heard so far, over the prompt as the original shows it. */
    const HeardRow = () => (
      <Show when={listen.state !== "off"}>
        <box flexDirection="row" flexShrink={0} paddingLeft={1}>
          <Tinted fg={listen.state === "on" ? "#ff6b6b" : "#748ffc"}>
            {iconText(listen.state === "on" ? "🔴 dictando " : "🔵 cargando el modelo… ", settings.icons)}
          </Tinted>
          <Tinted fg="#868e96">{`${listen.heard}${listen.partial}`.slice(-Math.max(20, columnsNow() - 16))}</Tinted>
        </box>
      </Show>
    )

    // The theme's own background: a color object the host's elements take as they take a string.
    const screenBackground = (context.theme as unknown as { background?: { base?: string } }).background?.base

    // The menus draw with the icons the settings say.
    createEffect(() => setMenuIcons(settings.icons === "nerd" ? "nerd" : "emoji"))

    const menuApi: MenuApi = {
      settings: settings as SpeedySettings,
      state: menus,
      set: setMenus,
      speech: () => speech.state,
      narrator: () => settings.narrator,
      width: () => Math.max(40, columnsNow() - 4),
      rows: () => Math.max(10, Math.floor(rowsNow() / 2)),
      close: closeMenu,
      pickVoice: (voice) => void pickVoice(voice),
      readSelection: () => void readSelection(),
      pressClip: (clip) => void pressClip(clip),
      clearClips: () => void clearClips(),
      pickMic: (name) => void pickMic(name),
      viewImage,
      pasteImage: (image) => void pasteImage(image),
      clearImages: () => void clearImages(),
      systemName: process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
      openSocial: (key) => void openSocial(key),
      startSession: (name) => void startSession(name),
      openSession: (id) => openSession(id),
      cycleAgent: () => {
        closeMenu()
        context.keymap.dispatch("agent.cycle")
      },
      pickAgent: () => {
        closeMenu()
        context.keymap.dispatch("agent.list")
      },
      sessionNow: () => {
        const route = context.ui.router.current() as { type?: string; sessionID?: string } | undefined
        return route?.type === "session" ? (route.sessionID ?? "") : ""
      },
      background: () => screenBackground,
      editSocial: (id) => void editSocial(id),
      addAccount: (id) => void addAccount(id),
      removeAccount: (key) => void removeAccount(key),
      runSetup,
      adjustLevel: (key, delta) =>
        void update((draft) => {
          draft.barLevels = adjustLevel(draft.barLevels, key, delta)
        }),
      movePart: (key, delta) =>
        void update((draft) => {
          draft.barOrder = movePart(draft.barOrder, key, delta)
        }),
      resetBar: () =>
        void update((draft) => {
          Object.assign(draft, resetSettings(cloneSettings(draft as SpeedySettings)))
        }),
      toggleBar: () =>
        void update((draft) => {
          draft.statusBar = !draft.statusBar
        }),
      barOn: () => settings.statusBar,
      toggleIcons: () =>
        void update((draft) => {
          draft.icons = draft.icons === "nerd" ? "emoji" : "nerd"
        }),
      icons: () => settings.icons,
      setFont: (family, size) => {
        toast(`poniendo ${FONT_FAMILIES.find(([id]) => id === family)?.[1] ?? family} a ${size} pt en tu terminal…`)
        void run([pythonPath(), join(PLUGIN_ROOT, "setup", "terminal_font.py"), "--family", family, "--size", String(size)], {
          PYTHONIOENCODING: "utf-8",
        }).then((result) => {
          const said = result.stdout.trim()
          if (result.code !== 0) return toast(said || "no pude cambiar la fuente: falta instalar", "error")
          void update((draft) => {
            draft.fontSize = size
            draft.fontFamily = family
          })
          toast(said, "success")
        })
      },
      fontSize: () => settings.fontSize,
      fontFamily: () => settings.fontFamily,
      hidden: () => hiddenNow,
      runControl: (id) => void runControl(id),
    }

    // In a session the menu and what is being dictated sit over the prompt.
    const disposeMenu = context.ui.slot({
      append: "session.composer.top",
      render: () => (
        <box flexDirection="column" flexShrink={0}>
          <MenuFrame api={menuApi} />
          <DraftImages api={menuApi} />
          <HeardRow />
        </box>
      ),
    })
    // Both rows own the whole footer of the prompt, the status line over the
    // controls, as the original lays them out: nothing of the host is beside them.
    const disposeFooter = context.ui.slot({
      replace: "prompt.footer",
      render: (input) => (
        <Show when={input.sessionID}>
          <box flexDirection="column" flexShrink={0} flexGrow={1} width="100%">
            <StatusRow sessionID={input.sessionID} />
            <FooterRow />
          </box>
        </Show>
      ),
    })
    // The home screen's prompt is narrow and centered: there everything goes
    // at the bottom of the screen, over the host's own footer.
    const disposeHome = context.ui.slot({
      before: "home.footer",
      render: () => (
        <box flexDirection="column" flexShrink={0} width="100%">
          <MenuFrame api={menuApi} />
          <DraftImages api={menuApi} />
          <HeardRow />
          <StatusRow />
          <FooterRow />
        </box>
      ),
    })

    return () => {
      disposeNarration()
      disposeTurn()
      disposeSent()
      disposeMenu()
      disposeFooter()
      disposeHome()
      clearInterval(ticking)
      closeViewer()
      void dictation.stop()
      void clipPlayer.stop()
      return narration.stop()
    }
  },
})
