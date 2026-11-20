# mermaid-lint — agent instructions

`mermaid-lint` is a CLI that lints Mermaid diagrams in Markdown files with the real
Mermaid parser. From milestone M5 it ships one agent skill in `skill/mermaid-lint/`.

## Read first

- [Design](docs/design/01-mermaid-lint-design.md) — requirements, modules, the CLI
  contract, the skill, the test plan.
- [Progress overview](docs/progress/overview-v0.1.md) — milestones, open questions,
  confirmed contracts. Update it in the same commit as the work it records.

## Commands

Run from the repository root. Prerequisites: Node.js 22.12 or later and pnpm (the version
in `packageManager` of `package.json`). The test runner does not support Node.js 25.

| Command        | Does                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `pnpm install` | Installs the pinned dependencies.                                         |
| `pnpm check`   | The dry gate: lint, type check, build, tests. Run it before every commit. |
| `pnpm format`  | Formats and applies safe lint fixes.                                      |
| `pnpm build`   | Emits `dist/` from `src/`.                                                |
| `pnpm test`    | Runs the tests. The CLI tests run `dist/cli.js`, so build first.          |

Commit hooks are in `.pre-commit-config.yaml`; install them once per clone with
`prek install` (or `pre-commit install`). The secrets hook needs `gitleaks` on `PATH`.

## Rules

- `src/engine.ts` is the only module that imports `mermaid` or `happy-dom`.
- Some paths below arrive with later milestones (the corpus in M3, the skill in M5);
  the progress overview says what exists now.
- `mermaid` and `happy-dom` are pinned to exact versions. A version bump is a
  deliberate change: run the corpus test, list every changed verdict in
  `CHANGELOG.md`, and re-check the line-map tests.
- `tests/fixtures/maid/` is a vendored corpus under its own licence. Do not edit or
  reformat its files.
- A change to flags, exit codes, rule names, the text format or the JSON keys is a
  contract change: update the design doc, `--help`, the README and the skill together.
