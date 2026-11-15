import { describe, expect, test } from "bun:test"

import { capability, portStrategy } from "../src/capabilities"

describe("OpenCode port capabilities", () => {
  test("uses native APIs only when OpenCode documents the required behavior", () => {
    expect(capability("global-plugin-discovery")).toBe("native")
    expect(capability("persistent-settings")).toBe("native")
    expect(capability("session-events")).toBe("native")
    expect(capability("composer-draft-insertion")).toBe("unavailable")
  })

  test("keeps unsupported behavior behind an explicit adapter", () => {
    expect(portStrategy("composer-draft-insertion")).toEqual({
      capability: "unavailable",
      strategy: "platform-adapter",
    })
  })
})
