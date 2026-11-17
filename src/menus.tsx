/**
 * The menus the footer opens, drawn as the original draws them: a frame above
 * the prompt, its title on the top border and a close control at its right end.
 *
 * Every menu is a view of the state it is given and calls back to act, so the
 * plugin's setup owns the state and the engine.
 */

import { For, Show, createSignal } from "solid-js"

import { DISABLED_COLOR, SESSIONS_COLOR, fit, type FooterControl, type SpeechState } from "./footer"
import { sessionStamp, type SessionRow } from "./sessions"
import { clipParts, type HistoryClip } from "./history"
import { iconText, type IconSet } from "./icons"
import {
  BAR_PARTS,
  LANGUAGES,
  LEVEL_KEYS,
  type BarPart,
  FONT_FAMILIES,
  type FontFamily,
  type LevelKey,
  type SpeedySettings,
} from "./settings"
import { SOCIALS, accountLabel, accountUrl, accountsOf, type Social } from "./socials"
import { distinctVoices, micName, voiceTitle, type Voice } from "./voices"

/** The menu on screen; empty when none is. */
export type MenuName = "" | "voices" | "mic" | "history" | "images" | "socials" | "settings" | "more" | "new" | "sessions"

/** One pasted image the port kept: its file and the moment it was pasted. */
export interface KeptImage {
  readonly path: string
  readonly stamp: string
}

export type SettingsTab = "setup" | "bar" | "socials"

/** One step the installer runs, as the settings menu shows it. */
export interface SetupCheck {
  readonly state: "" | "working" | "ok" | "fail"
  readonly detail: string
}

/** What the menus show that is not kept between sessions. */
export interface MenuState {
  open: MenuName
  /** The language tab the voice menu shows. */
  tab: string
  gender: "Female" | "Male"
  page: number
  voices: Voice[]
  mics: string[]
  clips: HistoryClip[]
  /** The sessions the host keeps, newest first, read as their menu opens. */
  sessions: SessionRow[]
  /** The kept narration playing from the history menu: its path; empty when none. */
  clipNow: string
  /** The images kept, newest first. */
  images: KeptImage[]
  /** The images pasted into the draft being written: a chip each over the prompt. */
  draftImages: KeptImage[]
  settingsTab: SettingsTab
  setup: Record<string, SetupCheck>
  setupLog: string[]
  installing: boolean
}

/** The row that reads the selection: it plays as a kept narration does. */
export const SELECTION_CLIP = "selection"

export const INITIAL_MENU: MenuState = {
  open: "",
  tab: "es",
  gender: "Female",
  page: 0,
  voices: [],
  mics: [],
  clips: [],
  sessions: [],
  clipNow: "",
  images: [],
  draftImages: [],
  settingsTab: "socials",
  setup: {},
  setupLog: [],
  installing: false,
}

export const SETUP_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["uv", "uv, el administrador de Python"],
  ["python", "Entorno de Python 3.12"],
  ["packages", "Voces y dictado (edge-tts, transcribe-cpp)"],
  ["model", "Modelo de dictado Nemotron (~750 MB, local)"],
  ["mics", "Micrófonos"],
  ["voices", "Voces de Edge (internet)"],
  ["sidebar", "Barra lateral de OpenCode, oculta"],
  ["font", "Fuente de iconos (Symbols Nerd Font)"],
  ["fonts", "Fuentes de texto (JetBrains Mono, Meslo)"],
  ["groq", "Clave de Groq (la pluma, opcional)"],
]

const SETTINGS_TABS: ReadonlyArray<readonly [SettingsTab, string, string, string]> = [
  ["setup", "Instalación", "#51cf66", "Instalar"],
  ["bar", "Barra de estado", "#4dabf7", "Barra"],
  ["socials", "Redes sociales", "#f783ac", "Redes"],
]

const FEMALE = "#f783ac"
const MALE = "#74c0fc"
const TAB_WIDTH = 14
const NAME_WIDTH = 10
const COUNTRY_WIDTH = 12
const VOICE_WIDTH = 3 + NAME_WIDTH + 1 + COUNTRY_WIDTH + 2
const COLUMN_GAP = 2
const PRIORITY_COLOR = "#74c0fc"
const IMAGE_COLOR = "#74c0fc"
const LEVEL_COLORS: Record<LevelKey, string> = {
  contextYellow: "#ffd43b",
  contextRed: "#ff6b6b",
  limitYellow: "#ffd43b",
  limitRed: "#ff6b6b",
}
const LEVEL_LABELS: Record<LevelKey, readonly [string, string]> = {
  contextYellow: ["Contexto usado · amarillo desde", ""],
  contextRed: ["Contexto usado · rojo desde", "⚠  compactar, y el aviso"],
  limitYellow: ["Límite usado · amarillo desde", ""],
  limitRed: ["Límite usado · rojo desde", "⚠  y el aviso"],
}
const BOLD = 1
const DIM = 2

