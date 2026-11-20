/** The pipeline for one text: find the diagrams, check each, report in file coordinates. */
import { check } from "./engine.js";
import { type Block, extract } from "./extract.js";
import { explain } from "./hints.js";
import type { FileResult, Finding, Kind } from "./types.js";

/**
 * Lints one text.
 *
 * @param text - The file content.
 * @param kind - `"mmd"` for one bare diagram, `"md"` for Markdown with fences.
 * @param file - The name to report; this function does not read it.
 */
export async function lint(
	text: string,
	kind: Kind,
	file: string,
): Promise<FileResult> {
	const fileLines = text.split(/\r\n?|\n/);
	const blocks: Block[] =
		kind === "md"
			? extract(text)
			: [{ source: text, fenceLine: 1, startLine: 1, indent: 0, closed: true }];

	const findings: Finding[] = [];
	for (const [index, block] of blocks.entries()) {
		const finding = await lintBlock(block, fileLines);
		if (finding) findings.push({ file, block: index + 1, ...finding });
	}
	return { diagrams: blocks.length, findings };
}

type BlockFinding = Omit<Finding, "file" | "block">;

/** Longest source line that a finding shows in full. */
const MAX_EXCERPT = 160;

async function lintBlock(
	block: Block,
	fileLines: string[],
): Promise<BlockFinding | null> {
	const atFence = {
		line: block.fenceLine,
		column: block.indent + 1,
		diagramType: null,
		excerpt: fileLines[block.fenceLine - 1] ?? null,
	};
	if (!block.closed) {
		return {
			...atFence,
			rule: "unclosed-fence",
			message: "this mermaid fence has no closing fence",
			hint: "add a line with the same fence characters after the diagram",
		};
	}
	if (block.source.trim() === "") {
		return {
			...atFence,
			rule: "empty-block",
			message: "this mermaid block is empty",
			hint: "write a diagram, or remove the block",
		};
	}

	const failure = await check(block.source);
	if (!failure) return null;

	const line = block.startLine + failure.line - 1;
	const fileLine = fileLines[line - 1] ?? null;
	const sourceLine = block.source.split(/\r\n?|\n/)[failure.line - 1] ?? "";
	const column =
		failure.column === null
			? null
			: failure.column + prefixWidth(fileLine, sourceLine, block.indent);
	return {
		line,
		column,
		diagramType: failure.diagramType,
		rule: failure.rule,
		excerpt: fileLine === null ? null : window(fileLine, column),
		...explain(failure, sourceLine),
	};
}

/**
 * Returns `line`, or a part of it around `column` when the line is long. A long
 * line would cost the reader more than it tells.
 */
function window(line: string, column: number | null): string {
	if (line.length <= MAX_EXCERPT) return line;
	const centre = (column ?? 1) - 1;
	const start = Math.max(
		0,
		Math.min(centre - MAX_EXCERPT / 2, line.length - MAX_EXCERPT),
	);
	const end = start + MAX_EXCERPT;
	return `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
}

/**
 * Number of characters the Markdown container puts before a diagram line: the
 * fence indent, a list indent, or a block-quote marker.
 */
function prefixWidth(
	fileLine: string | null,
	sourceLine: string,
	fenceIndent: number,
): number {
	if (fileLine?.endsWith(sourceLine))
		return fileLine.length - sourceLine.length;
	return fenceIndent;
}
