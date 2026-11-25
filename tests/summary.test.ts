import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const engine = join(import.meta.dir, "..", "engine")
const script = join(engine, "polish.py")

/** What polish.py --summary says of a narration's text file, with the key it is given. */
async function summary(file: string, key: string) {
  const child = Bun.spawn([python ?? "python", script, "--summary", file], {
    env: { ...process.env, GROQ_API_KEY: key },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  return JSON.parse(out.trim().split("\n").pop() ?? "{}")
}

describe("the player's Resumen: polish.py --summary", () => {
  test("asks Groq for a narration's points, its text read from the .txt beside the MP3", async () => {
    const folder = mkdtempSync(join(tmpdir(), "speedy-summary-"))
    try {
      const narration = join(folder, "Respuesta-26-11-25_10-46-05.txt")
      writeFileSync(narration, "Ya está el ícono 📁 para crear carpetas.", "utf8")
      // The asking: the narration as it was written, accents and emoji kept, and the list it is told to give.
      const asked = Bun.spawnSync([python ?? "python", "-X", "utf8", "-c", "import json, sys; sys.path.insert(0, sys.argv[1]); import polish; print(json.dumps(polish.summary_ask(sys.argv[2])))", engine, narration])
      const ask = JSON.parse(asked.stdout.toString("utf8"))
      expect(ask.text).toBe("Ya está el ícono 📁 para crear carpetas.")
      expect(ask.model).toBe("openai/gpt-oss-120b")
      expect(ask.system).toContain('Return only a Markdown bullet list: one line per point, each starting with "- "')
      // With no key nothing is asked, and it says why; a narration with no text beside it says so.
      expect(await summary(narration, "")).toEqual({ error: "falta la variable de sistema GROQ_API_KEY" })
      expect(await summary(join(folder, "ninguna.txt"), "")).toEqual({ error: "no encontré el texto de esta narración" })
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
