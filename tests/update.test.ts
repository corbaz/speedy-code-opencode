import { describe, expect, test } from "bun:test"

import { behindOrigin, takeUpdate, type Git } from "../src/update"

/** A git that answers as told, and keeps what it was asked. */
function fakeGit(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
  const asked: string[][] = []
  const git: Git = async (args) => {
    asked.push(args)
    const answer = answers[args[0] ?? ""] ?? {}
    return { code: answer.code ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" }
  }
  return { git, asked }
}

describe("behindOrigin", () => {
  test("fetches main, which changes no file, then counts the commits the clone lacks", async () => {
    const { git, asked } = fakeGit({ "rev-list": { stdout: "3\n" } })
    expect(await behindOrigin(git)).toBe(3)
    expect(asked).toEqual([
      ["fetch", "-q", "origin", "main"],
      ["rev-list", "--count", "HEAD..origin/main"],
    ])
  })

  test("is none when GitHub cannot be reached", async () => {
    const { git, asked } = fakeGit({ fetch: { code: 128 } })
    expect(await behindOrigin(git)).toBe(0)
    expect(asked).toHaveLength(1)
  })
})

describe("takeUpdate", () => {
  test("fast-forwards to origin/main, and says whether the packages changed", async () => {
    const { git, asked } = fakeGit({ diff: { stdout: "package.json\n" } })
    expect(await takeUpdate(git)).toEqual({ ok: true, install: true })
    expect(asked.map((args) => args.join(" "))).toEqual([
      "rev-parse HEAD",
      "merge --ff-only origin/main",
      "diff --name-only ORIG_HEAD HEAD -- package.json bun.lock",
    ])
  })

  test("needs no install when the packages did not change", async () => {
    const { git } = fakeGit({})
    expect(await takeUpdate(git)).toEqual({ ok: true, install: false })
  })

  test("says why when the merge cannot be taken, and changes nothing more", async () => {
    const { git, asked } = fakeGit({
      merge: { code: 1, stderr: "error: Your local changes would be overwritten by merge\nmore\n" },
    })
    expect(await takeUpdate(git)).toEqual({ ok: false, why: "error: Your local changes would be overwritten by merge" })
    expect(asked.map((args) => args[0])).toEqual(["rev-parse", "merge"])
  })
})
