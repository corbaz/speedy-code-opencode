import { Plugin } from "@opencode/plugin"

const STORAGE_VERSION = 1

export default Plugin.define({
  id: "speedy-code.server",
  async setup(context) {
    const current = await context.storage.get("schema-version")
    if (current === undefined) {
      await context.storage.set("schema-version", STORAGE_VERSION)
    }
  },
})
