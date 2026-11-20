/**
 * The only module that knows upstream Mermaid.
 *
 * It hides three things: the DOM shim the parser needs, the shapes of the errors
 * the parser throws, and the difference between the lines the parser reports and
 * the lines of the diagram source.
 */
import { createRequire } from "node:module";
import { decodeEntities, parsedText, sourcePosition } from "./line-map.js";
import type { Failure } from "./types.js";

interface GrammarHash {
	text?: string;
	token?: string | number | null;
	loc?: { last_line: number; last_column: number };
	expected?: string[];
}

interface StructuredIssue {
	line: number;
	column: number;
	message: string;
	tokenName: string | null;
	image: string | null;
}

interface LexerIssue {
	line: number;
	column: number;
	length?: number;
	message: string;
}

interface Runtime {
	parse(text: string): Promise<unknown>;
	detectType(text: string): string;
	close(): Promise<void>;
}

let runtime: Promise<Runtime> | undefined;

/** Version of the pinned `mermaid` package, read from the installed package. */
export function mermaidVersion(): string {
	const require = createRequire(import.meta.url);
	return (require("mermaid/package.json") as { version: string }).version;
}

/** Returns null when the pinned parser accepts `source`, else why it does not. */
export async function check(source: string): Promise<Failure | null> {
	runtime ??= start();
	const mermaid = await runtime;
	try {
		await mermaid.parse(source);
		return null;
	} catch (error) {
		return normalize(error, source, detect(mermaid, source));
	}
}

/** Releases the DOM shim so that the process can end. Safe to call when unused. */
export async function dispose(): Promise<void> {
	if (!runtime) return;
	const started = await runtime;
	runtime = undefined;
	await started.close();
}

/**
 * Mermaid's parser reads `window` and `document` at import time (through
 * DOMPurify), so the shim must be on `globalThis` before the import.
 */
async function start(): Promise<Runtime> {
	const { Window } = await import("happy-dom");
	const window = new Window();
	Object.assign(globalThis, { window, document: window.document });
	const { default: mermaid } = await import("mermaid");
	mermaid.initialize({ startOnLoad: false });
	return {
		parse: (text) => mermaid.parse(text),
		detectType: (text) => mermaid.detectType(text),
		close: () => window.happyDOM.close(),
	};
}

function detect(mermaid: Runtime, source: string): string | null {
	try {
		return mermaid.detectType(source);
	} catch {
		return null;
	}
}

/** Maps the five upstream error shapes to one `Failure`. */
function normalize(
	error: unknown,
	source: string,
	diagramType: string | null,
): Failure {
	const message = error instanceof Error ? error.message : String(error);
	const name = error instanceof Error ? error.name : "";
	// The parser counts lines and columns in a shorter text than `source`; see
	// `line-map.ts`.
	const parsed = parsedText(source, diagramType);
	const toSource = (parserLine: number) =>
		sourcePosition(parsed, parserLine).line;
	const base = {
		diagramType,
		unexpected: null,
		found: null,
		expected: [],
		detail: firstLine(message),
	};

	if (name === "UnknownDiagramError") {
		return {
			...base,
			rule: "unknown-diagram",
			line: toSource(1),
			column: null,
			diagramType: null,
		};
	}

	const hash = (error as { hash?: GrammarHash }).hash;
	const grammar = /^Parse error on line (\d+):/.exec(message);
	if (hash && grammar) {
		const found = hash.text ? decodeEntities(hash.text) : null;
		const place = locate(Number(grammar[1]), hash, parsed.text.split("\n"));
		const after =
			place.column === null
				? null
				: sourcePosition(parsed, place.line, place.column);
		return {
			...base,
			rule: "syntax",
			line: after?.line ?? toSource(place.line),
			column: after
				? refine(lineAt(parsed.source, after.line), after.column, found)
				: null,
			// The end-of-input token is the number 1, not a name.
			unexpected: hash.token == null ? null : String(hash.token),
			found,
			expected: (hash.expected ?? []).map(unquote),
		};
	}

	const lexical = /^Lexical error on line (\d+)\./.exec(message);
	if (lexical) {
		return {
			...base,
			rule: "syntax",
			line: toSource(Number(lexical[1])),
			column: null,
		};
	}

	const issue = earliest(error, parsed.text.split("\n"));
	if (issue) {
		return {
			...base,
			rule: "syntax",
			...sourcePosition(parsed, issue.line, issue.column),
			unexpected: issue.tokenName,
			found: issue.image === null ? null : decodeEntities(issue.image),
			expected: expectedFrom(issue.message),
			detail: firstLine(issue.message),
		};
	}

	if ((error as { result?: unknown }).result) {
		// A structured parse error with no placed issue is still the grammar
		// rejecting the text. The only position known is the end of the text.
		return {
			...base,
			rule: "syntax",
			line: toSource(parsed.text.split("\n").length),
			column: null,
		};
	}

	return {
		...base,
		// A plain `Error` is the diagram builder rejecting the text. Any other
		// class (`TypeError`, ...) is a defect in the parser itself.
		rule: name === "Error" ? "semantic" : "parser-crash",
		line: toSource(1),
		column: null,
	};
}

