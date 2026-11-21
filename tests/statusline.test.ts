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
  app: "v26.1121(1012)",
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
      "opencode:v2.3.0 » ⏱  43m │ in 2 out 995 caché 149.5k │ ctx: ▰▱▱▱ 15% 149.5k/1M │ v26.1121(1012)",
    )
  })

  test("the folder and the branch are the footer's: the line has neither", () => {
    const line = text(statusLine({ ...input, branch: "main" }, 0, levels))
    expect(line).not.toContain("local-mods")
    expect(line).not.toContain("main")
  })

  test("a narrow terminal keeps the parts by priority and never cuts one", () => {
    const line = text(statusLine(input, 56, levels))
    expect(line).toBe("opencode:v2.3.0 » v26.1121(1012)")
    expect(line.length).toBeLessThanOrEqual(52)
  })

  test("the first part by priority is drawn however narrow the terminal is", () => {
    expect(text(statusLine(input, 5, levels))).toBe("opencode:v2.3.0")
  })

  test("the saved order decides what stays", () => {
    const line = text(statusLine(input, 53, levels, ["time", "core"]))
    expect(line).toBe("opencode:v2.3.0 » ⏱  43m │ v26.1121(1012)")
  })

  test("context turns yellow and red at the saved levels, and red asks to compact", () => {
    const tone = (cache: number) =>
      statusLine({ ...input, cacheReadTokens: cache }, 0, levels).find((run) => run.text.endsWith("%"))?.color
    expect(tone(100000)).toBe(STATUS_COLORS.green)
    expect(tone(600000)).toBe(STATUS_COLORS.yellow)
    expect(tone(800000)).toBe(STATUS_COLORS.red)
    expect(text(statusLine({ ...input, cacheReadTokens: 800000 }, 0, levels))).toContain("⚠  compactar")
  })

  test("with Nerd Fonts the signs are glyphs", () => {
    expect(text(statusLine({ ...input, branch: "main", icons: "nerd" }, 0, levels))).toBe(
      "opencode:v2.3.0 » \uf017  43m │ in 2 out 995 caché 149.5k │ ctx: ▰▱▱▱ 15% 149.5k/1M │ v26.1121(1012)",
    )
    expect(text(statusLine({ ...input, cacheReadTokens: 800000, icons: "nerd" }, 0, levels))).toContain("\uf071   compactar")
  })

  test("with nothing known it still draws zeros", () => {
    expect(text(statusLine({}, 0, levels))).toBe("⏱  0m │ in 0 out 0 caché 0 │ ctx: ▱▱▱▱ 0%")
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
      " │ ctx: ▰▱▱▱ 15% 149.5k/1M │ 5hs ▱▱▱▱ 1% ↻ hoy 13:40 │ semana ▱▱▱▱ 0% ↻ Dom 13:00 │ v26.1121(1012)",
    )
  })

  test("the monthly window follows the weekly one, and the session's cost is not on the line", () => {
    const monthly = { percent: 54, resetsAt: new Date(2026, 11, 9, 4, 0).getTime() }
    const line = text(statusLine({ ...input, limits: { ...limits, monthly }, now }, 0, levels))
    expect(line).toContain(" │ semana ▱▱▱▱ 0% ↻ Dom 13:00 │ mes ▰▰▱▱ 54% ↻ ")
    expect(line).toEndWith(" │ v26.1121(1012)")
    expect(line).not.toContain("sesión")
    expect(line).not.toContain("$")
  })

  test("a newer version on GitHub puts a yellow down arrow after speedy-code's version", () => {
    const line = statusLine({ ...input, limits, now, update: true }, 0, levels)
    expect(text(line)).toEndWith(" │ v26.1121(1012) ↓")
    expect(line.at(-1)?.color).toBe(STATUS_COLORS.update)
    expect(text(statusLine({ ...input, limits, now }, 0, levels))).toEndWith(" │ v26.1121(1012)")
  })

  test("the windows' labels open the workspace's own page when the host tells which it is", () => {
    const usageUrl = "https://opencode.ai/console/wrk_1"
    const line = statusLine({ ...input, limits, now, usageUrl }, 0, levels)
    expect(line.find((run) => run.text === "5hs ")?.link).toBe(usageUrl)
    expect(line.find((run) => run.text === "semana ")?.link).toBe(usageUrl)
  })

  test("a narrow terminal keeps the windows short before it drops a part", () => {
    expect(text(statusLine({ ...input, limits, now }, 70, levels))).toBe(
      "opencode:v2.3.0 » 5hs ▱▱▱▱ 1% │ semana ▱▱▱▱ 0% │ v26.1121(1012)",
    )
  })

  test("the links are the version and the windows' labels, in Claude's orange: the release notes and the plan's usage", () => {
    const line = statusLine({ ...input, limits, now }, 0, levels)
    const linked = line.filter((run) => run.link !== undefined)
    expect(linked.map((run) => [run.text, run.link, run.color])).toEqual([
      ["opencode:", "https://github.com/anomalyco/opencode/releases/tag/v2.3.0", STATUS_COLORS.link],
      ["v2.3.0", "https://github.com/anomalyco/opencode/releases/tag/v2.3.0", STATUS_COLORS.link],
      ["5hs ", "https://opencode.ai/console", STATUS_COLORS.link],
      ["semana ", "https://opencode.ai/console", STATUS_COLORS.link],
    ])
    expect(STATUS_COLORS.link).toBe("#d77757")
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
    // An order saved when the session's cost was a part: the monthly window takes its place.
    expect(priorityOf(["cost", "nope", "cost", "core"]).slice(0, 3)).toEqual(["monthly", "core", "app"])
    expect(priorityOf(undefined)[0]).toBe("core")
  })
})
