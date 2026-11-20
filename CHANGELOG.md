# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-20

First release. Install the package from a checkout; it is not on npm.

### Added

- `mermaid-lint PATH...` checks the Mermaid blocks of Markdown files (`.md`,
  `.markdown`, `.mdx`, `.qmd`) and bare diagram files (`.mmd`, `.mermaid`) with the
  parser of `mermaid` 12.3.0. It searches a directory path recursively; `-` reads
  standard input with `--stdin-kind md|mmd`.
- Findings give the line and the column in the file, also for blocks inside lists and
  block quotes and after frontmatter, directives or comments in a diagram.
- Messages name real characters instead of parser tokens. Common causes in flowchart,
  sequence, state, class and pie diagrams get a hint.
- Rules: `syntax`, `unknown-diagram`, `semantic`, `parser-crash`, `empty-block`,
  `unclosed-fence`.
- Exit codes: `0` no findings, `1` findings, `2` the check could not run.
- `--json` prints one object with `schema: 1`.
- An agent skill in `skill/mermaid-lint/`, shipped inside the package.

[Unreleased]: https://github.com/Lightbridge-KS/mermaid-lint/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Lightbridge-KS/mermaid-lint/releases/tag/v0.1.0
