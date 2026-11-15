import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { Plugin } from "@opencode/plugin/tui"
import { StyledText, fg as coloredText } from "@opentui/core"

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
  type SpeechState,
} from "./footer"
import { ClipPlayer, clipParts, listClips } from "./history"
import { Narration, historyName, plain } from "./narration"
import { createPolisher } from "./polish"
import {
  DEFAULT_SETTINGS,
  DEFAULT_VOICES,
  LANGUAGE_CODES,
  LEVEL_KEYS,
  LANGUAGES,
  SPEEDY_STORE_KEY,
  adjustLevel,
  cloneSettings,
  languageName,
  resetSettings,
  sameSettings,
  settingsFromSaved,
  voiceFor,
  type LevelKey,
  type SpeedySettings,
} from "./settings"
import { SOCIALS, socialUrl } from "./socials"

/** What each status line level is called in the settings menu. */
const LEVEL_LABELS: Record<LevelKey, string> = {
  contextYellow: "Contexto · amarillo",
  contextRed: "Contexto · rojo",
  limitYellow: "Límite · amarillo",
  limitRed: "Límite · rojo",
}

/** What the settings menu can do. */
type SettingsChoice = "narrator" | "voice" | "bar" | "reset"

/** The plugin's own folder: the engine scripts live beside `src`. */
export const PLUGIN_ROOT = resolve(import.meta.dir, "..")

/** The runtime data root the setup scripts create. */
export const DATA_ROOT = join(homedir(), ".config", "opencode", "speedy-code")

