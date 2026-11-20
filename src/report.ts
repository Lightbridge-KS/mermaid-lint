/** The two output contracts: the text report and the JSON object. */
import type { Finding, LintResult } from "./types.js";

export type Format = "text" | "json";

/** Version of the JSON shape. Raise it when a key is removed or renamed. */
const SCHEMA = 1;

export function render(result: LintResult, format: Format): string {
	return format === "json" ? renderJson(result) : renderText(result);
}

function renderText(result: LintResult): string {
	const { findings, diagrams, files, mermaidVersion } = result;
	const scope = `${count(diagrams, "diagram")}, ${count(files, "file")} (mermaid ${mermaidVersion})`;
	if (findings.length === 0) return `ok: ${scope}\n`;

	const blocks = findings.map(renderFinding);
	const failed = new Set(findings.map((f) => `${f.file}\0${f.block}`)).size;
	const summary = `${count(findings.length, "error")} in ${failed} of ${scope}`;
	return `${blocks.join("\n\n")}\n\n${summary}\n`;
}

function renderFinding(finding: Finding): string {
	const { file, line, column, rule, diagramType, message, excerpt, hint } =
		finding;
	const position = column === null ? `${line}` : `${line}:${column}`;
	const subject = diagramType ? `${diagramType}: ` : "";
	const lines = [`${file}:${position}: error[${rule}] ${subject}${message}`];
	if (excerpt !== null) lines.push(`  ${line} | ${excerpt}`);
	if (hint !== null) lines.push(`  hint: ${hint}`);
	return lines.join("\n");
}

function renderJson(result: LintResult): string {
	const payload = {
		schema: SCHEMA,
		mermaid_version: result.mermaidVersion,
		summary: {
			files: result.files,
			diagrams: result.diagrams,
			errors: result.findings.length,
		},
		findings: result.findings.map((finding) => ({
			file: finding.file,
			line: finding.line,
			column: finding.column,
			block: finding.block,
			diagram_type: finding.diagramType,
			rule: finding.rule,
			message: finding.message,
			hint: finding.hint,
			excerpt: finding.excerpt,
		})),
	};
	return `${JSON.stringify(payload, null, 2)}\n`;
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
