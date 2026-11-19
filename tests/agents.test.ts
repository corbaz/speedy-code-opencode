import { describe, expect, test } from "bun:test"

import { agentRowsOf } from "../src/agents"

describe("agentRowsOf", () => {
  test("keeps the primary agents a person picks, in the host's order", () => {
    const list = [
      { id: "build", name: "Build", description: " The default agent. ", mode: "primary", hidden: false, permissions: [] },
      { id: "explore", name: "Explore", mode: "subagent", hidden: true },
      { id: "title", name: "Title", mode: "primary", hidden: true },
      { id: "plan", name: "", mode: "primary", hidden: false },
      { name: "sin id", mode: "primary" },
    ]
    expect(agentRowsOf(list)).toEqual([
      { id: "build", name: "Build", description: "The default agent." },
      { id: "plan", name: "plan", description: "" },
    ])
  })

  test("an answer that is not a list gives none", () => {
    expect(agentRowsOf(undefined)).toEqual([])
  })
})