/** What the menus read and what they ask for. */
export interface MenuApi {
  readonly settings: SpeedySettings
  readonly state: MenuState
  readonly set: (mutation: (draft: MenuState) => void) => void
  readonly speech: () => SpeechState
  readonly narrator: () => boolean
  /** The cells and rows the frame may take. */
  readonly width: () => number
  readonly rows: () => number
  readonly close: () => void
  /** Starts a session under the name typed in the `+` menu; an empty one is the host's own. */
  readonly startSession: (name: string) => void
  /** Goes to a session of the `☰` menu. */
  readonly openSession: (id: string) => void
  /** The session on screen; empty when none is. */
  readonly sessionNow: () => string
  readonly pickVoice: (voice: Voice) => void
  readonly readSelection: () => void
  readonly pressClip: (clip: HistoryClip) => void
  readonly clearClips: () => void
  readonly pickMic: (name: string) => void
  readonly viewImage: (image: KeptImage) => void
  readonly pasteImage: (image: KeptImage) => void
  readonly clearImages: () => void
  readonly systemName: string
  readonly openSocial: (key: string) => void
  /** The screen's own background, so a blank cell covers what is under it. */
  readonly background: () => string | undefined
  readonly editSocial: (key: string) => void
  readonly addAccount: (id: string) => void
  readonly removeAccount: (key: string) => void
  readonly runSetup: () => void
  readonly adjustLevel: (key: LevelKey, delta: number) => void
  readonly movePart: (key: BarPart, delta: -1 | 1) => void
  readonly resetBar: () => void
  readonly toggleBar: () => void
  /** Changes the icon set: emojis, or Nerd Fonts glyphs. */
  readonly toggleIcons: () => void
  readonly icons: () => IconSet
  /** Sets the terminal's font to this family at this size, in points. */
  readonly setFont: (family: FontFamily, size: number) => void
  /** The size last set from here; 0 while the terminal keeps its own font. */
  readonly fontSize: () => number
  /** The family last set from here. */
  readonly fontFamily: () => FontFamily
  readonly barOn: () => boolean
  /** The controls the footer left out for want of room. */
  readonly hidden: () => readonly FooterControl[]
  readonly runControl: (id: string) => void
}

/** The icons every label of the menus is drawn with; the plugin's setup keeps it as the settings say. */
/** The sizes, in points, the terminal's font can be set to from the settings. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16] as const
/** The size a font is set at when none was picked yet. */
export const DEFAULT_FONT_SIZE = 12

export const [menuIcons, setMenuIcons] = createSignal<IconSet>("emoji")

/** A label that takes a click: no fill under the pointer, as the footer's controls. */
export function Btn(props: {
  label: string
  color?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  onPress?: () => void
}) {
  return (
    <box flexShrink={0} onMouseUp={props.onPress ? () => props.onPress?.() : undefined}>
      <text
        wrapMode="none"
        selectable={false}
        fg={props.color}
        bg={props.bg}
        attributes={(props.bold ? BOLD : 0) | (props.dim ? DIM : 0)}
      >
        {iconText(props.label, menuIcons())}
      </text>
    </box>
  )
}

/** Text that takes no click. */
function Label(props: { text: string; color?: string; bg?: string; bold?: boolean; dim?: boolean }) {
  return (
    <text
      wrapMode="none"
      selectable={false}
      fg={props.color}
      bg={props.bg}
      attributes={(props.bold ? BOLD : 0) | (props.dim ? DIM : 0)}
    >
      {iconText(props.text, menuIcons())}
    </text>
  )
}

const languageColor = (code: string) => LANGUAGES.find(([one]) => one === code)?.[3] ?? "#adb5bd"

