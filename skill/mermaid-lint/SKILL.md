---
name: mermaid-lint
description: Check Mermaid diagrams with the mermaid-lint CLI, which runs the real Mermaid parser. Use after writing or editing a mermaid code block in a Markdown file (.md, .mdx, .qmd) or a .mmd file, before the work is reported as done.
---

# mermaid-lint

A rendered diagram is not visible to you. `mermaid-lint` says whether each diagram parses.

Run it on the files you changed, after each write or edit of a Mermaid block:

```bash
mermaid-lint docs/architecture.md README.md
```

- **Exit 0:** every diagram parses. The summary counts the diagrams of all files together; if the count is lower than expected, a mermaid block was not found, so run that file alone.
- **Exit 1:** findings on stdout as `file:line:column: error[rule] type: message`, then the source line, then a hint when one is known. Fix the diagram at that line.
- **Exit 2:** the call failed. stderr gives the cause and a fix.

The parser stops at the first error in a diagram. Fix it and run again until the exit code is 0.

A clean result means that each diagram parses with the Mermaid version in the summary. It does not check the layout or the meaning.

More (JSON output, directories, standard input): `mermaid-lint --help`.
