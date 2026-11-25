import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const engine = join(import.meta.dir, "..", "engine")

// Runs a few lines of Python with the engine's folder on its path; what they print, and the code they end with.
async function run(lines: string, ...args: string[]): Promise<[string, number]> {
  const child = Bun.spawn([python ?? "python", "-c", `import sys; sys.path.insert(0, sys.argv[1])\n${lines}`, engine, ...args], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(child.stdout).text()
  return [out.trim(), await child.exited]
}

describe.skipIf(!python)("Office's old files with no Office", () => {
  test("a .doc's copy has its headings under the names the popup tells a heading by, whatever the document's language", async () => {
    const root = mkdtempSync(join(tmpdir(), "speedy-legacy-"))
    try {
      const copy = join(root, "copy.docx")
      const styles = [
        '<w:styles><w:style w:type="paragraph" w:styleId="DocStyle0"><w:name w:val="Normal" /></w:style>',
        '<w:style w:type="paragraph" w:styleId="DocStyle1"><w:name w:val="Título 1" /><w:pPr><w:outlineLvl w:val="0" /></w:pPr></w:style>',
        '<w:style w:type="paragraph" w:styleId="DocStyle2"><w:name w:val="Título 2" /><w:pPr><w:outlineLvl w:val="1" /></w:pPr></w:style>',
        '<w:style w:type="character" w:styleId="DocStyle9"><w:name w:val="Énfasis" /></w:style></w:styles>',
      ].join("")
      writeFileSync(join(root, "styles.xml"), styles)
      const [said, code] = await run(
        [
          "import zipfile, legacy_office",
          "with zipfile.ZipFile(sys.argv[2], 'w') as made:",
          "    made.writestr('word/styles.xml', open(sys.argv[3], encoding='utf-8').read())",
          "    made.writestr('word/document.xml', '<w:document>año</w:document>')",
          "legacy_office.name_headings(sys.argv[2])",
          "with zipfile.ZipFile(sys.argv[2]) as made:",
          "    import re",
          "    print(re.findall(r'w:name w:val=\"([^\"]*)\"', made.read('word/styles.xml').decode('utf-8')), made.read('word/document.xml').decode('utf-8'))",
        ].join("\n"),
        copy,
        join(root, "styles.xml"),
      )
      // The headings are named by their level; a style that is no heading, and the document, stay as they were.
      expect([said, code]).toEqual(["['Normal', 'heading 1', 'heading 2', 'Énfasis'] <w:document>año</w:document>", 0])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a file that cannot be read ends with 1 and says why, and no copy is left", async () => {
    const root = mkdtempSync(join(tmpdir(), "speedy-legacy-"))
    try {
      const child = Bun.spawn([python ?? "python", join(engine, "legacy_office.py"), join(root, "none.xls"), join(root, "copy.xlsx")], { stdout: "pipe", stderr: "pipe" })
      const why = await new Response(child.stderr).text()
      expect([await child.exited, why.length > 0, await Bun.file(join(root, "copy.xlsx")).exists()]).toEqual([1, true, false])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("the Windows setup installs and checks the readers; the macOS one does not, as macOS reads those files itself", async () => {
    const windowsInstaller = await Bun.file(join(import.meta.dir, "..", "setup", "install.ps1")).text()
    const macInstaller = await Bun.file(join(import.meta.dir, "..", "setup", "install.sh")).text()
    expect(windowsInstaller).toMatch(/uv pip install --python \$python .*msdoc2docx sharepoint-to-text/)
    expect(windowsInstaller).toContain("doc2docx, sharepoint2text, xlrd, openpyxl")
    expect(macInstaller).not.toContain("msdoc2docx")
  })
})
