/**
 * The social networks the original footer opened, and the profile link each one
 * builds from a user name.
 *
 * The table is the original one, unchanged: the id the settings store keys on,
 * the name the menu shows, the badge the original column carried, its colour,
 * the link template, and — for the two networks whose handle is not a plain
 * user name — what to type instead.
 */

export interface Social {
  readonly id: string
  readonly name: string
  readonly badge: string
  readonly color: string
  /** Where the profile lives; `{u}` is the user name. */
  readonly template: string
  /** Shown when the handle is not the plain user name. */
  readonly hint?: string
}

export const SOCIALS: readonly Social[] = [
  { id: "github", name: "GitHub", badge: "GH", color: "#e6edf3", template: "https://github.com/{u}" },
  { id: "linkedin", name: "LinkedIn", badge: "in", color: "#4dabf7", template: "https://www.linkedin.com/in/{u}" },
  { id: "x", name: "X", badge: "X", color: "#e6edf3", template: "https://x.com/{u}" },
  { id: "youtube", name: "YouTube", badge: "YT", color: "#ff4d4d", template: "https://www.youtube.com/@{u}" },
  { id: "instagram", name: "Instagram", badge: "IG", color: "#f06595", template: "https://www.instagram.com/{u}" },
  { id: "tiktok", name: "TikTok", badge: "TT", color: "#3bc9db", template: "https://www.tiktok.com/@{u}" },
  { id: "facebook", name: "Facebook", badge: "FB", color: "#748ffc", template: "https://www.facebook.com/{u}" },
  { id: "twitch", name: "Twitch", badge: "TW", color: "#9775fa", template: "https://www.twitch.tv/{u}" },
  { id: "threads", name: "Threads", badge: "TH", color: "#e6edf3", template: "https://www.threads.com/@{u}" },
  { id: "reddit", name: "Reddit", badge: "RD", color: "#ff8c42", template: "https://www.reddit.com/user/{u}" },
  // Gmail has no public profile: the link opens the inbox of that account.
  {
    id: "gmail",
    name: "Gmail",
    badge: "GM",
    color: "#fa5252",
    template: "https://mail.google.com/mail/u/?authuser={u}@gmail.com",
    hint: "usuario, sin @gmail.com",
  },
  // Discord's profile link takes the numeric user ID, not the user name.
  {
    id: "discord",
    name: "Discord",
    badge: "DC",
    color: "#91a7ff",
    template: "https://discord.com/users/{u}",
    hint: "ID numérico de usuario",
  },
]

/** The link of `id`'s profile for `handle`; nothing when the network has no handle. */
export function socialUrl(id: string, handle: string): string {
  const social = SOCIALS.find((one) => one.id === id)
  // A name as people write it: `@corbaz` and `name@gmail.com` are the user name alone.
  const user = handle.trim().replace(/^@/, "").replace(/@gmail\.com$/i, "")
  if (!social || !/^[\w.-]{1,100}$/.test(user)) return ""
  return social.template.replace("{u}", user)
}