/** The Python that runs the engine: the mod's own environment, else whatever the PATH finds. */
export function pythonPath(): string {
  const owned = process.platform === "win32"
    ? join(DATA_ROOT, "venv", "Scripts", "python.exe")
    : join(DATA_ROOT, "venv", "bin", "python")
  if (existsSync(owned)) return owned
  return process.platform === "win32" ? "python" : "python3"
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
    // The reply on screen, so it can be copied, polished or read again.
    const [reply, setReply] = context.storage.memory<{ sessionID: string; text: string }>(
      "speedy-code.reply",
      { initial: { sessionID: "", text: "" } },
    )
    // The wand's glyph says it is at work while the request is out.
    const [wand, setWand] = context.storage.memory<{ busy: boolean }>("speedy-code.wand", {
      initial: { busy: false },
    })

    // Repair an older or hand-edited value once, without writing when it is already whole.
    const repaired = settingsFromSaved(settings)
    if (!sameSettings(repaired, settings)) {
      void update((draft) => {
        Object.assign(draft, repaired)
      })
    }

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

    const speak = createSpeaker({
      platform: process.platform,
      root: PLUGIN_ROOT,
      python: pythonPath(),
    })

    const narration = new Narration({
      speak,
      controlPath: () => join(DATA_ROOT, "control", `control-${crypto.randomUUID()}.txt`),
      savePath: (input) => join(DATA_ROOT, "audio", historyName(input.text, new Date())),
      writeControl,
      removeControl,
      onState: (state) => {
        setSpeech((draft) => {
          draft.state = state
        })
      },
      onError: (message) => {
        context.ui.toast.show({ message: `speedy-code: ${message}`, variant: "error" })
      },
    })

    const clipPlayer = new ClipPlayer({
      play: createPlayer({
        platform: process.platform,
        root: PLUGIN_ROOT,
        python: pythonPath(),
      }),
      controlPath: () => join(DATA_ROOT, "control", `clip-${crypto.randomUUID()}.txt`),
      writeControl,
      removeControl,
      onState: (state) => {
        setSpeech((draft) => {
          draft.state = state
        })
      },
      onError: (message) => {
        context.ui.toast.show({ message: `speedy-code: ${message}`, variant: "error" })
      },
    })

    // The pause, resume and stop commands drive whichever sound is playing.
    const activeSpeech = () => (clipPlayer.state === "idle" ? narration : clipPlayer)

    // OpenCode 2.3.0 has no way to write into the prompt, so a finished dictation
    // is copied to the terminal's clipboard and shown when that is not available.
    let deliverOnEnd = false

    const deliverDictation = async () => {
      const text = listen.heard.trim()
      setListen((draft) => {
        draft.heard = ""
        draft.partial = ""
      })
      if (!text) {
        context.ui.toast.show({ message: "speedy-code: no se oyó nada", variant: "info" })
        return
      }
      const copied = context.renderer?.copyToClipboardOSC52?.(text) ?? false
      if (copied) {
        context.ui.toast.show({ message: "speedy-code: dictado copiado al portapapeles", variant: "success" })
        return
      }
      await context.ui.dialog.alert({ title: "speedy-code · dictado", message: text })
    }

    const dictation = new Dictation({
      listen: createListener({
        platform: process.platform,
        root: PLUGIN_ROOT,
        python: pythonPath(),
      }),
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
      onError: (message) => {
        context.ui.toast.show({ message: `speedy-code: ${message}`, variant: "error" })
      },
    })

    const toggleDictation = async () => {
      if (listen.state === "off") {
        // The voice would be heard by the microphone near the speakers: it pauses.
        if (speech.state === "playing") await narration.pause()
        deliverOnEnd = true
        setListen((draft) => {
          draft.heard = ""
          draft.partial = ""
        })
        context.ui.toast.show({ message: "speedy-code: escuchando", variant: "info" })
        void dictation.start(settings.picks.active ?? "es", settings.mic || undefined)
        return
      }
      // The engine still writes the phrase under way before it ends.
      await dictation.finish()
      context.ui.toast.show({ message: "speedy-code: cerrando el dictado", variant: "info" })
    }

    const stopEverything = async () => {
      deliverOnEnd = false
      setListen((draft) => {
        draft.heard = ""
        draft.partial = ""
      })
      await Promise.all([activeSpeech().stop(), dictation.stop()])
    }

    // OpenCode's clipboard is the terminal's own OSC 52; without it, the text is
    // shown so nothing is silently lost.
    const copyText = async (text: string, label: string) => {
      const copied = context.renderer?.copyToClipboardOSC52?.(text) ?? false
      if (copied) {
        context.ui.toast.show({ message: `speedy-code: ${label} copiado al portapapeles`, variant: "success" })
        return true
      }
      await context.ui.dialog.alert({ title: `speedy-code · ${label}`, message: text })
      return false
    }

    const copyReply = async () => {
      const text = plain(reply.text).trim()
      if (!text) {
        context.ui.toast.show({ message: "speedy-code: no hay respuesta para copiar", variant: "info" })
        return
      }
      await copyText(text, "respuesta")
    }

    const polish = createPolisher({
      platform: process.platform,
      root: PLUGIN_ROOT,
      python: pythonPath(),
    })

    const polishReply = async () => {
      const text = plain(reply.text).trim()
      if (!text) {
        context.ui.toast.show({ message: "speedy-code: no hay respuesta para pulir", variant: "info" })
        return
      }
      context.ui.toast.show({ message: "speedy-code: puliendo la respuesta", variant: "info" })
      setWand((draft) => {
        draft.busy = true
      })
      let result: Awaited<ReturnType<typeof polish>>
      try {
        result = await polish({ text })
      } finally {
        setWand((draft) => {
          draft.busy = false
        })
      }
      if ("error" in result) {
        context.ui.toast.show({ message: `speedy-code: ${result.error}`, variant: "error" })
        return
      }
      setReply((draft) => {
        draft.text = result.text
      })
      await copyText(result.text, "respuesta pulida")
    }

    const openModel = async () => {
      const model = context.ui.model.current()
      if (!model) {
        context.ui.toast.show({ message: "speedy-code: no hay modelo seleccionado", variant: "info" })
        return
      }
      const variants = context.ui.model.variant.list()
      if (variants.length === 0) {
        context.ui.toast.show({ message: `speedy-code: ${model.modelID} no tiene variantes`, variant: "info" })
        return
      }

      const chosen = await context.ui.dialog.select<string>({
        title: `speedy-code · ${model.modelID}`,
        placeholder: "Variante",
        current: model.variant ?? "",
        options: [
          { title: "Por defecto", value: "", description: "La variante que el modelo trae de fábrica" },
          ...variants.map((variant) => ({ title: variant, value: variant })),
        ],
      })
      if (chosen === undefined) return

      const changed = context.ui.model.variant.set(chosen || undefined)
      context.ui.toast.show({
        message: changed ? `speedy-code: ${chosen || "variante por defecto"}` : "speedy-code: variante no disponible",
        variant: changed ? "success" : "error",
      })
    }

    const openSessions = async () => {
      const sessions = context.data.session.list()
      if (sessions.length === 0) {
        context.ui.toast.show({ message: "speedy-code: no hay sesiones", variant: "info" })
        return
      }

      const choice = await context.ui.dialog.select<string>({
        title: "speedy-code · sesiones",
        placeholder: "Sesión",
        options: sessions.map((session) => {
          const info = session as { id?: string; title?: string; directory?: string }
          const id = info.id ?? ""
          return { title: info.title || id, value: id, description: info.directory }
        }),
      })
      if (!choice) return

      context.ui.router.navigate({ type: "session", sessionID: choice })
    }

    // Clicking a badge does what the original's badge did: opens that profile.
    const copySocialLink = async (id: string) => {
      const social = SOCIALS.find((one) => one.id === id)
      if (!social) return

      let handle = settings.socials[id] ?? ""
      if (!handle.trim()) {
        const typed = await context.ui.dialog.prompt({
          title: `speedy-code · ${social.name}`,
          description: social.hint ?? "Usuario",
          placeholder: social.hint ?? "usuario",
        })
        if (!typed?.trim()) return
        handle = typed.trim()
        await update((draft) => {
          draft.socials[id] = handle
        })
      }

      const url = socialUrl(id, handle)
      if (!url) return
      await copyText(url, `enlace de ${social.name}`)
    }

    const openSocials = async () => {
      const choice = await context.ui.dialog.select<string>({
        title: "speedy-code · redes",
        placeholder: "Red social",
        options: SOCIALS.map((social) => {
          const handle = settings.socials[social.id] ?? ""
          return {
            title: `${social.badge}  ${social.name}`,
            value: social.id,
            description: handle || social.hint || "sin usuario",
            footer: socialUrl(social.id, handle),
          }
        }),
      })
      if (!choice) return
      await copySocialLink(choice)
    }

    // The play control: pauses what sounds, or reads the last reply again.
    const togglePlay = async () => {
      const sound = activeSpeech()
      if (sound.state === "playing") return sound.pause()
      if (sound.state === "paused") return sound.resume()

      const text = plain(reply.text).trim()
      if (!text) {
        context.ui.toast.show({ message: "speedy-code: no hay respuesta para leer", variant: "info" })
        return
      }
      await clipPlayer.stop()
      await narration.narrate({ text, voice: voiceForCode(settings.picks.active) })
    }

    // Switching the narrator off while it speaks pauses it, so switching it on goes on from there.
    let pausedByOff = false

    const voiceName = () => languageName(settings.picks.active)
    const voiceForCode = (code: string) => voiceFor(settings.picks, code)

    const setNarrator = async (on: boolean) => {
      await update((draft) => {
        draft.narrator = on
      })
      if (!on && speech.state === "playing") {
        await narration.pause()
        pausedByOff = true
      } else if (!on && speech.state === "thinking") {
        await narration.stop()
      } else if (on && pausedByOff && speech.state === "paused") {
        await narration.resume()
      }
      if (on) pausedByOff = false
      context.ui.toast.show({
        message: on ? "speedy-code: narrador encendido" : "speedy-code: narrador apagado",
        variant: "info",
      })
    }

    const toggleNarrator = () => setNarrator(!settings.narrator)

    const openVoice = async () => {
      const code = await context.ui.dialog.select<string>({
        title: "speedy-code · voz",
        placeholder: "Idioma",
        current: settings.picks.active,
        options: LANGUAGES.map(([id, es, en]) => ({
          title: `🗣  ${es}`,
          value: id,
          description: en,
          footer: voiceForCode(id),
        })),
      })
      if (code === undefined) return
      if (!LANGUAGE_CODES.has(code)) return
      await update((draft) => {
        draft.picks.active = code
        // Every language gets a voice, so a pick is never silently mute.
        if (!draft.picks[code]) draft.picks[code] = DEFAULT_VOICES[code] ?? DEFAULT_VOICES.es ?? ""
      })
      context.ui.toast.show({ message: `speedy-code: ${languageName(code)}`, variant: "info" })
    }

    const openBar = async () => {
      await context.ui.dialog.select<LevelKey>({
        title: "speedy-code · barra de estado",
        placeholder: "Umbral",
        options: LEVEL_KEYS.map((one) => ({
          title: `${LEVEL_LABELS[one]}: ${settings.barLevels[one]}%`,
          value: one,
        })),
        actions: [
          {
            bind: "-",
            title: "−5",
            side: "left",
            selection: "required",
            onTrigger: (one) => {
              void update((draft) => {
                draft.barLevels = adjustLevel(draft.barLevels, one, -5)
              })
            },
          },
          {
            bind: "+",
            title: "+5",
            side: "right",
            selection: "required",
            onTrigger: (one) => {
              void update((draft) => {
                draft.barLevels = adjustLevel(draft.barLevels, one, 5)
              })
            },
          },
        ],
      })
    }

    const resetBar = async () => {
      await update((draft) => {
        Object.assign(draft, resetSettings(cloneSettings(draft as SpeedySettings)))
      })
      context.ui.toast.show({ message: "speedy-code: barra restaurada", variant: "success" })
    }

    const openSettings = async () => {
      const choice = await context.ui.dialog.select<SettingsChoice>({
        title: "speedy-code",
        placeholder: "Ajustes",
        options: [
          {
            title: `Narrador: ${settings.narrator ? "encendido" : "apagado"}`,
            value: "narrator",
            description: "Leer las respuestas en voz alta",
          },
          { title: `Voz: ${voiceName()}`, value: "voice", description: "Elegir el idioma de la voz" },
          { title: "Barra de estado", value: "bar", description: "Umbrales de la barra" },
          {
            title: "Restaurar la barra de estado",
            value: "reset",
            description: "Volver a los valores por defecto",
          },
        ],
      })
      if (choice === "narrator") await toggleNarrator()
      if (choice === "voice") await openVoice()
      if (choice === "bar") await openBar()
      if (choice === "reset") await resetBar()
    }

    const openHistory = async () => {
      const clips = await listClips(join(DATA_ROOT, "audio"))
      if (clips.length === 0) {
        context.ui.toast.show({ message: "speedy-code: no hay narraciones guardadas", variant: "info" })
        return
      }

      const choice = await context.ui.dialog.select<string>({
        title: "speedy-code · historial",
        placeholder: "Narración",
        options: clips.map((clip) => {
          const parts = clipParts(clip)
          return { title: `▶  ${parts.description}`, value: clip.path, description: parts.stamp }
        }),
      })
      if (choice === undefined) return

      const clip = clips.find((one) => one.path === choice)
      if (!clip) return

      await narration.stop()
      await clipPlayer.play(clip)
    }

    const runCommand = async (input: string) => {
      const action = routeCommand(input)
      switch (action.kind) {
        case "settings":
          return openSettings()
        case "narrator":
          return setNarrator(action.on)
        case "voices":
          return openVoice()
        case "history":
          return openHistory()
        case "dictation":
          return toggleDictation()
        case "copy":
          return copyReply()
        case "polish":
          return polishReply()
        case "model":
          return openModel()
        case "sessions":
          return openSessions()
        case "socials":
          return openSocials()
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
          id: "speedy.settings",
          title: "speedy-code: ajustes",
          group: "speedy-code",
          palette: true,
          run: () => openSettings(),
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
          description: "Escuchar el micrófono y copiar lo dicho",
          group: "speedy-code",
          palette: true,
          run: () => toggleDictation(),
        },
        {
          id: "speedy.history",
          title: "speedy-code: historial de narraciones",
          group: "speedy-code",
          palette: true,
          run: () => openHistory(),
        },
        {
          id: "speedy.copy",
          title: "speedy-code: copiar la respuesta",
          group: "speedy-code",
          palette: true,
          run: () => copyReply(),
        },
        {
          id: "speedy.polish",
          title: "speedy-code: pulir la respuesta",
          group: "speedy-code",
          palette: true,
          run: () => polishReply(),
        },
        {
          id: "speedy.model",
          title: "speedy-code: variante del modelo",
          group: "speedy-code",
          palette: true,
          run: () => openModel(),
        },
        {
          id: "speedy.sessions",
          title: "speedy-code: sesiones",
          group: "speedy-code",
          palette: true,
          run: () => openSessions(),
        },
        {
          id: "speedy.socials",
          title: "speedy-code: redes",
          group: "speedy-code",
          palette: true,
          run: () => openSocials(),
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
      if (!settings.narrator) return
      const route = context.ui.router.current()
      if (route.type !== "session" || route.sessionID !== event.data.sessionID) return
      const text = plain(event.data.text)
      if (!text.trim()) return
      setReply((draft) => {
        draft.sessionID = event.data.sessionID
        draft.text = text
      })
      void (async () => {
        // A reply being read ends a kept narration that was playing.
        await clipPlayer.stop()
        await narration.narrate({ text, voice: voiceForCode(settings.picks.active) })
      })()
    })

    const disposeFooter = context.ui.slot({
      // Own the whole status row: the plugin's footer is the only thing in it.
      replace: "prompt.footer.status",
      render: () => {
        const columns = context.renderer?.terminalWidth ?? 80
        const model = context.ui.model.current()
        const linked = SOCIALS.flatMap((social) => {
          const handle = settings.socials[social.id] ?? ""
          return handle.trim()
            ? [{ id: social.id, badge: social.badge, color: social.color }]
            : []
        })
        const controls = footerControls({
          narrator: settings.narrator,
          speech: speech.state,
          listening: listen.state,
          model: model?.modelID,
          effort: model?.variant,
          voice: voiceName(),
          language: settings.picks.active.toUpperCase(),
          polishing: wand.busy,
          socials: linked,
        })
        const result = footerFit(controls, footerRoom(columns))
        const shown = visibleControls(controls, result)
        const hidden = hiddenGroups(controls, result)

        // One styled text, never a row of text elements: OpenTUI wraps each text
        // element on its own, and the footer broke into several lines.
        const chunks = shown.map((control) => coloredText(control.color)(control.text))
        if (hidden.length > 0) chunks.push(coloredText(DISABLED_COLOR)(" ⋯ "))
        return <text content={new StyledText(chunks)} wrapMode="none" />
      },
    })

    return () => {
      disposeNarration()
      disposeFooter()
      void dictation.stop()
      return narration.stop()
    }
  },
})
