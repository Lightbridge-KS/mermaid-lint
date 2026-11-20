import { readdirSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "vitest";
import { dispose } from "../src/engine.js";
import { explain } from "../src/hints.js";
import { lint } from "../src/lint.js";
import type { Failure } from "../src/types.js";
import { fixture } from "./helpers.js";

afterAll(dispose);

function failure(overrides: Partial<Failure>): Failure {
	return {
		rule: "syntax",
		line: 2,
		column: 1,
		diagramType: "flowchart-v2",
		unexpected: null,
		found: null,
		expected: [],
		detail: "Parse error on line 2:",
		...overrides,
	};
}

describe("glossary", () => {
	test("raw token names become real characters", () => {
		const { message } = explain(
			failure({ unexpected: "SQE", found: "]", expected: ["PE", "TEXT"] }),
			"  A[Text] --> B(Text]",
		);
		expect(message).toBe('unexpected "]"; expected ")" or text');
	});

	test("the rejected text is shown when it is short and on one line", () => {
		const { message } = explain(
			failure({
				diagramType: "sequence",
				unexpected: "ACTOR",
				found: "ten",
				expected: ["NEWLINE", "NUM"],
			}),
			"  autonumber 10 ten",
		);
		expect(message).toBe(
			'unexpected "ten"; expected the end of the line or a number',
		);
	});

	test("a rejected text that spans lines is named by its kind", () => {
		const { message } = explain(
			failure({ unexpected: "STR", found: "a\nb", expected: ["LINK"] }),
			"  A -- x",
		);
		expect(message).toBe(
			'unexpected a quoted string; expected an arrow such as "-->"',
		);
	});

	test("a list of more than five expected items is left out", () => {
		const { message } = explain(
			failure({
				diagramType: "sequence",
				unexpected: "and",
				found: "and",
				expected: ["NEWLINE", "create", "box", "end", "loop", "opt", "alt"],
			}),
			"  and",
		);
		expect(message).toBe('unexpected "and"');
	});

	test("noise tokens and repeats are dropped from the expected list", () => {
		const { message } = explain(
			failure({
				diagramType: "sequence",
				unexpected: "INVALID",
				found: ">",
				expected: ["SPACE", "INVALID", "SOLID_ARROW", "DOTTED_ARROW", "TXT"],
			}),
			"  A==>>B: x",
		);
		expect(message).toBe(
			'unexpected ">"; expected a message arrow such as "->>" or a colon and text (": text")',
		);
	});

	test("a token the glossary does not know keeps its parser name", () => {
		const { message } = explain(
			failure({
				diagramType: "gantt",
				unexpected: "taskData",
				expected: ["weekday"],
			}),
			"  Task",
		);
		expect(message).toBe('unexpected "taskData"; expected "weekday"');
	});

	test("the end of the line and the end of the diagram read as early ends", () => {
		const line = explain(
			failure({
				diagramType: "pie",
				unexpected: "NEWLINE",
				expected: ["NUMBER_PIE"],
			}),
			'  "Dogs" :',
		);
		expect(line.message).toBe("the line ends too early; expected a number");
		const end = explain(
			failure({
				diagramType: "classDiagram",
				unexpected: "EOF_IN_STRUCT",
				expected: ["STRUCT_STOP", "MEMBER"],
			}),
			"  +bar()",
		);
		expect(end.message).toBe(
			'the diagram ends too early; expected "}" or a class member',
		);
		expect(end.hint).toBe('a class body is not closed; add "}"');
	});

	test("a lexical error names no token", () => {
		const { message } = explain(failure({ column: null }), "    ---");
		expect(message).toBe("the parser cannot read part of this line");
	});
});

describe("arrow hints do not fire on valid arrows", () => {
	test.each([
		["a dotted arrow", "  A -.-> B - C"],
		["an arrow with two heads", "  A ->> B"],
	])('flowchart: %s on the line gives no "->" hint', (_name, line) => {
		const { hint } = explain(
			failure({ unexpected: "MINUS", found: "-", expected: ["LINK"] }),
			line,
		);
		expect(hint).toBeNull();
	});

	test("flowchart: a single-line arrow gives the hint", () => {
		const { hint } = explain(
			failure({ unexpected: "MINUS", found: "-", expected: ["LINK"] }),
			"  A -> B",
		);
		expect(hint).toBe('"->" is not a flowchart arrow; use "-->"');
	});

	test('state: "->" in a description gives no transition hint', () => {
		const { hint } = explain(
			failure({
				diagramType: "stateDiagram",
				unexpected: "ID",
				found: "x",
				expected: ["NL"],
			}),
			"  A --> B : a -> b x",
		);
		expect(hint).toBeNull();
	});
});

describe("rules without a parser position", () => {
	test("unknown-diagram quotes the first line and lists diagram types", () => {
		const { message, hint } = explain(
			failure({
				rule: "unknown-diagram",
				diagramType: null,
				line: 1,
				column: null,
			}),
			"A --> B",
		);
		expect(message).toBe('no diagram type matches the first line "A --> B"');
		expect(hint).toContain("flowchart TD");
	});

	test("semantic keeps the parser's words and says the position is unknown", () => {
		const { message, hint } = explain(
			failure({
				rule: "semantic",
				line: 1,
				column: null,
				detail: "No such shape: rhombus.",
			}),
			"flowchart TD",
		);
		expect(message).toBe(
			"No such shape: rhombus (the parser gives no position; this is the first line of the diagram)",
		);
		expect(hint).toBeNull();
	});

	test("parser-crash says that the cause is unknown", () => {
		const { message, hint } = explain(
			failure({
				rule: "parser-crash",
				line: 1,
				column: null,
				detail: "Cannot read properties of undefined",
			}),
			"flowchart TD",
		);
		expect(message).toContain("the Mermaid parser failed on this diagram");
		expect(message).toContain("the parser gives no position");
		expect(hint).toBeNull();
	});
});

/**
 * Every invalid corpus file with its position, message and hint, in one readable
 * file. A change to a message, a hint, or a Mermaid version shows as a diff of
 * `tests/snapshots/corpus-messages.txt`. Update it with `pnpm test -u` and read
 * the diff before committing.
 */
test("corpus messages and hints", async () => {
	const mismatches = new Set(
		(
			JSON.parse(
				readFileSync(fixture("maid/known-mismatches.json"), "utf8"),
			) as { file: string }[]
		).map((mismatch) => mismatch.file),
	);
	const lines: string[] = [];
	for (const type of ["flowchart", "sequence", "class", "state", "pie"]) {
		const names = readdirSync(fixture(`maid/${type}/invalid`))
			.filter((name) => name.endsWith(".mmd"))
			.sort();
		for (const name of names) {
			const file = `${type}/invalid/${name}`;
			if (mismatches.has(file)) continue;
			const text = readFileSync(fixture(`maid/${file}`), "utf8");
			const [finding] = (await lint(text, "mmd", file)).findings;
			if (!finding) throw new Error(`no finding for ${file}`);
			lines.push(
				`${file}:${finding.line}:${finding.column ?? "-"} [${finding.rule}]`,
				`  line: ${(finding.excerpt ?? "").trim() || "(empty)"}`,
				`  message: ${finding.message}`,
				`  hint: ${finding.hint ?? "-"}`,
				"",
			);
		}
	}
	await expect(`${lines.join("\n")}`).toMatchFileSnapshot(
		"./snapshots/corpus-messages.txt",
	);
});
