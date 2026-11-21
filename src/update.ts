/**
 * Updates from GitHub: whether main has commits this clone lacks, and taking them.
 *
 * The clone is the plugin itself, so taking them is a fast-forward of main: it never overwrites a change
 * of the person's own, and when it cannot be taken, git says why and nothing else is done.
 */

/** Runs git in the clone: its exit code and what it printed. */
export type Git = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>

/** The commits GitHub has on main that the clone lacks: a fetch, which changes no file, then a count. */
export async function behindOrigin(git: Git): Promise<number> {
  const fetched = await git(["fetch", "-q", "origin", "main"])
  if (fetched.code !== 0) return 0
  const counted = await git(["rev-list", "--count", "HEAD..origin/main"])
  return counted.code === 0 ? Number(counted.stdout.trim()) || 0 : 0
}

/**
 * Takes what GitHub has on main, as a fast-forward. `install` says whether the packages changed, so
 * they are installed again; `why` is git's first line when it could not be taken.
 */
export async function takeUpdate(
  git: Git,
): Promise<{ readonly ok: true; readonly install: boolean } | { readonly ok: false; readonly why: string }> {
  await git(["rev-parse", "HEAD"])
  const merged = await git(["merge", "--ff-only", "origin/main"])
  if (merged.code !== 0) {
    const why = (merged.stderr || merged.stdout).trim().split(/\r?\n/)[0] || "git no respondió"
    return { ok: false, why }
  }
  const changed = await git(["diff", "--name-only", "ORIG_HEAD", "HEAD", "--", "package.json", "bun.lock"])
  return { ok: true, install: changed.stdout.trim() !== "" }
}
