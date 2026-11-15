import { describe, expect, test } from "bun:test"

import { SOCIALS, socialUrl } from "../src/socials"

describe("SOCIALS", () => {
  test("keeps every network the original footer opens", () => {
    expect(SOCIALS.map((social) => social.id)).toEqual([
      "github",
      "linkedin",
      "x",
      "youtube",
      "instagram",
      "tiktok",
      "facebook",
      "twitch",
      "threads",
      "reddit",
      "gmail",
      "discord",
    ])
  })

  test("every network has a link template and a colour", () => {
    for (const social of SOCIALS) {
      expect(social.template).toContain("{u}")
      expect(social.color).toMatch(/^#/)
    }
  })
})

describe("socialUrl", () => {
  test("puts the handle where the template expects it", () => {
    expect(socialUrl("github", "corbaz")).toBe("https://github.com/corbaz")
    expect(socialUrl("youtube", "juliocorbaz")).toBe("https://www.youtube.com/@juliocorbaz")
  })

  test("opens the Gmail inbox of that account, which has no public profile", () => {
    expect(socialUrl("gmail", "julio.corbaz")).toBe(
      "https://mail.google.com/mail/u/?authuser=julio.corbaz@gmail.com",
    )
  })

  test("keeps the characters a handle can carry", () => {
    expect(socialUrl("x", "a b")).toBe("https://x.com/a%20b")
  })

  test("returns nothing for an unknown network or an empty handle", () => {
    expect(socialUrl("myspace", "corbaz")).toBe("")
    expect(socialUrl("github", "   ")).toBe("")
  })
})