/** The voice menu: a tab per language, its women or its men, the current voice marked, paged to the rows. */
function VoiceMenu(props: { api: MenuApi }) {
  const api = props.api
  const view = () => {
    const lang = api.state.tab
    const current = api.settings.picks[lang] ?? ""
    const known = distinctVoices(
      api.state.voices.filter((voice) => voice.lang === lang),
      current,
    )
    const shown = api.state.gender
    const list = known.filter((voice) => voice.gender === shown)
    const inside = Math.max(20, api.width() - 4)
    const tabsPerRow = Math.max(1, Math.floor(inside / TAB_WIDTH))
    const tabRows = Math.ceil(LANGUAGES.length / tabsPerRow)
    const columns = Math.min(4, Math.max(1, Math.floor((inside + COLUMN_GAP) / (VOICE_WIDTH + COLUMN_GAP))))
    const voiceRows = Math.max(3, api.rows() - 3 - tabRows - 3)
    const perPage = voiceRows * columns
    const pages = Math.max(1, Math.ceil(list.length / perPage))
    const at = Math.min(api.state.page, pages - 1)
    const page = list.slice(at * perPage, (at + 1) * perPage)
    const perColumn = Math.max(1, Math.ceil(page.length / columns))
    return {
      lang,
      current,
      known,
      shown,
      pages,
      at,
      inside,
      tabsPerRow,
      color: shown === "Female" ? FEMALE : MALE,
      accent: languageColor(lang),
      columns: Array.from({ length: columns }, (_, index) => page.slice(index * perColumn, (index + 1) * perColumn)),
    }
  }
  const turn = (to: number) => api.set((draft) => void (draft.page = Math.min(Math.max(to, 0), view().pages - 1)))
  const tabRowsOf = () => {
    const rows: Array<typeof LANGUAGES> = []
    for (let index = 0; index < LANGUAGES.length; index += view().tabsPerRow) {
      rows.push(LANGUAGES.slice(index, index + view().tabsPerRow))
    }
    return rows
  }

  return (
    <box flexDirection="column">
      <For each={tabRowsOf()}>
        {(row) => (
          <box flexDirection="row">
            <For each={row}>
              {([code, label, , tint]) => {
                const isOpen = () => code === api.state.tab
                const mark = () => (api.settings.picks.active === code ? "▶" : "")
                return (
                  <box width={TAB_WIDTH} flexShrink={0}>
                    <Btn
                      label={fit(` ${label} ${mark()}`, TAB_WIDTH - 1)}
                      bold
                      color={isOpen() ? "black" : tint}
                      bg={isOpen() ? tint : undefined}
                      onPress={() =>
                        api.set((draft) => {
                          draft.tab = code
                          draft.page = 0
                        })
                      }
                    />
                  </box>
                )
              }}
            </For>
          </box>
        )}
      </For>
      <Show when={api.state.voices.length > 0} fallback={<Label text="Cargando voces…" dim />}>
        <box flexDirection="row" marginTop={1} marginBottom={1}>
          <For each={[["Female", "♀ Mujeres", FEMALE], ["Male", "♂ Hombres", MALE]] as const}>
            {([value, label, tint]) => {
              const isOn = () => value === api.state.gender
              const count = () => view().known.filter((voice) => voice.gender === value).length
              return (
                <box marginRight={2} flexShrink={0}>
                  <Btn
                    label={` ${label}  ${count()} `}
                    bold
                    color={isOn() ? "black" : tint}
                    bg={isOn() ? tint : undefined}
                    onPress={() =>
                      api.set((draft) => {
                        draft.gender = value
                        draft.page = 0
                      })
                    }
                  />
                </box>
              )
            }}
          </For>
          <Show when={view().pages > 1}>
            <box flexDirection="row" flexShrink={0}>
              <Btn label=" ◀ " bold color={view().at > 0 ? view().color : DISABLED_COLOR} onPress={() => turn(view().at - 1)} />
              <Label text={` ${view().at + 1}/${view().pages} `} color={view().color} />
              <Btn
                label=" ▶ "
                bold
                color={view().at < view().pages - 1 ? view().color : DISABLED_COLOR}
                onPress={() => turn(view().at + 1)}
              />
            </box>
          </Show>
        </box>
        <box flexDirection="row" columnGap={COLUMN_GAP}>
          <For each={view().columns}>
            {(part) => (
              <box flexDirection="column" width={VOICE_WIDTH} flexShrink={0}>
                <For each={part}>
                  {(voice) => {
                    const isCurrent = () => voice.value === view().current
                    return (
                      <box flexDirection="row" flexShrink={0} onMouseUp={() => api.pickVoice(voice)}>
                        <Label
                          text={isCurrent() ? " ● " : " ♪ "}
                          color={isCurrent() ? "white" : view().color}
                          bg={isCurrent() ? "#2b8a3e" : undefined}
                        />
                        <Label
                          text={`${fit(voice.name, NAME_WIDTH)} `}
                          bold
                          color={isCurrent() ? "white" : undefined}
                          bg={isCurrent() ? "#2b8a3e" : undefined}
                        />
                        <Label
                          text={fit(voice.country, COUNTRY_WIDTH)}
                          color={isCurrent() ? "white" : view().accent}
                          bg={isCurrent() ? "#2b8a3e" : undefined}
                        />
                      </box>
                    )
                  }}
                </For>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}

/** The 📎 menu: the selection, the narrations kept newest first, each with its play button, and clear. */
function HistoryMenu(props: { api: MenuApi }) {
  const api = props.api
  const descriptionWidth = () => Math.max(10, api.width() - 12 - 18)
  const glyphOf = (path: string) => {
    const now = api.speech()
    if (api.state.clipNow !== path) return { glyph: "▶", color: "#63e6be" }
    if (path === SELECTION_CLIP) {
      const glyph = ({ idle: "▶", thinking: "⧗", playing: "⏸︎", paused: "⏵" } as const)[now]
      return { glyph, color: now === "playing" ? "#ffd43b" : "#63e6be" }
    }
    if (now === "playing") return { glyph: "⏸︎", color: "#ffd43b" }
    return { glyph: now === "paused" ? "⏵" : "▶", color: "#63e6be" }
  }
  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <Btn
          label={` ${glyphOf(SELECTION_CLIP).glyph} `}
          color={glyphOf(SELECTION_CLIP).color}
          bold
          onPress={() => api.readSelection()}
        />
        <Label text=" leer selección" color="#ffd43b" bold />
      </box>
      <Show
        when={api.state.clips.length > 0}
        fallback={
          <Label text="  Todavía no hay audios. Se guardan cada vez que se lee una respuesta o una selección." dim />
        }
      >
        <For each={api.state.clips}>
          {(clip) => (
            <box flexDirection="row">
              <Btn
                label={` ${glyphOf(clip.path).glyph} `}
                color={glyphOf(clip.path).color}
                bold
                onPress={() => api.pressClip(clip)}
              />
              <Label text={` ${fit(clipParts(clip).description, descriptionWidth())} ${clipParts(clip).stamp}`} />
            </box>
          )}
        </For>
      </Show>
      <box marginTop={1} flexDirection="row">
        <Btn label=" 🗑️ limpiar historial " color="#ff6b6b" bold onPress={() => api.clearClips()} />
      </box>
    </box>
  )
}

/** The 👁 menu: the images kept, newest first, each with 👁️ to see it and 🖼️ to paste it again. */
function ImagesMenu(props: { api: MenuApi }) {
  const api = props.api
  return (
    <box flexDirection="column">
      <Show
        when={api.state.images.length > 0}
        fallback={<Label text="  Todavía no hay imágenes en el historial." dim />}
      >
        <For each={api.state.images}>
          {(image, index) => (
            <box flexDirection="row">
              <Btn label=" 👁️ " color={IMAGE_COLOR} bold onPress={() => api.viewImage(image)} />
              <Btn label=" 🖼️ " color={IMAGE_COLOR} bold onPress={() => api.pasteImage(image)} />
              <Label text={` [Imagen #${api.state.images.length - index()}] `} color={IMAGE_COLOR} bold />
              <Label text={image.stamp} dim />
            </box>
          )}
        </For>
      </Show>
      <box marginTop={1} flexDirection="row">
        <Btn label=" 🗑️ limpiar historial " color="#ff6b6b" bold onPress={() => api.clearImages()} />
      </box>
    </box>
  )
}

/** The images pasted into the draft, a chip each: a click shows the image. */
export function DraftImages(props: { api: MenuApi }) {
  const api = props.api
  return (
    <Show when={api.state.draftImages.length > 0}>
      <box flexDirection="row" flexShrink={0} paddingLeft={1} columnGap={1}>
        <For each={api.state.draftImages}>
          {(image, index) => (
            <Btn label={`[Imagen #${index() + 1}]`} color={IMAGE_COLOR} bold onPress={() => api.viewImage(image)} />
          )}
        </For>
        <Label text="clic para ver" dim />
      </box>
    </Show>
  )
}

/** The microphone menu: the system's default, then each microphone connected; the one in use marked. */
function MicMenu(props: { api: MenuApi }) {
  const api = props.api
  const chosen = () => (api.state.mics.includes(api.settings.mic) ? api.settings.mic : "")
  return (
    <box flexDirection="column">
      <Show when={api.state.mics.length > 0} fallback={<Label text="Buscando micrófonos…" dim />}>
        <For each={["", ...api.state.mics]}>
          {(name) => {
            const isChosen = () => name === chosen()
            return (
              <box flexDirection="row">
                <Btn
                  label={` ${isChosen() ? "●" : "○"} ${name ? micName(name) : `Predeterminado de ${api.systemName}`} `}
                  bold={isChosen()}
                  color={isChosen() ? "black" : "#ff8787"}
                  bg={isChosen() ? "#ff8787" : undefined}
                  onPress={() => api.pickMic(name)}
                />
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}

/** The ⋯ menu: the controls the footer left out, each with its name. */
function MoreMenu(props: { api: MenuApi }) {
  const api = props.api
  return (
    <box flexDirection="row" flexWrap="wrap">
      <For each={api.hidden().filter((control) => control.id !== undefined)}>
        {(control) => (
          <box marginRight={1} flexShrink={0}>
            <Btn
              label={control.panel ?? control.text}
              color={control.color}
              bold
              onPress={() => {
                api.close()
                api.runControl(control.id as string)
              }}
            />
          </box>
        )}
      </For>
    </box>
  )
}

/** The color of a new session: the footer's own `+`. */
const NEW_SESSION_COLOR = "#51cf66"

/** The menu `+` opens: the new session's name, typed in a framed field that has the keyboard as it opens. */
function NewSessionMenu(props: { api: MenuApi }) {
  let field: { value?: string; plainText?: string } | undefined
  const typed = () => field?.value ?? field?.plainText ?? ""
  return (
    <box flexDirection="column">
      <Label text=" Nombre de la pestaña" color="#74c0fc" bold />
      <box border borderStyle="rounded" borderColor={NEW_SESSION_COLOR} paddingLeft={1} paddingRight={1} width={48}>
        <input
          ref={(one: unknown) => {
            field = one as typeof field
          }}
          focused
          placeholder="vacío: la nombra OpenCode"
          placeholderColor="#868e96"
          textColor="#ffd43b"
          focusedTextColor="#ffd43b"
          cursorColor={NEW_SESSION_COLOR}
          onSubmit={() => props.api.startSession(typed())}
        />
      </box>
      <box flexDirection="row">
        <Btn label=" Empezar " color="#101113" bg={NEW_SESSION_COLOR} bold onPress={() => props.api.startSession(typed())} />
      </box>
    </box>
  )
}

/** How many rows of sessions show at once: the rest scroll. */
const SESSIONS_ROWS = 12

/** The sessions menu: each one's title, its folder and when it last changed; a click goes to it. */
function SessionsMenu(props: { api: MenuApi }) {
  const api = props.api
  // The title takes the room left after the mark, the folder and the stamp, so each starts in one column.
  const FOLDER = 22
  const titleWidth = () => Math.max(10, api.width() - 4 - 3 - FOLDER - 1 - 12 - 2)
  return (
    <Show when={api.state.sessions.length > 0} fallback={<Label text="  Todavía no hay sesiones guardadas." dim />}>
      <scrollbox height={Math.min(api.state.sessions.length, SESSIONS_ROWS)} scrollY>
        <For each={api.state.sessions}>
          {(row) => (
            <box flexDirection="row" flexShrink={0} onMouseUp={() => api.openSession(row.id)}>
              <Label
                text={row.id === api.sessionNow() ? " ● " : " ○ "}
                color={row.id === api.sessionNow() ? "#51cf66" : "#868e96"}
                bold
              />
              <Label text={fit(row.title, titleWidth())} bold={row.id === api.sessionNow()} />
              <Label text={` ${fit(row.folder, FOLDER)}`} dim />
              <Label text={` ${sessionStamp(row.updated)}`} color={SESSIONS_COLOR} />
            </box>
          )}
        </For>
      </scrollbox>
    </Show>
  )
}

/** The networks menu: every account with a user name, to open its profile; nothing is set here. */
function SocialsMenu(props: { api: MenuApi }) {
  const api = props.api
  const accounts = () =>
    SOCIALS.flatMap((social) =>
      accountsOf(api.settings.socials, social.id)
        .filter((key) => accountUrl(key, api.settings.socials[key] ?? ""))
        .map((key) => ({ social, key })),
    )
  // As many columns as the width holds: badge, name and user name.
  const CELL = 5 + 11 + 28
  const columns = () => Math.max(1, Math.min(3, Math.floor((api.width() - 4 + 2) / (CELL + 2))))
  const parts = () => {
    const all = accounts()
    const per = Math.max(1, Math.ceil(all.length / columns()))
    return Array.from({ length: columns() }, (_, index) => all.slice(index * per, (index + 1) * per))
  }
  return (
    <Show
      when={accounts().length > 0}
      fallback={<Label text="  Todavía no hay redes: cargalas en ⚙️ → Redes sociales." dim />}
    >
      <box flexDirection="row" columnGap={2}>
        <For each={parts()}>
          {(part) => (
            <box flexDirection="column" width={CELL} flexShrink={0}>
              <For each={part}>
                {(row) => (
                  <box
                    flexDirection="row"
                    flexShrink={0}
                    onMouseUp={() => {
                      api.close()
                      api.openSocial(row.key)
                    }}
                  >
                    <Label text={fit(` ${accountLabel(row.social.badge, row.key)}`, 5)} color={row.social.color} bold />
                    <Label text={fit(row.social.name, 11)} color={row.social.color} bold />
                    <Label text={fit(api.settings.socials[row.key] ?? "", 28).trimEnd()} />
                  </box>
                )}
              </For>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

/** The settings menu: the installer and its checks, the status line, and the networks. */
function SettingsMenu(props: { api: MenuApi }) {
  const api = props.api
  const inside = () => Math.max(20, api.width() - 4)
  const narrow = () => inside() < 75
  const mark = { "": ["·", "#868e96"], working: ["…", "#ffd43b"], ok: ["✔", "#51cf66"], fail: ["✘", "#ff6b6b"] } as const

  const setupTab = () => (
    <box flexDirection="column">
      <For each={SETUP_STEPS}>
        {([name, label]) => {
          const check = () => api.state.setup[name] ?? { state: "", detail: "" }
          return (
            <box flexDirection="row">
              <box width={4} flexShrink={0}>
                <Label text={` ${mark[check().state][0]}`} color={mark[check().state][1]} bold />
              </box>
              <box width={narrow() ? inside() - 4 : 46} flexShrink={0}>
                <Label text={label} color={check().state === "fail" ? mark.fail[1] : "#74c0fc"} bold />
              </box>
              <Show when={!narrow()}>
                <Label text={check().detail} color={mark[check().state][1]} dim={check().state === ""} />
              </Show>
            </box>
          )
        }}
      </For>
      <box flexDirection="row" marginTop={1}>
        <Btn
          label={api.state.installing ? " Instalando… " : " Instalar / reparar todo "}
          bold
          color="black"
          bg={api.state.installing ? "#ffd43b" : "#51cf66"}
          onPress={() => api.runSetup()}
        />
      </box>
      <For each={api.state.setupLog}>{(line) => <Label text={`   ${line}`} dim />}</For>
    </box>
  )

  const nameWidth = () => Math.min(26, Math.max(10, inside() - 12))
  const sideBySide = () => !narrow() && inside() >= 38 + 12 + 4 + 3 + nameWidth() + 1 + 7
  // The settings above the tables are a table too: a name, what is in use, and what changes it.
  const NAME_WIDTH = 28
  const STATE_WIDTH = 27
  const Setting = (props: { name: string; color: string; state: string; on: boolean; last?: boolean; children: unknown }) => (
    <box flexDirection={narrow() ? "column" : "row"} marginBottom={narrow() || props.last ? 1 : 0}>
      <box flexDirection="row" flexShrink={0}>
        <box width={NAME_WIDTH} flexShrink={0}>
          <Label text={props.name} color={props.color} bold />
        </box>
        <box width={narrow() ? undefined : STATE_WIDTH} flexShrink={0}>
          <Label text={props.state} color={props.on ? "#51cf66" : "#868e96"} bold />
        </box>
      </box>
      <box flexDirection="row" flexShrink={0} paddingLeft={narrow() ? 1 : 0}>
        {props.children as never}
      </box>
    </box>
  )
  const familyName = () => FONT_FAMILIES.find(([id]) => id === api.fontFamily())?.[1] ?? api.fontFamily()
  const barTab = () => (
    <box flexDirection="column">
      <Setting name=" ▤  Barra speedy-code " color="#4dabf7" state={api.barOn() ? "● activa" : "○ inactiva"} on={api.barOn()}>
        <Btn
          label={api.barOn() ? " Ocultar la barra " : " Usar barra speedy-code "}
          bold
          color="black"
          bg={api.barOn() ? "#868e96" : "#4dabf7"}
          onPress={() => api.toggleBar()}
        />
      </Setting>
      <Setting
        name=" ◈  Iconos "
        color="#b197fc"
        state={api.icons() === "nerd" ? "● Nerd Fonts" : "○ emojis"}
        on={api.icons() === "nerd"}
      >
        <Btn
          label={api.icons() === "nerd" ? " Volver a los emojis " : " Usar Nerd Fonts "}
          bold
          color="black"
          bg={api.icons() === "nerd" ? "#868e96" : "#b197fc"}
          onPress={() => api.toggleIcons()}
        />
        {/* The glyphs themselves, whatever the set: they tell whether the terminal's font has them. */}
        <text wrapMode="none" selectable={false} fg="#b197fc">{"  prueba: \uf0c5 \uf0ea \uf03e \uf130 \uf013 "}</text>
        <Show when={!narrow()}>
          <Label text="(¿cuadrados? falta una Nerd Font)" dim />
        </Show>
      </Setting>
      {/* The terminal's own font: a program in a terminal has none, so the terminal's settings are changed. */}
      <Setting
        name=" Aa  Fuente de la terminal "
        color="#ffa94d"
        state={api.fontSize() ? `● ${familyName()} · ${api.fontSize()} pt` : "○ la de tu terminal"}
        on={api.fontSize() > 0}
      >
        <For each={FONT_FAMILIES}>
          {([id, name]) => (
            <box marginRight={1} flexShrink={0}>
              <Btn
                label={` ${name} `}
                bold
                color="black"
                bg={api.fontSize() && api.fontFamily() === id ? "#51cf66" : "#ffa94d"}
                onPress={() => api.setFont(id, api.fontSize() || DEFAULT_FONT_SIZE)}
              />
            </box>
          )}
        </For>
      </Setting>
      <Setting name="     Tamaño en puntos " color="#ffa94d" state="" on={false} last>
        <For each={FONT_SIZES}>
          {(size) => (
            <box marginRight={1} flexShrink={0}>
              <Btn
                label={` ${String(size).padStart(2)} `}
                bold
                color="black"
                bg={api.fontSize() === size ? "#51cf66" : "#ffa94d"}
                onPress={() => api.setFont(api.fontFamily(), size)}
              />
            </box>
          )}
        </For>
      </Setting>
      <box flexDirection={sideBySide() ? "row" : "column"}>
        <box flexDirection="column" flexShrink={0} marginRight={sideBySide() ? 4 : 0}>
          <Label text="COLORES" bold dim />
          <For each={LEVEL_KEYS}>
            {(key) => (
              <box flexDirection="row">
                <box width={narrow() ? 22 : 38} flexShrink={0}>
                  <Label
                    text={narrow() ? LEVEL_LABELS[key][0].replace(" usado", "").replace(" desde", "") : LEVEL_LABELS[key][0]}
                    color={LEVEL_COLORS[key]}
                    bold
                  />
                </box>
                <Btn label=" − " bold color="black" bg={LEVEL_COLORS[key]} onPress={() => api.adjustLevel(key, -5)} />
                <box width={6} flexShrink={0} justifyContent="center" flexDirection="row">
                  <Label text={`${api.settings.barLevels[key]}%`} color={LEVEL_COLORS[key]} bold />
                </box>
                <Btn label=" + " bold color="black" bg={LEVEL_COLORS[key]} onPress={() => api.adjustLevel(key, 5)} />
                <Show when={!narrow() && !sideBySide() && LEVEL_LABELS[key][1]}>
                  <Label text={`  ${LEVEL_LABELS[key][1]}`} color={LEVEL_COLORS[key]} />
                </Show>
              </box>
            )}
          </For>
        </box>
        <box flexDirection="column" flexShrink={0} marginTop={sideBySide() ? 0 : 1}>
          <Label text="PRIORIDAD AL ACHICARSE" bold dim />
          <For each={api.settings.barOrder}>
            {(key, index) => (
              <box flexDirection="row">
                <box width={3} flexShrink={0}>
                  <Label text={`${index() + 1}`.padStart(2)} color={PRIORITY_COLOR} bold />
                </box>
                <box width={nameWidth() + 1} flexShrink={0}>
                  <Label text={fit(BAR_PARTS.find(([part]) => part === key)?.[1] ?? key, nameWidth())} />
                </box>
                <Btn
                  label=" ▲ "
                  bold
                  color={index() > 0 ? "black" : DISABLED_COLOR}
                  bg={index() > 0 ? PRIORITY_COLOR : undefined}
                  onPress={index() > 0 ? () => api.movePart(key, -1) : undefined}
                />
                <Label text=" " />
                <Btn
                  label=" ▼ "
                  bold
                  color={index() < api.settings.barOrder.length - 1 ? "black" : DISABLED_COLOR}
                  bg={index() < api.settings.barOrder.length - 1 ? PRIORITY_COLOR : undefined}
                  onPress={index() < api.settings.barOrder.length - 1 ? () => api.movePart(key, 1) : undefined}
                />
              </box>
            )}
          </For>
        </box>
      </box>
      <box flexDirection="row" marginTop={1}>
        <Btn label=" Restaurar los valores por defecto " bold color="black" bg="#4dabf7" onPress={() => api.resetBar()} />
      </box>
    </box>
  )

  // Two tables of the networks side by side where the width holds them.
  // A row per account: + adds another of the network on its first row, − removes an added one.
  const fixed = 4 + 5 + 12 + 28
  const rows = (): Array<{ social: Social; key: string; index: number }> =>
    SOCIALS.flatMap((social) =>
      accountsOf(api.settings.socials, social.id).map((key, index) => ({ social, key, index })),
    )
  const tables = () => (inside() >= (fixed + 26) * 2 + 3 ? 2 : 1)
  const linkWidth = () =>
    tables() === 2 ? Math.floor((inside() - 3) / 2) - fixed : Math.max(10, inside() - fixed)
  const halves = () => {
    const all = rows()
    const per = Math.ceil(all.length / tables())
    return Array.from({ length: tables() }, (_, index) => all.slice(index * per, (index + 1) * per))
  }
  const socialsTab = () => (
    <box flexDirection="row" columnGap={3}>
      <For each={halves()}>
        {(part) => (
          <box flexDirection="column" flexShrink={0}>
            <Label
              text={fit(" Red", 4 + 5 + (narrow() ? 0 : 12)) + fit("Usuario", 28) + (narrow() ? "" : fit("Link", linkWidth()))}
              bold
              color="black"
              bg="#f783ac"
            />
            <For each={part}>
              {(row) => {
                const handle = () => api.settings.socials[row.key] ?? ""
                const link = () => accountUrl(row.key, handle())
                const isFirst = row.index === 0
                return (
                  <box flexDirection="row">
                    <box width={4} flexShrink={0}>
                      <Show
                        when={isFirst}
                        fallback={<Btn label=" − " color="#ff6b6b" bold onPress={() => api.removeAccount(row.key)} />}
                      >
                        <Btn label=" + " color={row.social.color} bold onPress={() => api.addAccount(row.social.id)} />
                      </Show>
                    </box>
                    <box width={5} flexShrink={0}>
                      <Label text={accountLabel(row.social.badge, row.key)} color={row.social.color} bold dim={!isFirst} />
                    </box>
                    <Show when={!narrow()}>
                      <box width={12} flexShrink={0}>
                        <Label
                          text={isFirst ? row.social.name : `  cuenta ${row.index + 1}`}
                          color={row.social.color}
                          bold={isFirst}
                          dim={!isFirst}
                        />
                      </box>
                    </Show>
                    <box width={28} flexShrink={0}>
                      <Btn
                        label={fit(handle() || "usuario ✎", 26)}
                        color={handle() ? undefined : "#868e96"}
                        onPress={() => api.editSocial(row.key)}
                      />
                    </box>
                    <Show when={!narrow()}>
                      <Label
                        text={fit(link() || "—", linkWidth()).trimEnd()}
                        color={link() ? row.social.color : undefined}
                        dim={!link()}
                      />
                    </Show>
                  </box>
                )
              }}
            </For>
          </box>
        )}
      </For>
    </box>
  )

  return (
    <box flexDirection="column">
      <box flexDirection="row" marginBottom={1}>
        <For each={SETTINGS_TABS}>
          {([id, label, tint, short]) => {
            const isOpen = () => id === api.state.settingsTab
            return (
              <box marginRight={narrow() ? 1 : 2} flexShrink={0}>
                <Btn
                  label={` ${isOpen() ? "▸ " : ""}${narrow() ? short : label} `}
                  bold
                  color={isOpen() ? "black" : tint}
                  bg={isOpen() ? tint : undefined}
                  onPress={() => api.set((draft) => void (draft.settingsTab = id))}
                />
              </box>
            )
          }}
        </For>
      </box>
      <Show when={api.state.settingsTab === "setup"}>{setupTab()}</Show>
      <Show when={api.state.settingsTab === "bar"}>{barTab()}</Show>
      <Show when={api.state.settingsTab === "socials"}>{socialsTab()}</Show>
    </box>
  )
}

/** The frame's title and color for the menu on screen. */
export function menuHeading(open: MenuName, settings: SpeedySettings): { title: string; color: string } {
  switch (open) {
    case "voices":
      return { title: voiceTitle(settings.picks), color: languageColor(settings.picks.active) }
    case "mic":
      return { title: "Micrófono para dictar", color: "#ff6b6b" }
    case "history":
      return { title: "📎 Audios", color: "#ffd43b" }
    case "images":
      return { title: "Imágenes", color: "#74c0fc" }
    case "socials":
      return { title: "Redes sociales", color: "#f783ac" }
    case "sessions":
      return { title: "Sesiones", color: SESSIONS_COLOR }
    case "new":
      return { title: "+ Sesión nueva", color: NEW_SESSION_COLOR }
    case "more":
      return { title: "Más", color: "#adb5bd" }
    default:
      return { title: "Configuración", color: "#adb5bd" }
  }
}

/** The menu on screen, framed; nothing when none is open. */
export function MenuFrame(props: { api: MenuApi }) {
  const api = props.api
  const heading = () => menuHeading(api.state.open, api.settings)
  return (
    <Show when={api.state.open !== ""}>
      {/* The close mark's row comes after the frame in the tree, so it is drawn over it, and
          column-reverse puts it on top, pulled one row down onto the border. */}
      <box flexDirection="column-reverse" flexShrink={0} width={api.width()}>
      <box
        flexDirection="column"
        flexShrink={0}
        width={api.width()}
        border
        borderStyle="single"
        borderColor={heading().color}
        title={` ${heading().title} `}
        titleAlignment="center"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
      >
        <Show when={api.state.open === "voices"}>
          <VoiceMenu api={api} />
        </Show>
        <Show when={api.state.open === "history"}>
          <HistoryMenu api={api} />
        </Show>
        <Show when={api.state.open === "images"}>
          <ImagesMenu api={api} />
        </Show>
        <Show when={api.state.open === "socials"}>
          <SocialsMenu api={api} />
        </Show>
        <Show when={api.state.open === "sessions"}>
          <SessionsMenu api={api} />
        </Show>
        <Show when={api.state.open === "new"}>
          <NewSessionMenu api={api} />
        </Show>
        <Show when={api.state.open === "mic"}>
          <MicMenu api={api} />
        </Show>
        <Show when={api.state.open === "more"}>
          <MoreMenu api={api} />
        </Show>
        <Show when={api.state.open === "settings"}>
          <SettingsMenu api={api} />
        </Show>
      </box>
      <box flexDirection="row" justifyContent="flex-end" flexShrink={0} width={api.width()} marginBottom={-1} zIndex={1}>
        {/* A blank on either side, on the screen's own background, cuts the line around the mark.
            The mark is `×`: in every font, one cell and one color. `✕` came from a fallback font,
            drawn wider than its cell; `╳` filled the cell but stood too tall. */}
        <Btn label=" × " color="#ff6b6b" bg={api.background()} bold onPress={() => api.close()} />
        <box width={2} flexShrink={0} />
      </box>
      </box>
    </Show>
  )
}
