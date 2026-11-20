/**
 * Maps a position the Mermaid parser reports to a position in the diagram source.
 *
 * Before it parses, Mermaid removes the frontmatter, directives, comment lines and
 * leading white space, and rewrites each entity such as `#quot;` to a longer
 * placeholder. The parser therefore counts lines and columns in a different text.
 * This module repeats those changes and remembers where each character of the
 * parsed text came from.
 *
 * The removal rules are ported from mermaid 12.3.0: `preprocessDiagram`,
 * `matchFrontMatter`, `removeDirectives`, `cleanupComments` and `encodeEntities`. Mermaid is
 * Copyright (c) 2014 - 2022 Knut Sveidqvist, under the MIT licence; the full
 * notice is in `THIRD_PARTY_NOTICES.md`. The rules can change in a Mermaid
 * upgrade; the line-map tests compare this module with the parser's own reports.
 */

/** The text the parser reads, with the source offset of each character. */
export interface ParsedText {
	text: string;
	/** `origin[i]` is the index in `source` of `text[i]`. */
	origin: number[];
	/** The diagram source with line ends normalised to `\n`. */
	source: string;
}

/** A 1-based position in the diagram source. */
export interface SourcePosition {
	line: number;
	column: number;
}

/** Diagram types whose parser reads the text with comment lines kept. */
const KEEPS_COMMENTS = new Set(["agentflow", "eventmodeling"]);

