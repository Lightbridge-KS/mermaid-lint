/**
 * Turns a parser failure into words a reader can act on.
 *
 * Two layers. The glossary renames every raw parser token, so every grammar error
 * gets a readable message. The curated hints add one concrete fix for the common
 * causes. A hint never changes a verdict.
 */
import type { Failure } from "./types.js";

export interface Explanation {
	message: string;
	hint: string | null;
}

/** Longest list of expected items that a message shows. */
const MAX_EXPECTED = 5;

/** Raw token names that mean "the diagram text ends here". */
const END_OF_DIAGRAM = new Set(["1", "EOF", "EOF_IN_STRUCT"]);
const END_OF_LINE = new Set(["NEWLINE", "NL"]);

/** Expected tokens that tell a reader nothing; a message leaves them out. */
const NOISE = new Set([
	"SPACE",
	"INVALID",
	"TAGSTART",
	"TAGEND",
	"TESTSTR",
	"acc_title",
	"acc_descr",
	"acc_descr_multiline_value",
	"legacy_title",
]);

/** Raw token name to the real characters or a plain name. */
const GLOSSARY: Record<string, string> = {
	// Shared
	SPACE: "a space",
	NEWLINE: "the end of the line",
	NL: "the end of the line",
	EOF: "the end of the diagram",
	"1": "the end of the diagram",
	SEMI: '";"',
	COLON: '":"',
	COMMA: '","',
	MINUS: '"-"',
	AMP: '"&"',
	MULT: '"*"',
	BRKT: '"#"',
	PIPE: '"|"',
	NUM: "a number",
	STR: "a quoted string",
	STRING: "a quoted string",
	TEXT: "text",
	UNICODE_TEXT: "text",
	ALPHA: "a name",
	ID: "a name",
	// Flowchart
	SQS: '"["',
	SQE: '"]"',
	PS: '"("',
	PE: '")"',
	DIAMOND_START: '"{"',
	DIAMOND_STOP: '"}"',
	DOUBLECIRCLEEND: '"))"',
	STADIUMEND: '"])"',
	SUBROUTINEEND: '"]]"',
	CYLINDEREND: '")]"',
	TRAPEND: '"\\]"',
	INVTRAPEND: '"/]"',
	"-)": '"-)"',
	MD_STR: "a Markdown string",
	NODE_STRING: "a node name",
	LINK: 'an arrow such as "-->"',
	START_LINK: 'the start of an arrow such as "--"',
	LINK_ID: "an edge id",
	EDGE_TEXT: "edge text",
	DOWN: '"v"',
	DEFAULT: '"default"',
	CALLBACKNAME: "a function name",
	CALLBACKARGS: "function arguments",
	CLASS: '"class"',
	CLASSDEF: '"classDef"',
	CLICK: '"click"',
	STYLE: '"style"',
	LINKSTYLE: '"linkStyle"',
	// Sequence
	ACTOR: "a participant name",
	TXT: 'a colon and text (": text")',
	participant_actor: '"actor"',
	par_over: '"par over"',
	// Class
	LABEL: 'a label (": text")',
	STRUCT_STOP: '"}"',
	MEMBER: "a class member",
	EOF_IN_STRUCT: "the end of the diagram",
	BQUOTE_STR: "a name in backquotes",
	// State
	DESCR: 'a description (": text")',
	STATE_DESCR: "a state description",
	COMPOSIT_STATE: "a state name",
	EDGE_STATE: '"[*]"',
	CONCURRENT: '"--"',
	STYLE_SEPARATOR: '":::"',
	HIDE_EMPTY: '"hide empty description"',
	// Pie
	NUMBER_PIE: "a number",
};

const SEQUENCE_ARROW = /ARROW|CROSS|POINT/;
const CLASS_RELATION =
	/^(LINE|DOTTED_LINE|AGGREGATION|EXTENSION|COMPOSITION|DEPENDENCY|LOLLIPOP)$/;

/** Tokens that close a flowchart label; expecting one means "inside a label". */
const LABEL_CLOSERS = ["SQE", "PE", "DIAMOND_STOP"];

/** Every flowchart token that closes a node shape. */
const SHAPE_CLOSERS = new Set([
	"SQE",
	"PE",
	"DIAMOND_STOP",
	"DOUBLECIRCLEEND",
	"STADIUMEND",
	"SUBROUTINEEND",
	"CYLINDEREND",
	"TRAPEND",
	"INVTRAPEND",
]);

/**
 * Explains `failure` in plain words.
 *
 * @param failure - What the parser rejected.
 * @param sourceLine - The diagram line that the failure points at.
 */
export function explain(failure: Failure, sourceLine: string): Explanation {
	return {
		message: describe(failure, sourceLine),
		hint: hintFor(failure, sourceLine),
	};
}

