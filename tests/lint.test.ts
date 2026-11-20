import { afterAll, describe, expect, test } from "vitest";
import { dispose } from "../src/engine.js";
import { lint } from "../src/lint.js";

afterAll(dispose);

/** 1-based line of the first line of `text` that contains `needle`. */
function lineOf(text: string, needle: string): number {
	return text.split(/\r\n?|\n/).findIndex((line) => line.includes(needle)) + 1;
}

const flowBody = "flowchart TD\n  A --> B\n  B -> C\n";
const pieBody = 'pie title Pets\n  "Dogs" : 1\n  "Cats" 3\n';

describe("a bare diagram", () => {
	test("a valid diagram has no finding", async () => {
		const result = await lint("flowchart TD\n  A --> B\n", "mmd", "a.mmd");
		expect(result).toEqual({ diagrams: 1, findings: [] });
	});

	test("a rejected diagram gives one finding with the source line", async () => {
		const { findings } = await lint(flowBody, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{
				file: "a.mmd",
				line: 3,
				column: 5,
				block: 1,
				diagramType: "flowchart-v2",
				rule: "syntax",
				excerpt: "  B -> C",
			},
		]);
	});

	test("an unknown first line is reported at that line", async () => {
		const { findings } = await lint(
			"\n\nnotADiagram\n  A --> B\n",
			"mmd",
			"a.mmd",
		);
		expect(findings).toMatchObject([
			{ rule: "unknown-diagram", line: 3, column: null, diagramType: null },
		]);
	});
});

/**
 * The parser counts lines after it removes frontmatter, directives, comment lines
 * and leading white space. Each case puts a known error after one kind of removed
 * text; the finding must point at the true line.
 */
describe("the reported line is the line in the source", () => {
	const preambles: [name: string, preamble: string][] = [
		["nothing", ""],
		["frontmatter", "---\ntitle: T\n---\n"],
		[
			"frontmatter and blank lines",
			"---\ntitle: T\nconfig:\n  theme: dark\n---\n\n\n",
		],
		["indented frontmatter", "  ---\n  title: T\n  ---\n"],
		["a directive", '%%{init: {"theme": "dark"}}%%\n'],
		["a directive over three lines", '%%{init: {\n  "theme": "dark"\n}}%%\n'],
		["comment lines", "%% one\n%% two\n"],
		["blank lines", "\n\n\n"],
		[
			"frontmatter, a directive and a comment",
			'---\ntitle: T\n---\n%%{init: {"theme": "dark"}}%%\n\n%% note\n',
		],
	];

	test.each(preambles)("after %s (grammar error)", async (_name, preamble) => {
		const source = preamble + flowBody;
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ line: lineOf(source, "B -> C"), column: 5, excerpt: "  B -> C" },
		]);
	});

	test.each(preambles)(
		"after %s (structured error)",
		async (_name, preamble) => {
			const source = preamble + pieBody;
			const { findings } = await lint(source, "mmd", "a.mmd");
			expect(findings).toMatchObject([
				{ line: lineOf(source, '"Cats" 3'), column: 10, excerpt: '  "Cats" 3' },
			]);
		},
	);

	test("after comment lines and blank lines inside the diagram", async () => {
		const source =
			"flowchart TD\n  %% inner\n  A --> B\n\n  %% after a blank line\n  B -> C\n";
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([{ line: 6, excerpt: "  B -> C" }]);
	});

	test("with CRLF line ends", async () => {
		const source = `---\r\ntitle: T\r\n---\r\n${flowBody.replaceAll("\n", "\r\n")}`;
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ line: 6, column: 5, excerpt: "  B -> C" },
		]);
	});

	test("a lexical error has a line and no column", async () => {
		const source =
			"%% note\nstateDiagram-v2\n  state S {\n    A --> B\n    ---\n  }\n";
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([{ rule: "syntax", line: 5, column: null }]);
	});

	test("a semantic error is reported at the first diagram line", async () => {
		const source =
			'---\ntitle: T\n---\nflowchart TD\n  A@{ shape: rhombus, label: "X" }\n';
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ rule: "semantic", line: 4, column: null },
		]);
	});
});

