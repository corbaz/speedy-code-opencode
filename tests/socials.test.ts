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

  test("builds no link from what no user name holds, as the original does", () => {
    expect(socialUrl("x", "a b")).toBe("")
    expect(socialUrl("x", "chipy_corbaz")).toBe("https://x.com/chipy_corbaz")
  })

  test("returns nothing for an unknown network or an empty handle", () => {
    expect(socialUrl("myspace", "corbaz")).toBe("")
    expect(socialUrl("github", "   ")).toBe("")
  })
})

describe("a user name as people write it", () => {
  test("a leading @ and a gmail address are the user name alone", async () => {
    const { socialUrl } = await import("../src/socials")
    expect(socialUrl("github", "@corbaz")).toBe("https://github.com/corbaz")
    expect(socialUrl("youtube", "@juliocorbaz")).toBe("https://www.youtube.com/@juliocorbaz")
    expect(socialUrl("gmail", "julio.corbaz@gmail.com")).toBe(
      "https://mail.google.com/mail/u/?authuser=julio.corbaz@gmail.com",
    )
  })

  test("what no user name holds builds no link", async () => {
    const { socialUrl } = await import("../src/socials")
    expect(socialUrl("github", "a b/c")).toBe("")
  })
})

describe("several accounts of a network", () => {
  test("the first is under the network's id, the added ones numbered after it", async () => {
    const { accountsOf, accountLabel, networkOf } = await import("../src/socials")
    const users = { github: "corbaz", "github#3": "c", "github#2": "b", x: "chipy" }
    expect(accountsOf(users, "github")).toEqual(["github", "github#2", "github#3"])
    expect(accountsOf(users, "x")).toEqual(["x"])
    expect(accountLabel("GH", "github")).toBe("GH")
    expect(accountLabel("GH", "github#2")).toBe("GH2")
    expect(networkOf("github#2")).toBe("github")
  })

  test("another account takes the next number, or the one left empty", async () => {
    const { nextAccount } = await import("../src/socials")
    expect(nextAccount({ github: "corbaz" }, "github")).toBe("github#2")
    expect(nextAccount({ github: "corbaz", "github#2": "b" }, "github")).toBe("github#3")
    expect(nextAccount({ github: "corbaz", "github#2": " " }, "github")).toBe("github#2")
  })

  test("an added account left empty goes; a network's first stays", async () => {
    const { withoutEmptyAccounts, accountUrl } = await import("../src/socials")
    expect(withoutEmptyAccounts({ github: "", "github#2": "", "github#3": "c" })).toEqual({ github: "", "github#3": "c" })
    expect(accountUrl("github#2", "otro")).toBe("https://github.com/otro")
  })
})
