import { describe, expect, test } from "vitest";
import { decodeEntities, parsedText, sourcePosition } from "../src/line-map.js";

describe("the text that the parser reads", () => {
	test("a named entity grows by two characters, a numeric one by three", () => {
		const parsed = parsedText("pie\n  a#quot;b#59;c\n", "pie");
		expect(parsed.text).toBe("pie\n  aﬂ°quot¶ßbﬂ°°59¶ßc\n");
		expect(decodeEntities(parsed.text)).toBe("pie\n  a#quot;b#59;c\n");
	});

	test("the semicolon after a colour in a style line is removed, not read as an entity", () => {
		const parsed = parsedText(
			"flowchart TD\n  style A fill:#f9f; x\n",
			"flowchart-v2",
		);
		expect(parsed.text).toBe("flowchart TD\n  style A fill:#f9f x\n");
	});

	test("frontmatter, a directive, comment lines and leading blank lines are removed", () => {
		const source =
			'---\ntitle: T\n---\n%%{init: {"theme":"dark"}}%%\n\n%% note\npie\n  "a" : 1\n';
		expect(parsedText(source, "pie").text).toBe('pie\n  "a" : 1\n');
	});
});

describe("a parser position becomes a source position", () => {
	test("after entities on the same line", () => {
		const source = "pie\n  a#quot;b#59;c\n";
		const parsed = parsedText(source, "pie");
		// `c` is at column 20 of the parsed line and at column 15 of the source line.
		expect(parsed.text.split("\n")[1]?.indexOf("c")).toBe(19);
		expect(sourcePosition(parsed, 2, 20)).toEqual({ line: 2, column: 15 });
	});

	test("after a removed semicolon in a style line", () => {
		const parsed = parsedText(
			"flowchart TD\n  style A fill:#f9f; x\n",
			"flowchart-v2",
		);
		expect(sourcePosition(parsed, 2, 20)).toEqual({ line: 2, column: 21 });
	});

	test("a column past the end of its line stays on that line", () => {
		const parsed = parsedText("pie\n  ab\n  cd\n", "pie");
		expect(sourcePosition(parsed, 2, 99)).toEqual({ line: 2, column: 5 });
	});

	test("a line past the end is the position after the last character", () => {
		const parsed = parsedText("pie\n  ab", "pie");
		expect(sourcePosition(parsed, 9)).toEqual({ line: 2, column: 5 });
	});
});
