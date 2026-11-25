import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const engine = join(import.meta.dir, "..", "engine")

// remote.py with an ssh of the test's own: each connection ends as the next of `ends` says, [exit code, the
// seconds it took]. What the lines print, as JSON.
async function withSsh(ends: Array<[number, number]>, lines: string): Promise<unknown> {
  const script = `
import json, sys, types
sys.path.insert(0, sys.argv[1])
import remote
ends = json.loads(sys.argv[2])
clock = {'now': 1000.0, 'calls': 0, 'slept': []}
def run(argv, **more):
    code, took = ends[min(clock['calls'], len(ends) - 1)]
    clock['calls'] += 1
    clock['now'] += took
    return types.SimpleNamespace(returncode=code, stdout=b'said', stderr=b'')
remote.subprocess.run = run
remote.time = types.SimpleNamespace(time=lambda: clock['now'], sleep=lambda seconds: clock['slept'].append(seconds))
remote.ssh_programs = lambda: ['ssh']
remote.way = lambda host, anew=False: None if anew else ['ssh', 'python3']
${lines}
`
  const child = Bun.spawn([python ?? "python", "-c", script, engine, JSON.stringify(ends)], { stdout: "pipe", stderr: "pipe" })
  const out = await new Response(child.stdout).text()
  const problem = await new Response(child.stderr).text()
  if ((await child.exited) !== 0) throw new Error(problem)
  return JSON.parse(out)
}

describe.skipIf(!python)("another machine over a network that falters", () => {
  test("a connection cut at once is tried again, and what the machine says the next time is the answer", async () => {
    const said = await withSsh([[255, 0.2], [0, 0.5]], "print(json.dumps([remote.python_there('windows', 'x').decode(), clock['calls'], clock['slept']]))")
    expect(said).toEqual(["said", 2, [0, 0.7]])
  })

  test("one cut every time is given up after three tries; a script that failed there is not asked again", async () => {
    expect(await withSsh([[255, 0.2]], "print(json.dumps([remote.python_there('windows', 'x'), clock['calls']]))")).toEqual([null, 3])
    expect(await withSsh([[1, 0.2]], "print(json.dumps([remote.python_there('windows', 'x'), clock['calls']]))")).toEqual([null, 1])
  })

  test("a machine that does not answer in its whole time is off: it is not waited for again", async () => {
    expect(await withSsh([[255, 8]], "print(json.dumps([remote.python_there('windows', 'x'), clock['calls']]))")).toEqual([null, 1])
    expect(await withSsh([[255, 8]], "print(json.dumps([remote.find_way('windows'), clock['calls']]))")).toEqual([null, 1])
  })

  test("the folders that are another machine's disk are told from what mount lists, by their file system", async () => {
    const listing = [
      "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
      "//ana@192.168.1.50/pc-d on /Volumes/pc-d (smbfs, nodev, nosuid, mounted by ana)",
      "/dev/disk4s1 on /Volumes/USB (exfat, local, nodev, nosuid, noowners)",
      "//ana@nas/Mis fotos on /Volumes/Mis fotos (afpfs, nodev, nosuid)",
      "map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)",
    ].join("\n")
    expect(await withSsh([[0, 0]], `print(json.dumps(remote.network_mounts(${JSON.stringify(listing)})))`)).toEqual(["/Volumes/pc-d", "/Volumes/Mis fotos"])
  })

  test("how a machine is reached is found on the second try when the first was cut", async () => {
    expect(await withSsh([[255, 0.2], [0, 0.4]], "print(json.dumps([remote.find_way('windows'), clock['calls']]))")).toEqual([["ssh", "python3"], 2])
  })
})