const DIRECTIVE =
	/%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const COMMENT_LINE = /^\s*%%(?!{)[^\n]+\n?/gm;

/** Builds the text that the parser reads for `source`. */
export function parsedText(
	source: string,
	diagramType: string | null,
): ParsedText {
	const text = source.replace(/\r\n?/g, "\n");
	const origin = Array.from({ length: text.length }, (_, index) => index);

	let parsed: ParsedText = { text, origin, source: text };
	parsed = remove(parsed, [[0, frontMatterLength(parsed.text)]]);
	parsed = remove(parsed, matches(parsed.text, DIRECTIVE));
	if (diagramType === null || !KEEPS_COMMENTS.has(diagramType)) {
		parsed = remove(parsed, matches(parsed.text, COMMENT_LINE));
		const leading = parsed.text.length - parsed.text.trimStart().length;
		parsed = remove(parsed, [[0, leading]]);
	}
	return encodeEntities(parsed);
}

/** Turns Mermaid's entity placeholders back into the entities of the source. */
export function decodeEntities(text: string): string {
	return text.replace(/ﬂ°°|ﬂ°/g, "#").replace(/¶ß/g, ";");
}

/**
 * Converts a 1-based parser position to a 1-based source position.
 *
 * @param parserColumn - Omit it to get the start of the parser line.
 */
export function sourcePosition(
	parsed: ParsedText,
	parserLine: number,
	parserColumn = 1,
): SourcePosition {
	const { text, origin, source } = parsed;
	if (origin.length === 0) return { line: 1, column: 1 };

	let lineStart = 0;
	for (let current = 1; current < parserLine; current++) {
		const newline = text.indexOf("\n", lineStart);
		if (newline === -1) {
			lineStart = text.length;
			break;
		}
		lineStart = newline + 1;
	}
	// A column can point at the line end, never into the next line.
	const lineEnd = text.indexOf("\n", lineStart);
	const index = Math.min(
		lineStart + Math.max(parserColumn, 1) - 1,
		lineEnd === -1 ? text.length : lineEnd,
	);
	// Past the end of the parsed text: the position after its last character.
	const offset =
		index < origin.length
			? (origin[index] ?? 0)
			: (origin[origin.length - 1] ?? 0) + 1;

	const before = source.slice(0, offset);
	const lastNewline = before.lastIndexOf("\n");
	return {
		line: before.split("\n").length,
		column: offset - lastNewline,
	};
}

type Range = [start: number, end: number];

function remove(parsed: ParsedText, ranges: Range[]): ParsedText {
	const kept = ranges.filter(([start, end]) => end > start);
	if (kept.length === 0) return parsed;

	let text = "";
	const origin: number[] = [];
	const keep = (from: number, to: number) => {
		text += parsed.text.slice(from, to);
		for (let index = from; index < to; index++) {
			origin.push(parsed.origin[index] ?? 0);
		}
	};
	let cursor = 0;
	for (const [start, end] of kept) {
		keep(cursor, start);
		cursor = end;
	}
	keep(cursor, parsed.text.length);
	return { text, origin, source: parsed.source };
}

/**
 * Port of Mermaid's `encodeEntities`. It drops the `;` that ends a `style` or
 * `classDef` line with a `#` colour, then rewrites `#name;` to a placeholder
 * that is one or two characters longer. Each placeholder character keeps the
 * source offset of the `#`, of its own character, or of the `;`.
 */
function encodeEntities(parsed: ParsedText): ParsedText {
	let current = parsed;
	for (const pattern of [/style.*:\S*#.*;/g, /classDef.*:\S*#.*;/g]) {
		current = remove(
			current,
			matches(current.text, pattern).map(([, end]) => [end - 1, end]),
		);
	}

	let text = "";
	const origin: number[] = [];
	let cursor = 0;
	const copy = (to: number) => {
		text += current.text.slice(cursor, to);
		for (let index = cursor; index < to; index++) {
			origin.push(current.origin[index] ?? 0);
		}
		cursor = to;
	};
	for (const [start, end] of matches(current.text, /#\w+;/g)) {
		copy(start);
		const inner = current.text.slice(start + 1, end - 1);
		const prefix = /^\+?\d+$/.test(inner) ? "ﬂ°°" : "ﬂ°";
		const hash = current.origin[start] ?? 0;
		const semicolon = current.origin[end - 1] ?? 0;
		text += prefix;
		for (let count = 0; count < prefix.length; count++) origin.push(hash);
		cursor = start + 1;
		copy(end - 1);
		text += "¶ß";
		origin.push(semicolon, semicolon);
		cursor = end;
	}
	if (cursor === 0) return current;
	copy(current.text.length);
	return { text, origin, source: current.source };
}

function matches(text: string, pattern: RegExp): Range[] {
	return [...text.matchAll(pattern)].map((match) => [
		match.index,
		match.index + match[0].length,
	]);
}

const isLineBreak = (char: string | undefined) =>
	char === "\n" || char === "\r";
const isWhitespace = (char: string | undefined) =>
	char !== undefined && /\s/.test(char);

/** Length of a leading YAML frontmatter block, or 0. Port of `matchFrontMatter`. */
function frontMatterLength(text: string): number {
	let cursor = 0;
	while (
		cursor < text.length &&
		isWhitespace(text[cursor]) &&
		!isLineBreak(text[cursor])
	) {
		cursor++;
	}
	const indent = text.slice(0, cursor);
	if (!text.startsWith("---", cursor)) return 0;

	const openingEnds: number[] = [];
	for (let i = cursor + 3; i < text.length && isWhitespace(text[i]); i++) {
		if (isLineBreak(text[i])) openingEnds.push(i);
	}
	const firstOpeningEnd = openingEnds[0];
	if (firstOpeningEnd === undefined) return 0;

	const closingFence = `${indent}---`;
	const closingEnd = (i: number) =>
		isLineBreak(text[i]) && text.startsWith(closingFence, i + 1)
			? lastLineBreakInWhitespaceRun(text, i + 1 + closingFence.length)
			: -1;

	let lastClosingFence = -1;
	for (let i = firstOpeningEnd + 1; i < text.length; i++) {
		if (closingEnd(i) !== -1) lastClosingFence = i;
	}
	if (lastClosingFence === -1) return 0;

	let openingEnd = firstOpeningEnd;
	for (const candidate of openingEnds) {
		if (candidate < lastClosingFence) openingEnd = candidate;
	}
	for (let i = openingEnd + 1; i <= lastClosingFence; i++) {
		const matchEnd = closingEnd(i);
		if (matchEnd !== -1) return matchEnd + 1;
	}
	return 0;
}

function lastLineBreakInWhitespaceRun(text: string, from: number): number {
	let index = -1;
	for (let i = from; i < text.length && isWhitespace(text[i]); i++) {
		if (isLineBreak(text[i])) index = i;
	}
	return index;
}
