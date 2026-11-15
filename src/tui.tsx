import { Plugin } from "@opencode/plugin/tui"

import { DISABLED_COLOR, footerControls, footerFit, footerRoom } from "./footer"
import {
  LEVEL_KEYS,
  LANGUAGES,
  SPEEDY_STORE_KEY,
  adjustLevel,
  cloneSettings,
  DEFAULT_SETTINGS,
  languageName,
  resetSettings,
  settingsFromSaved,
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

export default Plugin.define({
  id: "speedy-code.tui",
  setup(context) {
    const [settings, update] = context.storage.store(SPEEDY_STORE_KEY, { initial: DEFAULT_SETTINGS })

    // Repair an older or hand-edited value once, without writing when it is already whole.
    const repaired = settingsFromSaved(settings)
    if (JSON.stringify(repaired) !== JSON.stringify(settings)) {
      void update((draft) => {
        Object.assign(draft, repaired)
      })
    }

    const voiceName = () => languageName(settings.picks.active)

    const setNarrator = async (on: boolean) => {
      await update((draft) => {
        draft.narrator = on
      })
      context.ui.toast.show({
        message: on ? "speedy-code: narrador encendido" : "speedy-code: narrador apagado",
        variant: "info",
      })
    }

    const toggleNarrator = () => setNarrator(!settings.narrator)

    const openVoices = async () => {
      const code = await context.ui.dialog.select<string>({
        title: "speedy-code · voz",
        placeholder: "Idioma",
        current: settings.picks.active,
        options: LANGUAGES.map(([id, es, en]) => ({
          title: `🗣  ${es}`,
          value: id,
          description: en,
          footer: settings.picks[id],
        })),
      })
      if (code === undefined) return
      await update((draft) => {
        draft.picks.active = code
      })
      context.ui.toast.show({ message: `speedy-code: ${languageName(code)}`, variant: "info" })
    }

    const openBar = async () => {
      const key = await context.ui.dialog.select<LevelKey>({
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
      if (key === undefined) return
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
      if (choice === "voice") await openVoices()
      if (choice === "bar") await openBar()
      if (choice === "reset") await resetBar()
    }

    const runCommand = async (input: string) => {
      const argument = input.trim().toLowerCase()
      if (argument === "" || argument === "ajustes" || argument === "settings") return openSettings()
      if (argument === "on") return setNarrator(true)
      if (argument === "off") return setNarrator(false)
      if (argument === "voces" || argument === "voices") return openVoices()
      context.ui.toast.show({ message: "speedy-code: usa on, off o voces", variant: "warning" })
    }

    context.keymap.layer(() => ({
      commands: [
        {
          id: "speedy",
          title: "speedy-code",
          description: "Encender, apagar o elegir la voz: on, off, voces",
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
      ],
    }))

    const disposeFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const columns = context.renderer?.terminalWidth ?? 80
        const controls = footerControls({
          narrator: settings.narrator,
          speech: "idle",
          listening: "off",
          model: context.ui.model.current()?.modelID,
          voice: voiceName(),
        })
        const result = footerFit(controls, footerRoom(columns))
        const hidden = controls.filter((control) => !result.shown.has(control.name))

        return (
          <box flexDirection="row">
            {controls
              .filter((control) => result.shown.has(control.name))
              .map((control) => (
                <text fg={control.color}>
                  {result.compact.has(control.name) && control.compactText ? control.compactText : control.text}
                </text>
              ))}
            {hidden.length > 0 ? <text fg={DISABLED_COLOR}> ⋯ </text> : null}
          </box>
        )
      },
    })

    return disposeFooter
  },
})