/**
 * Where a grammar error is, in parser coordinates.
 *
 * `hash.loc` is the last accepted token, so the rejected text starts at
 * `loc.last_column`. The line comes from the message. After a token that spans
 * lines the parser can report a line that is too small; the sign is a column
 * past the end of that line. The rejected text is then searched for at that
 * column on the lines below. Without a match the column is unknown.
 */
function locate(
	messageLine: number,
	hash: GrammarHash,
	parsedLines: string[],
): { line: number; column: number | null } {
	if (hash.loc?.last_line !== messageLine) {
		return { line: messageLine, column: null };
	}
	const index = hash.loc.last_column;
	if (index <= (parsedLines[messageLine - 1] ?? "").length) {
		return { line: messageLine, column: index + 1 };
	}
	const rejected = (hash.text ?? "").split("\n")[0] ?? "";
	if (rejected.trim() !== "") {
		for (let line = messageLine + 1; line <= parsedLines.length; line++) {
			// A quoted string is rejected as its content, so a quote can come first.
			const near = (parsedLines[line - 1] ?? "").slice(
				index,
				index + rejected.length + 4,
			);
			if (near.includes(rejected)) {
				return { line, column: index + 1 };
			}
		}
	}
	return { line: messageLine, column: null };
}

/**
 * The first issue, in reading order, of a structured (Langium) parse error.
 * `parsedLines` are the lines of the text the parser read.
 */
function earliest(
	error: unknown,
	parsedLines: string[],
): StructuredIssue | null {
	const result = (
		error as {
			result?: {
				lexerErrors?: LexerIssue[];
				parserErrors?: {
					message: string;
					token?: {
						image?: string;
						startLine?: number;
						startColumn?: number;
						tokenType?: { name?: string };
					};
				}[];
			};
		}
	).result;
	if (!result) return null;

	const issues: StructuredIssue[] = [];
	for (const lexer of result.lexerErrors ?? []) {
		issues.push({
			line: lexer.line,
			column: lexer.column,
			message: lexer.message,
			tokenName: null,
			image: skipped(lexer, parsedLines),
		});
	}
	for (const parser of result.parserErrors ?? []) {
		const { startLine, startColumn } = parser.token ?? {};
		// The end-of-input token has the position -1; it cannot be placed.
		if (!(Number(startLine) >= 1 && Number(startColumn) >= 1)) continue;
		issues.push({
			line: startLine as number,
			column: startColumn as number,
			message: parser.message,
			tokenName: parser.token?.tokenType?.name ?? null,
			image: parser.token?.image ?? null,
		});
	}
	issues.sort((a, b) => a.line - b.line || a.column - b.column);
	return issues[0] ?? null;
}

/** The text a structured lexer error skipped, or the one character it names. */
function skipped(issue: LexerIssue, parsedLines: string[]): string | null {
	const line = parsedLines[issue.line - 1] ?? "";
	const text = line.slice(
		issue.column - 1,
		issue.column - 1 + (issue.length ?? 1),
	);
	if (text.trim() !== "") return text;
	return /unexpected character: ->(.*?)<-/.exec(issue.message)?.[1] ?? null;
}

function expectedFrom(message: string): string[] {
	const single = /Expecting token of type '([^']+)'/.exec(message);
	if (single?.[1]) return [single[1]];
	return [...message.matchAll(/^\s*\d+\. \[([^\]]+)\]/gm)].flatMap((match) =>
		(match[1] ?? "").split(",").map((token) => token.trim()),
	);
}

/**
 * Moves a column from "just after the last accepted token" to the start of the
 * rejected text: skips spaces, then prefers the nearest match of `found`.
 */
function refine(
	lineText: string,
	column: number,
	found: string | null,
): number {
	let index = Math.min(column - 1, lineText.length);
	while (lineText[index] === " " || lineText[index] === "\t") index++;
	if (found && !lineText.startsWith(found, index)) {
		const near = lineText.indexOf(
			found,
			Math.max(0, column - 1 - found.length),
		);
		if (near !== -1) index = near;
	}
	return index + 1;
}

function lineAt(source: string, line: number): string {
	return source.split("\n")[line - 1] ?? "";
}

function firstLine(text: string): string {
	return (text.split("\n")[0] ?? "").trim();
}

function unquote(token: string): string {
	return token.replace(/^'(.*)'$/, "$1");
}
