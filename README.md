# mermaid-lint

Lint the Mermaid diagrams in Markdown files with the real Mermaid parser.

An AI coding agent that writes a Mermaid block cannot see the rendered diagram, so a
syntax error shows only later, in a viewer. `mermaid-lint` is a local check for that
agent, and for people. It reports each broken diagram at its line in the Markdown file
and says how to fix it. A run on one file with three diagrams takes less than one
second on a developer laptop.

```text
$ mermaid-lint docs/arch.md
docs/arch.md:24:28: error[syntax] flowchart-v2: unexpected "(" inside a label
  24 |   paid --> ship[Ship order (warehouse)]
  hint: brackets inside a label need quotes; put the label text in double quotes: A["text (more)"] for a node, -->|"text (more)"| for an edge

1 error in 1 of 3 diagrams, 1 file (mermaid 12.3.0)
```

- **The real parser.** It runs the pinned [`mermaid`](https://github.com/mermaid-js/mermaid)
  package in Node.js, with no browser. It checks every diagram type that this Mermaid
  version parses, and the verdict is the parser's own.
- **File coordinates.** Lines and columns are positions in the Markdown file, also for
  blocks inside lists and block quotes, and after frontmatter or comments in a diagram.
- **Errors that teach.** Raw parser tokens become real characters, and common causes
  get a concrete hint.
- **A small contract.** One command, two flags, three exit codes, optional JSON.

## Install

Requirements: Node.js 22.12 or later and [pnpm](https://pnpm.io). The package is not
on npm yet. There are two ways to install it from a checkout.

### Option 1: link the checkout

The global command runs the checkout's build. Use this to work on the tool: after a
`pnpm build`, the command and its skill have your changes.

```bash
git clone https://github.com/Lightbridge-KS/mermaid-lint.git
cd mermaid-lint
pnpm install
pnpm build
pnpm link --global
```

`pnpm link --global` needs pnpm's global bin directory on `PATH`; `pnpm setup` adds it.

### Option 2: install a release as a package

This installs a fixed copy of one release tag. Changes to a checkout do not change the
installed command or its skill. Replace `v0.1.0` and `0.1.0` with the release you want:

```bash
git clone --branch v0.1.0 --depth 1 https://github.com/Lightbridge-KS/mermaid-lint.git
cd mermaid-lint
pnpm install --frozen-lockfile
pnpm build
pnpm pack
npm install --global ./mermaid-lint-0.1.0.tgz
```

The command goes into npm's global bin directory (`npm prefix -g` shows the prefix),
which must be on `PATH`. npm resolves the dependencies again and does not read
`pnpm-lock.yaml`. `package.json` pins the direct dependencies to exact versions, but
the transitive dependencies can differ from the lockfile. To upgrade, repeat the steps
with the new tag. `npm install --global` replaces the old copy.

Use one option at a time. If both are installed, the first match on `PATH` runs;
`command -v mermaid-lint` shows which copy that is.

Check either install with `mermaid-lint --version`.

## Use

```text
mermaid-lint [--json] PATH...
mermaid-lint [--json] --stdin-kind md|mmd -
```

| Path | Read as |
|---|---|
| `.md` `.markdown` `.mdx` `.qmd` | Markdown. The tool checks every fenced block marked `mermaid` (or `{mermaid}` in Quarto). |
| `.mmd` `.mermaid` | One bare diagram. |
| a directory | The tool searches it recursively for the file types above. It skips `node_modules` and directories whose name starts with a dot, and it does not read `.gitignore`. |
| `-` | Standard input. It needs `--stdin-kind`, so that the tool never reads a raw diagram as Markdown by mistake. |

```bash
mermaid-lint docs/architecture.md
mermaid-lint --json docs README.md
cat diagram.mmd | mermaid-lint --stdin-kind mmd -
```

### Exit codes

| Code | Meaning | Output |
|---|---|---|
| `0` | No findings. | One summary line on stdout; with `--json`, the JSON object. |
| `1` | One or more findings. | The report on stdout. |
| `2` | The check could not run: a usage error, a path that is missing or cannot be read, or an internal error. | The cause and a fix on stderr; nothing on stdout. |

### Findings

A finding is `file:line:column: error[rule] type: message`, then the source line, then
a hint when one is known. A finding has no column when the parser gives none.

| Rule | Meaning |
|---|---|
| `syntax` | The parser rejected the text. |
| `unknown-diagram` | No diagram type matches the first line. |
| `semantic` | The text parsed, then Mermaid rejected the diagram (for example an unknown shape name). |
| `parser-crash` | The parser failed with an internal error. The tool reports the diagram as invalid. |
| `empty-block` | A Mermaid block has no content. |
| `unclosed-fence` | A Mermaid fence has no closing fence. |

The parser stops at the first error in a diagram, so a diagram gives at most one
finding per run. Fix it and run again.

### JSON

`--json` prints one object:

```json
{
  "schema": 1,
  "mermaid_version": "12.3.0",
  "summary": { "files": 1, "diagrams": 3, "errors": 1 },
  "findings": [
    {
      "file": "docs/arch.md",
      "line": 24,
      "column": 28,
      "block": 3,
      "diagram_type": "flowchart-v2",
      "rule": "syntax",
      "message": "unexpected \"(\" inside a label",
      "hint": "brackets inside a label need quotes; put the label text in double quotes: A[\"text (more)\"] for a node, -->|\"text (more)\"| for an edge",
      "excerpt": "  paid --> ship[Ship order (warehouse)]"
    }
  ]
}
```

`column`, `diagram_type`, `hint` and `excerpt` can be `null`. `schema` rises when a key
is removed or renamed.

## Agent skill

The package ships a short skill for AI coding agents in
[`skill/mermaid-lint/`](skill/mermaid-lint/SKILL.md). It tells an agent when to run the
tool and how to read the result. It holds no Mermaid syntax rules, because the tool
gives the right hint at the moment of the error.

The skill is inside the installed package, so it always matches the installed command.
Link it into the agent's skill directory; do not copy it. After option 1, the package
is under pnpm's global root. For Claude Code:

```bash
ln -sfn "$(pnpm root -g)/mermaid-lint/skill/mermaid-lint" ~/.claude/skills/mermaid-lint
```

After option 2, the package is under npm's global root:

```bash
ln -sfn "$(npm root -g)/mermaid-lint/skill/mermaid-lint" ~/.claude/skills/mermaid-lint
```

For Codex, use the same source path with the destination
`~/.codex/skills/mermaid-lint`. `-sfn` replaces an old link, for example after a change
from option 1 to option 2.

## Limits

- **Parse-only.** A diagram that parses can still render badly or say the wrong thing.
- **One Mermaid version.** Viewers ship different Mermaid versions. A diagram that is
  valid here can fail in an older viewer. Every summary prints the version in use.
- **Mermaid's default limits apply**, for example 500 edges in a flowchart.
- **Positions are the parser's.** Some errors have no column. A few have no position
  of their own; the tool reports them at the first line of the diagram, and the
  message says so.

## Development

```bash
pnpm install
pnpm check    # lint, type check, build, tests
```

[AGENTS.md](AGENTS.md) has the commands and the rules for changes. The
[design document](docs/design/01-mermaid-lint-design.md) explains how the tool works,
and the [progress overview](docs/progress/overview-v0.1.md) says what is done.

## Acknowledgements

- [Mermaid](https://github.com/mermaid-js/mermaid) does the parsing. This project ports
  a small part of its text preprocessing so that positions point at the right place; see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- [maid](https://github.com/probelabs/maid) by Probelabs provides the fixture corpus
  that the tests check the parser's verdicts against
  ([tests/fixtures/maid/](tests/fixtures/maid/README.md)).

## Licence

MIT. See [LICENSE](LICENSE).
