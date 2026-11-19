import { describe, expect, test } from "bun:test"

import { agentRowsOf, agentScope } from "../src/agents"

describe("agentScope", () => {
  test("says what the last rule for every file and every command does, and counts the rules apart", () => {
    const rules = [
      { action: "*", resource: "*", effect: "allow" },
      { action: "edit", resource: "*", effect: "allow" },
      { action: "edit", resource: "*.env", effect: "deny" },
      { action: "shell", resource: "*", effect: "ask" },
      { action: "shell", resource: "git push *", effect: "deny" },
      { action: "read", resource: "*.env", effect: "ask" },
    ]
    expect(agentScope(rules)).toBe("Editar archivos: sin preguntar · Comandos: pregunta antes · 2 excepciones")
  })

  test("a rule for everything stands for an action with none of its own", () => {
    expect(agentScope([{ action: "*", resource: "*", effect: "allow" }, { action: "edit", resource: "*", effect: "deny" }])).toBe(
      "Editar archivos: no puede · Comandos: sin preguntar",
    )
  })

  test("with no rules it asks", () => {
    expect(agentScope(undefined)).toBe("Editar archivos: pregunta antes · Comandos: pregunta antes")
  })
})

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
      { id: "build", name: "Build", description: "The default agent.", scope: "Editar archivos: pregunta antes · Comandos: pregunta antes" },
      { id: "plan", name: "plan", description: "", scope: "Editar archivos: pregunta antes · Comandos: pregunta antes" },
    ])
  })

  test("an answer that is not a list gives none", () => {
    expect(agentRowsOf(undefined)).toEqual([])
  })
})
