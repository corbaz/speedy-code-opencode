import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { Plugin } from "@opencode/plugin/tui"

import { COMMAND_HELP, routeCommand } from "./commands"
import { createSpeaker } from "./engine"
import {
  DISABLED_COLOR,
  footerControls,
  footerFit,
  footerRoom,
  hiddenGroups,
  visibleControls,
  type SpeechState,
} from "./footer"
import { Narration, historyName, plain } from "./narration"
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

    const runCommand = async (input: string) => {
      const action = routeCommand(input)
      switch (action.kind) {
        case "settings":
          return openSettings()
        case "narrator":
          return setNarrator(action.on)
        case "voices":
          return openVoice()
        case "stop":
          return narration.stop()
        case "pause":
          return narration.pause()
        case "resume":
          return narration.resume()
        default:
          context.ui.toast.show({ message: COMMAND_HELP, variant: "warning" })
      }
    }

    context.keymap.layer(() => ({
      commands: [
        {
          id: "speedy",
          title: "speedy-code",
          description: "Narración y voz: on, off, stop, pausa, seguir, voces",
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
          id: "speedy.stop",
          title: "speedy-code: detener la narración",
          group: "speedy-code",
          palette: true,
          run: () => narration.stop(),
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
      void narration.narrate({ text, voice: voiceForCode(settings.picks.active) })
    })

    const disposeFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const columns = context.renderer?.terminalWidth ?? 80
        const controls = footerControls({
          narrator: settings.narrator,
          speech: speech.state,
          listening: "off",
          model: context.ui.model.current()?.modelID,
          voice: voiceName(),
        })
        const result = footerFit(controls, footerRoom(columns))
        const shown = visibleControls(controls, result)
        const hidden = hiddenGroups(controls, result)

        return (
          <box flexDirection="row">
            {shown.map((control) => (
              <text fg={control.color}>{control.text}</text>
            ))}
            {hidden.length > 0 ? <text fg={DISABLED_COLOR}> ⋯ </text> : null}
          </box>
        )
      },
    })

    return () => {
      disposeNarration()
      disposeFooter()
      return narration.stop()
    }
  },
})