function describe(failure: Failure, sourceLine: string): string {
	const { rule, detail } = failure;
	if (rule === "unknown-diagram") {
		return `no diagram type matches the first line "${sourceLine.trim()}"`;
	}
	if (rule === "semantic") {
		return `${detail.replace(/\.$/, "")} (the parser gives no position; this is the first line of the diagram)`;
	}
	if (rule === "parser-crash") {
		return `the Mermaid parser failed on this diagram (${detail}); the diagram is probably invalid, but the parser gives no position, so this is the first line of the diagram`;
	}

	const token = failure.unexpected;
	const inLabel = insideFlowchartLabel(failure);
	if (token !== null && END_OF_DIAGRAM.has(token)) {
		if (inLabel) return "the diagram ends inside a label";
		return withExpected("the diagram ends too early", failure);
	}
	if (token !== null && END_OF_LINE.has(token)) {
		return withExpected("the line ends too early", failure);
	}
	const got = unexpected(failure);
	if (!got) return "the parser cannot read part of this line";
	// A wrong closing bracket is clearer with the list of the right ones.
	if (inLabel && !(token !== null && SHAPE_CLOSERS.has(token))) {
		return `unexpected ${got} inside a label`;
	}
	return withExpected(`unexpected ${got}`, failure);
}

function withExpected(start: string, failure: Failure): string {
	const wanted = expected(failure);
	return wanted ? `${start}; expected ${wanted}` : start;
}

/** Words for the rejected text, or null when the parser names none (lexical error). */
function unexpected(failure: Failure): string | null {
	const { unexpected: token, found } = failure;
	// Show the text itself when it is short and on one line.
	if (
		found &&
		!found.includes("\n") &&
		found.trim() !== "" &&
		found.length <= 30
	) {
		return `"${found}"`;
	}
	return token === null ? null : readable(token);
}

/**
 * Words for the expected tokens: renamed, without noise, without repeats. A list
 * longer than `MAX_EXPECTED` is left out, because it does not say what to fix.
 */
function expected(failure: Failure): string | null {
	const words = [
		...new Set(
			failure.expected
				.filter((token) => !NOISE.has(token))
				.map((token) => readable(token)),
		),
	];
	if (words.length === 0 || words.length > MAX_EXPECTED) return null;
	return joinOr(words);
}

/** True when the parser was reading a flowchart label and expected its end. */
function insideFlowchartLabel(failure: Failure): boolean {
	return (
		family(failure.diagramType) === "flowchart" &&
		LABEL_CLOSERS.some((closer) => failure.expected.includes(closer))
	);
}

function readable(token: string): string {
	if (SEQUENCE_ARROW.test(token)) return 'a message arrow such as "->>"';
	if (CLASS_RELATION.test(token)) return 'a relation such as "<|--"';
	// A token the glossary does not know is shown as the parser names it.
	return GLOSSARY[token] ?? `"${token}"`;
}

