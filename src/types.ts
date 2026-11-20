/** Stable rule names. A change here is a contract change (see the design doc). */
export const RULES = [
	"syntax",
	"unknown-diagram",
	"semantic",
	"parser-crash",
	"empty-block",
	"unclosed-fence",
] as const;

export type Rule = (typeof RULES)[number];

/** How a text is read: Markdown with Mermaid fences, or one bare diagram. */
export type Kind = "md" | "mmd";

/** One rejected diagram, in the coordinates of the diagram source. */
export interface Failure {
	rule: Rule;
	/** 1-based line in the diagram source. */
	line: number;
	/** 1-based column, or null when the parser gives none. */
	column: number | null;
	diagramType: string | null;
	/** Raw parser name of the token that was not expected, e.g. `PS`. */
	unexpected: string | null;
	/** The text that was not expected, e.g. `(`. */
	found: string | null;
	/** Raw parser names of the tokens that were expected. */
	expected: string[];
	/** First line of the upstream message; the fallback when no better words exist. */
	detail: string;
}

/** One reported problem, in the coordinates of the file the user edits. */
export interface Finding {
	file: string;
	line: number;
	column: number | null;
	/** 1-based index of the Mermaid block in the file. */
	block: number;
	diagramType: string | null;
	rule: Rule;
	message: string;
	hint: string | null;
	/** The source line at `line`. */
	excerpt: string | null;
}

export interface FileResult {
	diagrams: number;
	findings: Finding[];
}

export interface LintResult {
	files: number;
	diagrams: number;
	findings: Finding[];
	mermaidVersion: string;
}