describe("positions in special cases", () => {
	test("a column on an indented first line counts the indent", async () => {
		const source = "---\ntitle: T\n---\n\n   pie showData bogus\n";
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([{ rule: "syntax", line: 5, column: 17 }]);
	});

	// These two diagram types are parsed with comment lines kept.
	test.each([
		["agentflow-beta", "agentflow"],
		["eventmodeling", "eventmodeling"],
	])("%s keeps comment lines in its line count", async (header, type) => {
		const source = `%% one\n${header}\n  %% two\n  ¿¿¿ ###\n`;
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ rule: "syntax", line: 4, diagramType: type },
		]);
	});

	test("a failing diagram of 150 000 characters is still reported", async () => {
		const source = `%% note\nflowchart TD\n  A["${"x".repeat(150_000)}"]\n  A -> B\n`;
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ rule: "syntax", line: 4, column: 5, excerpt: "  A -> B" },
		]);
	});

	test("a long source line is shown as a part around the column", async () => {
		const label = "word ".repeat(80);
		const source = `flowchart TD\n  A[${label}(x) ${label}] --> B\n`;
		const [finding] = (await lint(source, "mmd", "a.mmd")).findings;
		expect(finding?.column).toBe(5 + label.length);
		expect(finding?.excerpt).toMatch(/^….*\(x\).*…$/);
		expect(finding?.excerpt?.length).toBeLessThanOrEqual(162);
	});

	test("a sequence block without its end gets a hint", async () => {
		const source = "sequenceDiagram\n  loop every minute\n  A->>B: hi\n";
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{
				rule: "syntax",
				message: "the diagram ends too early",
				hint: 'a block is not closed; add "end"',
			},
		]);
	});

	// Mermaid rewrites an entity to a longer placeholder before it parses.
	test.each([
		["a structured error", 'pie\n  "a #quot;b#quot;" 10\n  "c" : 1\n', 2, 21],
		[
			"a grammar error",
			'flowchart TD\n  A["say #quot;hi#quot;"] -> B\n',
			2,
			27,
		],
		[
			"a grammar error (numeric entities)",
			'flowchart TD\n  A["say #34;hi#34;"] -> B\n',
			2,
			23,
		],
	])(
		"entities before %s do not move the position",
		async (_name, source, line, column) => {
			const { findings } = await lint(source, "mmd", "a.mmd");
			expect(findings).toMatchObject([{ line, column }]);
		},
	);

	test("a rejected text with an entity is shown as written", async () => {
		const source = 'flowchart TD\n  A[x] --> B[say "a #quot; b" more]\n';
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{
				line: 2,
				column: 19,
				message: 'unexpected "a #quot; b" inside a label',
			},
		]);
	});

	test("an internal parser error is a parser-crash finding", async () => {
		const source = "flowchart TD\n  subgraph\n    A --> B\n  end\n";
		const { findings } = await lint(source, "mmd", "a.mmd");
		expect(findings).toMatchObject([
			{ rule: "parser-crash", line: 1, column: null, hint: null },
		]);
	});
});

describe("Markdown", () => {
	const fence = "```";

	test("every block is checked and counted; findings use file lines", async () => {
		const markdown = [
			"# Doc",
			"",
			`${fence}mermaid`,
			"flowchart TD",
			"  A --> B",
			fence,
			"",
			`${fence}mermaid`,
			"---",
			"title: T",
			"---",
			"flowchart TD",
			"  A --> B",
			"  B -> C",
			fence,
			"",
		].join("\n");
		const result = await lint(markdown, "md", "doc.md");
		expect(result.diagrams).toBe(2);
		expect(result.findings).toMatchObject([
			{ file: "doc.md", block: 2, line: 14, column: 5, excerpt: "  B -> C" },
		]);
	});

	test("the column includes the indent of a block in a list item", async () => {
		const markdown = `1. Step\n\n   ${fence}mermaid\n   flowchart TD\n     A -> B\n   ${fence}\n`;
		const { findings } = await lint(markdown, "md", "doc.md");
		expect(findings).toMatchObject([
			{ line: 5, column: 8, excerpt: "     A -> B" },
		]);
	});

	test("the column includes the marker of a block in a block quote", async () => {
		const markdown = `> ${fence}mermaid\n> flowchart TD\n>   A -> B\n> ${fence}\n`;
		const { findings } = await lint(markdown, "md", "doc.md");
		expect(findings).toMatchObject([
			{ line: 3, column: 7, excerpt: ">   A -> B" },
		]);
	});

	test("an empty block is a finding at the fence", async () => {
		const { findings } = await lint(
			`text\n\n${fence}mermaid\n${fence}\n`,
			"md",
			"doc.md",
		);
		expect(findings).toMatchObject([
			{ rule: "empty-block", line: 3, column: 1, excerpt: `${fence}mermaid` },
		]);
	});

	test("an unclosed fence is a finding at the fence, and its content is not parsed", async () => {
		const { findings } = await lint(
			`${fence}mermaid\nflowchart TD\n  A -> B\n`,
			"md",
			"doc.md",
		);
		expect(findings).toMatchObject([{ rule: "unclosed-fence", line: 1 }]);
		expect(findings).toHaveLength(1);
	});

	test("a file with no Mermaid block has zero diagrams", async () => {
		expect(await lint("# Only text\n", "md", "doc.md")).toEqual({
			diagrams: 0,
			findings: [],
		});
	});
});