function joinOr(words: string[]): string {
	if (words.length <= 1) return words.join("");
	return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** The curated hints. The first rule that matches gives the hint. */
function hintFor(failure: Failure, sourceLine: string): string | null {
	if (failure.rule === "unknown-diagram") {
		return "start the diagram with its type, for example flowchart TD, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram or pie";
	}
	if (failure.rule !== "syntax") return null;

	const context: HintContext = {
		token: failure.unexpected,
		wanted: failure.expected,
		line: sourceLine,
		lexical: failure.unexpected === null && failure.found === null,
		ends: failure.unexpected !== null && END_OF_DIAGRAM.has(failure.unexpected),
		lineEnds:
			failure.unexpected !== null && END_OF_LINE.has(failure.unexpected),
		inLabel: insideFlowchartLabel(failure),
	};
	switch (family(failure.diagramType)) {
		case "flowchart":
			return flowchartHint(context);
		case "sequence":
			return sequenceHint(context);
		case "state":
			return stateHint(context);
		case "class":
			return classHint(context);
		case "pie":
			return pieHint(context);
		default:
			return null;
	}
}

interface HintContext {
	/** Raw name of the rejected token, or null. */
	token: string | null;
	/** Raw names of the expected tokens. */
	wanted: string[];
	/** The diagram line that the failure points at. */
	line: string;
	/** The lexer rejected the text and named no token. */
	lexical: boolean;
	/** The diagram text ended where more was expected. */
	ends: boolean;
	/** The line ended where more was expected. */
	lineEnds: boolean;
	inLabel: boolean;
}

function flowchartHint(c: HintContext): string | null {
	if (c.inLabel && c.ends) {
		return "a label above this line is not closed; add its closing bracket or its closing quote";
	}
	if (
		c.inLabel &&
		(c.token === "PS" || c.token === "SQS" || c.token === "DIAMOND_START")
	) {
		return 'brackets inside a label need quotes; put the label text in double quotes: A["text (more)"] for a node, -->|"text (more)"| for an edge';
	}
	if (c.token === "STR" || c.token === "MD_STR") {
		return "a double quote inside a label ends the label; put the whole label in one pair of double quotes and write #quot; for each quote inside it";
	}
	if (c.token !== null && SHAPE_CLOSERS.has(c.token)) {
		return c.wanted.includes("STR")
			? "a label cannot be empty; write text inside the brackets or remove them"
			: "the closing bracket does not match the opening bracket of this node";
	}
	if (c.token === "MINUS" && /(^|[^-<.=])->(?!>)/.test(c.line)) {
		return '"->" is not a flowchart arrow; use "-->"';
	}
	if (c.token === "end") {
		return 'this "end" closes no subgraph; remove it or add the "subgraph" line above. A node named "end" must be written "End" or "END"';
	}
	if (c.token === "NODE_STRING" && c.wanted.includes("LINK")) {
		const keyword = /^\s*(title|note)\b/i.exec(c.line)?.[1]?.toLowerCase();
		if (keyword === "title") {
			return 'a flowchart has no "title" line; set the title in frontmatter before the diagram (---, title: My title, ---)';
		}
		if (keyword === "note") {
			return 'a flowchart has no "note" line; use a node for the text';
		}
		return 'two names in a row need an arrow between them, for example "A --> B"';
	}
	if (c.lexical && /^\s*(flowchart|graph)\b/.test(c.line)) {
		return 'the direction after "flowchart" must be TB, TD, BT, RL or LR';
	}
	if (c.lexical && c.line.includes('"`')) {
		return 'a label that starts with "` is a Markdown string and must end with `"; remove the backticks, or put the whole label text between them';
	}
	if (c.lexical && !c.line.includes('"')) {
		return "a label on this line has text the parser cannot read; put the label text in double quotes";
	}
	return null;
}

function sequenceHint(c: HintContext): string | null {
	if (c.token === "else") {
		return '"else" belongs to an "alt" block (alt ... else ... end); inside "critical" use "option"';
	}
	if (c.token === "and") {
		return '"and" belongs to a "par" block (par ... and ... end)';
	}
	if (c.token === "option") {
		return '"option" belongs to a "critical" block (critical ... option ... end)';
	}
	if (c.token === "end") {
		return 'this "end" closes no block; remove it, or add the block start above (alt, opt, loop, par, critical, break, rect or box)';
	}
	if (c.lineEnds && c.wanted.includes("TXT")) {
		return 'the text after a colon is missing; write "A->>B: text" or "Note right of A: text"';
	}
	if (c.lineEnds && c.line.includes(";")) {
		return 'a ";" ends a statement in a sequence diagram; write #59; for a semicolon in text';
	}
	if (
		c.wanted.includes("end") &&
		c.wanted.includes("participant") &&
		c.wanted.length <= 6
	) {
		return 'a "box" holds only participant lines; close it with "end" before the first message or note';
	}
	if (c.token === "INVALID") {
		return 'use a sequence arrow such as "->>", "-->>", "->", "-->", "-x" or "-)"';
	}
	if (c.ends && c.wanted.includes("end")) {
		return 'a block is not closed; add "end"';
	}
	return null;
}

function stateHint(c: HintContext): string | null {
	if (/^\s*-{3,}\s*$/.test(c.line)) {
		return 'to separate concurrent regions inside a state, use a line with "--" (two hyphens)';
	}
	if (c.token === "INVALID" && /(^|[^-])->/.test(c.line)) {
		return 'use "-->" for a transition';
	}
	if (c.lexical && /^\s*note\b/i.test(c.line)) {
		return 'the text after a colon is missing; write "note right of A: text"';
	}
	if (c.ends && c.wanted.includes("STRUCT_STOP")) {
		return 'a state block is not closed; add "}"';
	}
	return null;
}

function classHint(c: HintContext): string | null {
	if (c.ends && c.wanted.includes("STRUCT_STOP")) {
		return 'a class body is not closed; add "}"';
	}
	if (c.wanted.includes("LINE") && c.wanted.includes("DOTTED_LINE")) {
		return 'use a class relation such as "<|--", "*--", "o--", "-->", "..>" or "--"';
	}
	return null;
}

function pieHint(c: HintContext): string | null {
	// The first line is the header, not a slice.
	if (/^\s*pie/.test(c.line)) return null;
	return 'write each slice as "Label" : number, with the label in double quotes';
}

/** Groups the parser's diagram type ids, e.g. `flowchart-v2` and `graph`. */
function family(diagramType: string | null): string | null {
	if (diagramType === null) return null;
	if (/^(flowchart|graph)/.test(diagramType)) return "flowchart";
	if (/^stateDiagram/.test(diagramType)) return "state";
	if (/^class/.test(diagramType)) return "class";
	return diagramType;
}
