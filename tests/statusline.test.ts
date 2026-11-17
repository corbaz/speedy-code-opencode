import { describe, expect, test } from "bun:test"

import { DEFAULT_SETTINGS } from "../src/settings"
import {
  STATUS_COLORS,
  formatCost,
  formatDuration,
  formatReset,
  formatTokens,
  priorityOf,
  statusLine,
} from "../src/statusline"

const levels = DEFAULT_SETTINGS.barLevels
const text = (runs: ReadonlyArray<{ text: string }>) => runs.map((run) => run.text).join("")

const input = {
  cwd: "C:\\Users\\Sancho\\.claude\\local-mods",
  home: "C:\\Users\\Sancho",
  version: "2.3.0",
  model: "GLM-5.3",
  effort: "high",
  durationMs: 43 * 60000,
  inputTokens: 2,
  outputTokens: 995,
  cacheReadTokens: 149500,
  contextSize: 1000000,
  costUsd: 2.04,
}

describe("status line numbers", () => {
  test("tokens are written as the original writes them", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(undefined)).toBe("0")
    expect(formatTokens(995)).toBe("995")
    expect(formatTokens(149500)).toBe("149.5k")
    expect(formatTokens(150000)).toBe("150k")
    expect(formatTokens(999950)).toBe("1M")
    expect(formatTokens(1048576)).toBe("1M")
  })

  test("durations and costs", () => {
    expect(formatDuration(0)).toBe("0m")
    expect(formatDuration(43 * 60000)).toBe("43m")
    expect(formatDuration(125 * 60000)).toBe("2h 5m")
    expect(formatDuration(1443 * 60000)).toBe("1d 0h 3m")
    expect(formatCost(2.04)).toBe("$2.04")
    expect(formatCost(1234.5)).toBe("$1,234.50")
  })
})

describe("statusLine", () => {
  test("draws every part, in the original order and wording, when it fits", () => {
    expect(text(statusLine(input, 0, levels))).toBe(
      "~\\.claude\\local-mods » v2.3.0 ◆ GLM-5.3 · high │ ⏱  43m │ in 2 out 995 caché 149.5k │ ctx: ▰▱▱▱ 15% 149.5k/1M │ sesión $2.04",
    )
  })

  test("names the branch beside the folder", () => {
    expect(text(statusLine({ ...input, branch: "main" }, 0, levels))).toStartWith("~\\.claude\\local-mods ⎇ main » ")
  })

  test("a narrow terminal keeps the parts by priority and never cuts one", () => {
    const line = text(statusLine(input, 64, levels))
    expect(line).toBe("v2.3.0 ◆ GLM-5.3 · high │ ⏱  43m │ ctx: ▰▱▱▱ 15% 149.5k/1M")
    expect(line.length).toBeLessThanOrEqual(60)
  })

  test("the first part by priority is drawn however narrow the terminal is", () => {
    expect(text(statusLine(input, 5, levels))).toBe("v2.3.0 ◆ GLM-5.3 · high")
  })

  test("the saved order decides what stays", () => {
    const line = text(statusLine(input, 44, levels, ["cost", "core"]))
    expect(line).toBe("v2.3.0 ◆ GLM-5.3 · high │ sesión $2.04")
  })

  test("context turns yellow and red at the saved levels, and red asks to compact", () => {
    const tone = (cache: number) =>
      statusLine({ ...input, cacheReadTokens: cache }, 0, levels).find((run) => run.text.endsWith("%"))?.color
    expect(tone(100000)).toBe(STATUS_COLORS.green)
    expect(tone(600000)).toBe(STATUS_COLORS.yellow)
    expect(tone(800000)).toBe(STATUS_COLORS.red)
    expect(text(statusLine({ ...input, cacheReadTokens: 800000 }, 0, levels))).toContain("⚠  compactar")
  })

  test("with Nerd Fonts the signs are glyphs, and the folder gets one", () => {
    expect(text(statusLine({ ...input, branch: "main", icons: "nerd" }, 0, levels))).toBe(
      "\uf07b  ~\\.claude\\local-mods \uf126  main » v2.3.0 \uf2db  GLM-5.3 · high │ \uf017  43m │ in 2 out 995 caché 149.5k │ ctx: ▰▱▱▱ 15% 149.5k/1M │ sesión $2.04",
    )
    expect(text(statusLine({ ...input, cacheReadTokens: 800000, icons: "nerd" }, 0, levels))).toContain("\uf071   compactar")
  })

  test("with nothing known it still draws zeros", () => {
    expect(text(statusLine({}, 0, levels))).toBe(" » ◆  │ ⏱  0m │ in 0 out 0 caché 0 │ ctx: ▱▱▱▱ 0% │ sesión $0.00")
  })
})

describe("limits", () => {
  const now = new Date(2026, 10, 16, 10, 0).getTime()
  const limits = {
    five_hour: { percent: 1, resetsAt: new Date(2026, 10, 16, 13, 40).getTime() },
    seven_day: { percent: 0, resetsAt: new Date(2026, 10, 22, 13, 0).getTime() },
  }

  test("the 5-hour and weekly windows close the line, with when each starts over", () => {
    expect(text(statusLine({ ...input, limits, now }, 0, levels))).toEndWith(
      " │ sesión $2.04 │ 5hs ▱▱▱▱ 1% ↻ hoy 13:40 │ semana ▱▱▱▱ 0% ↻ Dom 13:00",
    )
  })

  test("a narrow terminal keeps the windows short before it drops a part", () => {
    expect(text(statusLine({ ...input, limits, now }, 62, levels))).toBe(
      "v2.3.0 ◆ GLM-5.3 · high │ 5hs ▱▱▱▱ 1% │ semana ▱▱▱▱ 0%",
    )
  })

  test("a window turns red at the saved level and warns", () => {
    const line = statusLine({ ...input, limits: { five_hour: { percent: 95 } }, now }, 0, levels)
    expect(text(line)).toContain("5hs ▰▰▰▰ 95% ⚠ ")
    expect(line.find((run) => run.text === " 95%")?.color).toBe(STATUS_COLORS.red)
  })

  test("reset times are told from today", () => {
    expect(formatReset(new Date(2026, 10, 17, 9, 5).getTime(), now)).toBe("mañana 09:05")
    expect(formatReset(undefined, now)).toBe("")
  })
})

describe("priorityOf", () => {
  test("keeps the known keys once, then the rest in the default order", () => {
    expect(priorityOf(["cost", "nope", "cost", "core"]).slice(0, 3)).toEqual(["cost", "core", "five_hour"])
    expect(priorityOf(undefined)[0]).toBe("core")
  })
})
