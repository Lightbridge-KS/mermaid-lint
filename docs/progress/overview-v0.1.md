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
| **Now**  | M0 — Scaffold and dry gate | In progress |
| **Next** | M1 — Tracer bullet         | Not started |

The design was written on 2026-11-20 from two throwaway spikes. The corpus gate (M3)
comes before the hint work (M4) because the hint rules are written against corpus
fixtures.

## Milestones

### M0 — Scaffold and dry gate

**Goal:** an empty project in which format, lint, type check, tests and build all run
with one command, locally and in CI.

**Exit test:** `pnpm check` passes on a clean clone; the CI workflow is green.

- [x] Git repository, pnpm project, exact dependency pins
- [x] TypeScript, biome and vitest configured; `pnpm check` runs all four checks
- [x] Licence, changelog, README stub, agent instructions
- [x] Commit hooks (`.pre-commit-config.yaml`)
- [ ] CI workflow on Node.js 22 and 24, green on the remote

### M1 — Tracer bullet

**Goal:** one bare diagram file goes through every layer: `cli` → `lint` → `engine` →
`report` → exit code.

**Exit test:** `mermaid-lint good.mmd` exits `0` and `mermaid-lint bad.mmd` exits `1`
with a `file:line` finding, run against the built binary.

### M2 — Markdown and line mapping

**Goal:** Mermaid blocks in Markdown are found and every finding is in file
coordinates (R-01, R-03, R-08).

**Exit test:** the extraction tests and the line-map tests pass; directories and
standard input work; exit `2` cases print a cause and a fix.

### M3 — Corpus gate

**Goal:** the vendored corpus proves verdict parity with the pinned parser (R-02).

**Exit test:** the corpus test passes with the mismatches listed in
`tests/fixtures/maid/KNOWN-MISMATCHES.md`.

### M4 — Errors that teach

**Goal:** the five upstream error families become plain findings with glossary
messages, curated hints, and `--json` (R-05, R-06).

**Exit test:** the hint snapshot tests and the JSON shape test pass.

### M5 — Skill, documents and v0.1.0

**Goal:** the skill ships in the package; the README and `--help` hold the contract;
the repository is public; the version is tagged (R-07).

**Exit test:** a fresh checkout installs with the documented command; the skill
resolves from the install tree; all success criteria in the design pass; tag
`v0.1.0` exists.

## Deferred

- **`.gitignore` in directory scans** (R-09) — after v0.1.0.
- **npm publication and a bundle** (R-09) — needs a package-name check and a
  bundle-size check.
- **Release automation** (CI drafts the release from the changelog) — with npm
  publication.
- **A render check** — out of scope; see _Known limits_ in the design.

## Open questions

- **M2:** Does `mdast-util-from-markdown` give the fence indent for a block inside a
  list item or a block quote, so that the column can be mapped?
- **M4:** Is the cause named for each curated hint group true for every fixture in
  that group?
- **M5:** Does the summary's diagram count suffice to show a file with zero Mermaid
  blocks, or does an explicit file with no block need its own notice?

## Confirmed contracts

Observed on 2026-11-20 with Node.js 26.13, `mermaid` 12.3.0, `happy-dom` 21.0.4. Each
one needs a test before code depends on it.

- `mermaid.parse()` needs `globalThis.window` and `globalThis.document`. With no DOM,
  valid diagrams fail with `DOMPurify.addHook is not a function`.
- One `mermaid` import serves many `parse()` calls in one process.
- The parser reports lines after it removes frontmatter, directive lines, comment
  lines and leading blank lines.
- In a grammar error, `hash.line` is zero-based; the line in the message is one-based
  and is the line of truth. `hash.loc` is the last accepted token, and the offending
  token starts at `loc.last_column`.
- A lexical error has a line and no column. A semantic error (`No such shape`) has no
  location.
- The parser can throw a plain `TypeError` on invalid input (2 of 110 failing
  fixtures).
- Structured parse errors (pie and the newer grammars) are `MermaidParseError` with
  `line N, column M` in the message and no `hash`.
