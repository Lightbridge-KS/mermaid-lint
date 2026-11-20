---
summary: Progress tracker for mermaid-lint v0.1.0 — milestones as vertical slices, what is in work now, what is next, deferred items, open questions tied to scheduled work, and contracts confirmed by observation.
read_when: At the start of any implementation session, before planning a milestone, and after landing work that completes or changes a milestone item.
---

# mermaid-lint — Progress overview, v0.1.0

- **Scope:** v0.1.0, as defined in the [design](../design/01-mermaid-lint-design.md).
- **Last updated:** 2026-11-20.

This file says _where the work is_. It links to the design; it does not repeat it.

## How to use this tracker

- A milestone is a **vertical slice**: it ends with something that runs end to end.
- A milestone's task list is expanded when work on it is about to start.
- A task is checked in the commit that lands it. The next commit that touches this
  file adds the commit after it: `- [x] Task text (abc1234)`.
- A learning that binds later work goes to _Confirmed contracts_. When it settles
  design, move it to the design doc and leave a link here.
- An engineering issue goes to the repository's issue tracker, not here.

Status values: **Not started**, **Planned** (task list written), **In progress**, **Done**.

## Now / Next

|          | Milestone                  | Status      |
| -------- | -------------------------- | ----------- |
| **Now**  | M5 — Skill, documents and v0.1.0 | In progress |

M0 to M4 are done as of 2026-11-20: the CLI checks bare diagrams and Markdown, reports
file lines and columns in plain words with hints, has its three exit codes and
`--json`, and agrees with the pinned parser on the whole corpus. M1 to M4 landed in
one commit, because the review of M1 and M2 changed code that M3 and M4 build on.

The design was written on 2026-11-20 from two throwaway spikes. The corpus gate (M3)
comes before the hint work (M4) because the hint rules are written against corpus
fixtures.

## Milestones

### M0 — Scaffold and dry gate

**Goal:** an empty project in which format, lint, type check, tests and build all run
with one command, locally and in CI.

**Exit test:** `pnpm check` passes on a clean clone; the CI workflow is green.

- [x] Git repository, pnpm project, exact dependency pins (b09705a)
- [x] TypeScript, biome and vitest configured; `pnpm check` runs all four checks (b09705a)
- [x] Licence, changelog, README stub, agent instructions (b09705a)
- [x] Commit hooks (`.pre-commit-config.yaml`) (b09705a)
- [x] CI workflow on Node.js 22 and 24, green on the remote for b09705a

### M1 — Tracer bullet

**Goal:** one bare diagram file goes through every layer: `cli` → `lint` → `engine` →
`report` → exit code.

**Exit test:** `mermaid-lint good.mmd` exits `0` and `mermaid-lint bad.mmd` exits `1`
with a `file:line` finding, run against the built binary.

- [x] `engine`: DOM shim, one parser instance, five error shapes to one `Failure`
- [x] `lint`, `report` (text and JSON) and `cli` with exit codes `0`, `1`, `2`
- [x] CLI tests run the built binary

### M2 — Markdown and line mapping

**Goal:** Mermaid blocks in Markdown are found and every finding is in file
coordinates (R-01, R-03, R-08).

**Exit test:** the extraction tests and the line-map tests pass; directories and
standard input work; exit `2` cases print a cause and a fix.

- [x] `extract`: fenced blocks from a CommonMark syntax tree; `empty-block`,
      `unclosed-fence`
- [x] `line-map`: port of the parser's text removal; parser line to source line
- [x] Columns through list indents and block-quote markers
- [x] Directories, standard input with `--stdin-kind`, file kind by extension
- [x] Extraction tests, line-map tests, exit-`2` tests

### M3 — Corpus gate

**Goal:** the vendored corpus proves verdict parity with the pinned parser (R-02).

**Exit test:** the corpus test passes with the mismatches listed in
`tests/fixtures/maid/known-mismatches.json`.

- [x] 208 corpus files, the ISC licence and a provenance note in `tests/fixtures/maid/`
- [x] `known-mismatches.json`: 3 files labelled invalid that Mermaid 12.3.0 accepts
- [x] Corpus test: verdicts, corpus size, and line shift under removed text

### M4 — Errors that teach

**Goal:** every finding has a plain message from the glossary, and the common causes
have a curated hint (R-05). The normalisation of the five upstream error shapes and
`--json` (R-06) landed with M1.

