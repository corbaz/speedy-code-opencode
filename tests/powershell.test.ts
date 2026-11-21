import { describe, expect, test } from "bun:test"

import { powershellPath } from "../src/powershell"

describe("powershellPath", () => {
  test("is Windows PowerShell by its own path: the bare name may be another program first on the PATH", () => {
    expect(powershellPath({ SystemRoot: "C:\WINDOWS" })).toBe("C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe")
    expect(powershellPath({ windir: "D:\Win" })).toBe("D:\Win\System32\WindowsPowerShell\v1.0\powershell.exe")
  })

  test("is the bare name where the system names no folder of its own", () => {
    expect(powershellPath({})).toBe("powershell")
  })
})
