import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"

import { POWERSHELL, powershellPath } from "../src/powershell"

const SEP = String.fromCharCode(92)

describe("powershellPath", () => {
  test("is Windows PowerShell by its own path: the bare name may be another program first on the PATH", () => {
    expect(powershellPath({ SystemRoot: `C:${SEP}WINDOWS` })).toBe(
      ["C:", "WINDOWS", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"].join(SEP),
    )
    expect(powershellPath({ windir: `D:${SEP}Win` })).toBe(
      ["D:", "Win", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"].join(SEP),
    )
  })

  test("is the bare name where the system names no folder of its own", () => {
    expect(powershellPath({})).toBe("powershell")
  })

  test.skipIf(process.platform !== "win32")("names a program that is there, on Windows", () => {
    expect(existsSync(POWERSHELL)).toBe(true)
  })
})