**Exit test:** the glossary tests and the corpus message snapshot pass.

- [x] `hints`: token glossary; expected lists of five items or fewer
- [x] Curated hints for flowchart, sequence, state, class and pie
- [x] `tests/snapshots/corpus-messages.txt`: position, message and hint of every
      invalid corpus file (83 of 110 have a hint)
- [x] Source excerpts longer than 160 characters are cut around the column

### M5 — Skill, documents and v0.1.0

**Goal:** the skill ships in the package; the README and `--help` hold the contract;
the repository is public; the version is tagged (R-07).

**Exit test:** a fresh checkout installs with the documented command; the skill
resolves from the install tree; all success criteria in the design pass; tag
`v0.1.0` exists.

- [x] `skill/mermaid-lint/SKILL.md` (24 lines; no Mermaid syntax rule)
- [x] README: install, use, exit codes, rules, JSON, skill, limits
- [x] `CHANGELOG.md` section `[0.1.0]`
- [ ] Tag `v0.1.0`; the repository is public; a draft release exists

Success criteria of the design, checked on 2026-11-20 on macOS with Node.js 26.13:

| # | Criterion | Result |
|---|---|---|
| 1 | Corpus verdicts | Pass: 95 valid files give no finding, 110 invalid files give one, 3 known mismatches are accepted (`tests/corpus.test.ts`). |
| 2 | Line mapping | Pass: line-map cases in `tests/lint.test.ts`, and the line-shift check over the corpus. |
| 3 | Under 1 second | Pass: about 0.3 s for one Markdown file with three diagrams. |
| 4 | Skill size | Pass: 24 lines, no Mermaid syntax rule. |

The dry gate also passes on a copy of the tree in an empty directory after
`pnpm install --frozen-lockfile` (2026-11-20, same machine).

Also run on 2026-11-20 on the same machine: `mermaid-lint README.md skill docs
AGENTS.md` exits `0` (the tool on its own documents); after `pnpm link --global`,
`mermaid-lint --version` prints `mermaid-lint 0.1.0 (mermaid 12.3.0)` from another
directory, and `$(pnpm root -g)/mermaid-lint/skill/mermaid-lint/SKILL.md` exists
(pnpm 10.18.2). CI on Node.js 22 and 24 has run only for the scaffold commit so far.

## Deferred

- **`.gitignore` in directory scans** (R-09) — after v0.1.0.
- **npm publication and a bundle** (R-09) — needs a package-name check and a
  bundle-size check.
- **Release automation** (CI drafts the release from the changelog) — with npm
  publication.
- **A render check** — out of scope; see _Known limits_ in the design.

## Open questions

None.

## Answered

- **Is the diagram count enough to show a file with no Mermaid block?** Yes for
  v0.1.0. The summary always prints the count of all files together, and the skill
  tells the agent to run a file alone when the count is lower than expected. A
  separate notice would add a second kind of output.

## Confirmed contracts

Observed on 2026-11-20 with Node.js 26.13, `mermaid` 12.3.0, `happy-dom` 21.0.4. Each
one needs a test before code depends on it.

The contracts about positions have settled design and now live in the design doc:
[Upstream error families](../design/01-mermaid-lint-design.md#upstream-error-families)
(which line and column the parser reports, when they are wrong, and the errors with
no position),
[Position map](../design/01-mermaid-lint-design.md#position-map) (the text that the
parser removes or rewrites before it parses) and
[Known limits](../design/01-mermaid-lint-design.md#7-known-limits) (Mermaid's default
limits).

- `mermaid.parse()` needs `globalThis.window` and `globalThis.document`. With no DOM,
  valid diagrams fail with `DOMPurify.addHook is not a function`.
- One `mermaid` import serves many `parse()` calls in one process.
- In a grammar error the end-of-input token is the number `1`, not a name. In a
  structured error the end-of-input token has the position `-1`.
- Structured parse errors (pie and the newer grammars) carry `result.lexerErrors` and
  `result.parserErrors`, each with a line and a column. The message alone holds only
  the first one.
- `mdast-util-from-markdown` gives the line and the column of the opening fence, also
  inside a list item or a block quote. The Markdown container prefix of a content line
  is the part of the file line before the diagram line (2026-11-20, version 2.1.0).
