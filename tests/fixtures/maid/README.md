# Vendored fixture corpus

These diagram files come from [probelabs/maid](https://github.com/probelabs/maid), a
Mermaid linter with its own parsers. mermaid-lint uses them as test data only.

- **Source:** `test-fixtures/{flowchart,sequence,class,state,pie}/{valid,invalid}/*.mmd`
- **Commit:** `c30a4ec4fa77655ef6c89618480c864655bd0e54` (maid 1.0.1)
- **Licence:** ISC; see [LICENSE](LICENSE) in this directory.
- **Copied:** the 208 `.mmd` files, unchanged, and the licence.
- **Not copied:** rendered previews, the preview Markdown files, and
  `expected-errors.json`.

The directory names `valid` and `invalid` are maid's labels. The corpus test
(`tests/corpus.test.ts`) asserts that the pinned Mermaid parser agrees with them.
[`known-mismatches.json`](known-mismatches.json) lists the files where it does not,
with the reason. mermaid-lint maintains that file; it is not part of the upstream
corpus.

Do not edit or reformat the `.mmd` files. To refresh the corpus, copy the same paths
from a newer maid commit, update the commit above, and run the corpus test.
