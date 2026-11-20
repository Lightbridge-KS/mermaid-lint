/**
 * Verdict parity with the pinned Mermaid parser, over the vendored corpus.
 *
 * This is also the upgrade check: after a Mermaid version bump, every changed
 * verdict fails here and belongs in the changelog.
 */
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "vitest";
import { dispose } from "../src/engine.js";
import { lint } from "../src/lint.js";
import { fixture } from "./helpers.js";

afterAll(dispose);

const TYPES = ["flowchart", "sequence", "class", "state", "pie"] as const;

interface Mismatch {
	file: string;
	reason: string;
}

const mismatches = JSON.parse(
	readFileSync(fixture("maid/known-mismatches.json"), "utf8"),
) as Mismatch[];
const mismatchFiles = new Set(mismatches.map((mismatch) => mismatch.file));

/** Corpus files of one type and label, as paths relative to `maid/`. */
function corpus(type: string, label: "valid" | "invalid"): string[] {
	return readdirSync(fixture(`maid/${type}/${label}`))
		.filter((name) => name.endsWith(".mmd"))
		.sort()
		.map((name) => `${type}/${label}/${name}`);
}

function read(file: string): string {
	return readFileSync(fixture(`maid/${file}`), "utf8");
}

const invalid = TYPES.flatMap((type) => corpus(type, "invalid")).filter(
	(file) => !mismatchFiles.has(file),
);

describe.each(TYPES)("%s", (type) => {
	test.each(corpus(type, "valid"))("%s has no finding", async (file) => {
		const { findings } = await lint(read(file), "mmd", file);
		expect(findings).toEqual([]);
	});

	test.each(corpus(type, "invalid").filter((file) => !mismatchFiles.has(file)))(
		"%s has a finding",
		async (file) => {
			const { findings } = await lint(read(file), "mmd", file);
			expect(findings).toHaveLength(1);
		},
	);
});

describe("known mismatches", () => {
	test("the corpus has the expected size", () => {
		const all = TYPES.flatMap((type) => [
			...corpus(type, "valid"),
			...corpus(type, "invalid"),
		]);
		expect(all).toHaveLength(208);
	});

	test.each(mismatches)(
		"$file is accepted by the pinned parser",
		async ({ file }) => {
			const { findings } = await lint(read(file), "mmd", file);
			expect(findings).toEqual([]);
		},
	);
});

/**
 * Text that the parser removes before it counts lines. A finding must move down
 * by exactly the number of lines put in front of the diagram.
 */
describe.each([
	["frontmatter", "---\ntitle: T\n---\n", 3],
	["a directive and a comment", '%%{init: {"theme": "dark"}}%%\n%% note\n', 2],
])("a finding moves down with %s in front", (_name, preamble, lines) => {
	test.each(
		invalid.filter((file) => !read(file).trimStart().startsWith("---")),
	)("%s", async (file) => {
		const source = read(file);
		const [before] = (await lint(source, "mmd", file)).findings;
		const [after] = (await lint(preamble + source, "mmd", file)).findings;
		expect(after).toMatchObject({
			rule: before?.rule,
			line: (before?.line ?? 0) + lines,
			column: before?.column ?? null,
		});
	});
});
