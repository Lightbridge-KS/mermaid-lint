import { expect, test } from "vitest";
import { extract } from "../src/extract.js";

const fence = "```";

test("a block reports its source and its position in the file", () => {
	const blocks = extract(
		`# Title\n\n${fence}mermaid\nflowchart TD\n  A --> B\n${fence}\n`,
	);
	expect(blocks).toEqual([
		{
			source: "flowchart TD\n  A --> B",
			fenceLine: 3,
			startLine: 4,
			indent: 0,
			closed: true,
		},
	]);
});

test("other languages and plain fences are not Mermaid blocks", () => {
	const markdown = `${fence}js\nlet a;\n${fence}\n\n${fence}\nflowchart TD\n${fence}\n`;
	expect(extract(markdown)).toEqual([]);
});

test.each([
	["mermaid"],
	["Mermaid"],
	["mermaid title=x"],
	["{mermaid}"],
	["{mermaid fig-width=6}"],
])("the info string %j marks a Mermaid block", (info) => {
	expect(extract(`${fence}${info}\npie\n${fence}\n`)).toHaveLength(1);
});

test.each([["mermaidx"], ["mmd"], ["{.mermaid}"]])(
	"the info string %j does not mark a Mermaid block",
	(info) => {
		expect(extract(`${fence}${info}\npie\n${fence}\n`)).toEqual([]);
	},
);

test("tilde fences and long fences work", () => {
	const blocks = extract("~~~mermaid\npie\n~~~\n\n`````mermaid\npie\n`````\n");
	expect(blocks.map((b) => [b.fenceLine, b.closed])).toEqual([
		[1, true],
		[5, true],
	]);
});

test("a fence shown inside a longer fence is an example, not a block", () => {
	const markdown = `\`\`\`\`markdown\n${fence}mermaid\npie\n${fence}\n\`\`\`\`\n`;
	expect(extract(markdown)).toEqual([]);
});

test("a block in a list item has the list indent removed from its source", () => {
	const markdown = `1. Step\n\n   ${fence}mermaid\n   flowchart TD\n     A --> B\n   ${fence}\n`;
	expect(extract(markdown)).toEqual([
		{
			source: "flowchart TD\n  A --> B",
			fenceLine: 3,
			startLine: 4,
			indent: 3,
			closed: true,
		},
	]);
});

test("a block in a block quote has the quote marker removed from its source", () => {
	const markdown = `> ${fence}mermaid\n> pie\n>   "A" : 1\n> ${fence}\n`;
	expect(extract(markdown)).toEqual([
		{
			source: 'pie\n  "A" : 1',
			fenceLine: 1,
			startLine: 2,
			indent: 2,
			closed: true,
		},
	]);
});

test("CRLF line ends give the same positions", () => {
	const blocks = extract(`# T\r\n\r\n${fence}mermaid\r\npie\r\n${fence}\r\n`);
	expect(blocks).toMatchObject([{ fenceLine: 3, startLine: 4, closed: true }]);
});

test.each([
	["at the end of the file", `${fence}mermaid\npie\n`],
	["with only the opening fence", `${fence}mermaid`],
	["closed by a shorter fence", `\`\`\`\`mermaid\npie\n${fence}\n`],
	[
		"whose last line only ends with fence characters",
		`${fence}mermaid\npie ${fence}`,
	],
])("a fence %s is not closed", (_name, markdown) => {
	expect(extract(markdown)).toMatchObject([{ closed: false }]);
});
