import { describe, expect, test } from "bun:test"

import { UNTITLED, sessionRowsOf, sessionStamp } from "../src/sessions"

describe("sessionRowsOf", () => {
  test("keeps the sessions a person opened, newest first, each with its folder's name", () => {
    const answer = {
      data: [
        { id: "a", title: " Facturas ", time: { created: 1000, updated: 3000 }, location: { directory: "C:\\Users\\ana\\ahorro" } },
        { id: "b", title: "", time: { created: 5000 }, location: { directory: "/Users/ana/proyectos/web/" } },
        { id: "c", title: "de un agente", parentID: "a", time: { updated: 9000 } },
        { title: "sin id", time: { updated: 9500 } },
        { id: "d", title: "sin fecha" },
      ],
    }
    expect(sessionRowsOf(answer)).toEqual([
      { id: "b", title: UNTITLED, folder: "web", updated: 5000 },
      { id: "a", title: "Facturas", folder: "ahorro", updated: 3000 },
      { id: "d", title: "sin fecha", folder: "", updated: 0 },
    ])
  })

  test("an answer that is not a list gives none", () => {
    expect(sessionRowsOf(undefined)).toEqual([])
    expect(sessionRowsOf({ data: "no" })).toEqual([])
  })
})

describe("sessionStamp", () => {
  test("writes the day, the month and the time of this machine", () => {
    expect(sessionStamp(new Date(2026, 10, 7, 9, 5).getTime())).toBe("07/11 09:05")
  })

  test("nothing of a moment not given", () => {
    expect(sessionStamp(0)).toBe("")
  })
})
