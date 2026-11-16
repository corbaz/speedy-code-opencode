import { spawn } from "node:child_process"
import { appendFile, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { Plugin } from "@opencode/plugin/tui"
import { Show, createSignal } from "solid-js"

import { COMMAND_HELP, routeCommand } from "./commands"
import { Dictation } from "./dictation"
import { createListener, createPlayer, createSpeaker } from "./engine"
import {
  DISABLED_COLOR,
  footerControls,
  footerFit,
  footerRoom,
  hiddenGroups,
  visibleControls,
  type FooterControl,
  type SpeechState,
} from "./footer"
import { ClipPlayer, listClips, type HistoryClip } from "./history"
import {
  INITIAL_MENU,
  MenuFrame,
  SELECTION_CLIP,
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
  adjustLevel,
  cloneSettings,
  languageName,
  movePart,
  resetSettings,
  sameSettings,
  settingsFromSaved,
  voiceFor,
  voiceShortName,
  type SpeedySettings,
} from "./settings"
import { SOCIALS, socialUrl } from "./socials"
import { statusLine, type Run, type StatusLimit } from "./statusline"
import { nameOf, parseMics, parseVoices, type Voice } from "./voices"

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
 * One colored run inside a text. `SpanRenderable` forwards `fg` to
 * `TextNodeRenderable` at runtime, but its published props omit it, so the
 * element is the one place that needs the cast.
 */
function Tinted(props: { fg: string; children?: string }) {
  // @ts-expect-error span takes fg at runtime; its props type omits it.
  return <span fg={props.fg}>{props.children}</span>
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
    const [menus, setMenus] = context.storage.memory<MenuState>("speedy-code.menus.1", {
      initial: { ...INITIAL_MENU },
    })
    // The plan's usage windows, asked now and then.
    const [limits, setLimits] = createSignal<{ five_hour?: StatusLimit; seven_day?: StatusLimit }>({})
    // The minute the status line counts the session in: read by its render, so it redraws.
    const [clock, setClock] = createSignal(Date.now())

    // Repair an older or hand-edited value once, without writing when it is already whole.
    const repaired = settingsFromSaved(settings)
    if (!sameSettings(repaired, settings)) {
      void update((draft) => {
        Object.assign(draft, repaired)
      })
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

    /** Reads `text` aloud with the voice of the language narrated in, and notes which voice it was. */
    const narrate = async (text: string) => {
      const voice = voiceForCode(settings.picks.active)
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
          ? ["powershell", "-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value $env:SPEEDY_TEXT"]
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
              "powershell",
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

    // A finished dictation goes into the prompt, as the original writes it.
    let deliverOnEnd = false

    const deliverDictation = async () => {
      const text = listen.heard.trim()
      setListen((draft) => {
        draft.heard = ""
        draft.partial = ""
      })
      if (!text) {
        toast("no se oyó nada")
        return
      }
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

    const polish = createPolisher(engine)

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

    const openSessions = () => context.keymap.dispatch("session.list")

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

    /** Asks for a network's user name and keeps it; an empty answer clears it. */
    const editSocial = async (id: string) => {
      const social = SOCIALS.find((one) => one.id === id)
      if (!social) return
      const typed = await context.ui.dialog.prompt({
        title: `speedy-code · ${social.name}`,
        description: social.hint ?? "Usuario",
        placeholder: settings.socials[id] || social.hint || "usuario",
      })
      if (typed === undefined) return
      await update((draft) => {
        draft.socials[id] = typed.trim()
      })
    }

    // Clicking a badge does what the original's badge did: opens that profile.
    const openSocial = async (id: string) => {
      const social = SOCIALS.find((one) => one.id === id)
      if (!social) return
      const url = socialUrl(id, settings.socials[id] ?? "")
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
              "powershell",
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
        pendingSelection = selected || (await readClipboard())
        await refreshClips()
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
      if (!pendingSelection) {
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
      setMenus((draft) => {
        draft.clipNow = SELECTION_CLIP
      })
      await narrate(text)
      await refreshClips()
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

    // The controls the footer left out, for the ⋯ menu.
    let hiddenNow: readonly FooterControl[] = []

    // Every control the footer draws runs the same thing its command runs.
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
        case "image":
          return context.keymap.dispatch("prompt.paste")
        case "clear":
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
          return context.keymap.dispatch("session.new")
        case "reload":
          return context.keymap.dispatch("location.reload")
        case "exit":
          return context.keymap.dispatch("app.exit")
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
          return openSessions()
        case "socials":
          setMenus((draft) => {
            draft.settingsTab = "socials"
          })
          return openMenu("settings")
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

    // A reply finishes as one text part ends; only the session on screen is read aloud.
    const disposeNarration = context.data.on("session.text.ended", (event) => {
      const route = context.ui.router.current()
      if (route.type !== "session" || route.sessionID !== event.data.sessionID) return
      const text = plain(event.data.text)
      if (!text.trim()) return
      setReply((draft) => {
        draft.sessionID = event.data.sessionID
        draft.text = text
      })
      if (settings.narrator) void narrate(text)
    })

    /** Asks the host for the plan's windows: the rolling one is the 5-hour window. */
    const askLimits = async () => {
      try {
        const usage = (context.client as unknown as { usage?: { limits?: (input: object) => Promise<LimitsShape> } })
          .usage
        const go = (await usage?.limits?.({}))?.data?.go
        const window = (one: { percent?: number; resetsAt?: number } | undefined): StatusLimit | undefined =>
          one && typeof one.percent === "number" ? { percent: one.percent, resetsAt: one.resetsAt } : undefined
        setLimits({ five_hour: window(go?.rolling), seven_day: window(go?.weekly) })
      } catch {
        // No plan, or no answer: the line is drawn without the windows.
      }
    }
    void askLimits()

    let ticks = 0
    const ticking = setInterval(() => {
      setClock(Date.now())
      ticks += 1
      if (ticks % 2 === 0) void askLimits()
    }, 30000)

    const columnsNow = () => context.renderer?.terminalWidth ?? 80
    const rowsNow = () => (context.renderer as unknown as { terminalHeight?: number }).terminalHeight ?? 40

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
          model: info?.name ?? modelID,
          effort: picked?.variant ?? session?.model?.variant,
          durationMs: session?.time?.created ? clock() - session.time.created : 0,
          inputTokens: last?.tokens?.input,
          outputTokens: last?.tokens?.output,
          cacheReadTokens: last?.tokens?.cache?.read,
          cacheWriteTokens: last?.tokens?.cache?.write,
          contextSize: info?.limit?.context,
          costUsd: sessionID ? context.data.session.cost(sessionID) : 0,
          limits: limits(),
          now: clock(),
        },
        columns,
        settings.barLevels,
        settings.barOrder,
      )
    }

    const StatusRow = (props: { sessionID?: string }) => (
      <Show when={settings.statusBar}>
        <box flexDirection="row" flexShrink={0} paddingLeft={1}>
          <text wrapMode="none" selectable={false}>
            {statusRuns(props.sessionID, columnsNow()).map((run) => (
              <Tinted fg={run.color}>{run.text}</Tinted>
            ))}
          </text>
        </box>
      </Show>
    )

    /** The row of controls, each its own box so each takes its own click. */
    const FooterRow = () => {
      const view = () => {
        const model = context.ui.model.current()
        const linked = SOCIALS.flatMap((social) => {
          const handle = settings.socials[social.id] ?? ""
          return handle.trim() ? [{ id: social.id, badge: social.badge, color: social.color }] : []
        })
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
          language: settings.picks.active.toUpperCase(),
          polishing: wand.busy,
          socials: linked,
        })
        const result = footerFit(controls, footerRoom(columnsNow()))
        hiddenNow = hiddenGroups(controls, result) as FooterControl[]
        const shown = visibleControls(controls, result)
        // The bar after the networks goes with them.
        const hasSocials = shown.some((control) => control.name.startsWith("social:"))
        return { shown: shown.filter((control) => control.name !== "divider" || hasSocials), hidden: hiddenNow }
      }
      return (
        <box flexDirection="row" flexShrink={0}>
          {view().shown.map((control) => (
            <box
              flexShrink={0}
              onMouseUp={control.id === undefined ? undefined : () => void runControl(control.id as string)}
            >
              <text wrapMode="none" selectable={false}>
                <Tinted fg={control.color}>{control.text}</Tinted>
              </text>
            </box>
          ))}
          {view().hidden.length > 0 ? (
            <box flexShrink={0} onMouseUp={() => void runControl("more")}>
              <text wrapMode="none" selectable={false}>
                <Tinted fg="#adb5bd">{" ⋯ "}</Tinted>
              </text>
            </box>
          ) : null}
        </box>
      )
    }

    /** While dictating: what was heard so far, over the prompt as the original shows it. */
    const HeardRow = () => (
      <Show when={listen.state !== "off"}>
        <box flexDirection="row" flexShrink={0} paddingLeft={1}>
          <text wrapMode="none" selectable={false}>
            <Tinted fg={listen.state === "on" ? "#ff6b6b" : "#748ffc"}>
              {listen.state === "on" ? "🔴 " : "🔵 cargando el modelo… "}
            </Tinted>
            <Tinted fg="#adb5bd">{`${listen.heard}${listen.partial}`.slice(-Math.max(20, columnsNow() - 12))}</Tinted>
          </text>
        </box>
      </Show>
    )

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
      systemName: process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
      editSocial: (id) => void editSocial(id),
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
      hidden: () => hiddenNow,
      runControl: (id) => void runControl(id),
    }

    // In a session the menu and what is being dictated sit over the prompt.
    const disposeMenu = context.ui.slot({
      append: "session.composer.top",
      render: () => (
        <box flexDirection="column" flexShrink={0}>
          <MenuFrame api={menuApi} />
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
          <box flexDirection="column" flexShrink={0}>
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
        <box flexDirection="column" flexShrink={0}>
          <MenuFrame api={menuApi} />
          <HeardRow />
          <StatusRow />
          <FooterRow />
        </box>
      ),
    })

    return () => {
      disposeNarration()
      disposeMenu()
      disposeFooter()
      disposeHome()
      clearInterval(ticking)
      void dictation.stop()
      void clipPlayer.stop()
      return narration.stop()
    }
  },
})
