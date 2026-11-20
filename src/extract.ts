/** Finds the Mermaid blocks of a Markdown text and where each one sits in the file. */
import { fromMarkdown } from "mdast-util-from-markdown";

/** One fenced Mermaid block. */
export interface Block {
	/** The diagram source: the lines between the fences, container prefixes removed. */
	source: string;
	/** 1-based file line of the opening fence. */
	fenceLine: number;
	/** 1-based file line of the first content line. */
	startLine: number;
	/** Number of characters before the fence on its line (indent or container prefix). */
	indent: number;
	/** False when the file ends, or the container ends, before a closing fence. */
	closed: boolean;
}

/** The part of a syntax-tree node that this module reads. */
interface Node {
	type: string;
	lang?: string | null;
	value?: string;
	children?: Node[];
	position?: {
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
}

/**
 * Returns the Mermaid blocks of `markdown`, in file order.
 *
 * A block is a fenced code block whose info string starts with `mermaid` or with
 * `{mermaid` (Quarto), compared without case.
 */
export function extract(markdown: string): Block[] {
	const fileLines = markdown.split(/\r\n?|\n/);
	const blocks: Block[] = [];

	const visit = (node: Node) => {
		if (node.type === "code" && isMermaid(node.lang) && node.position) {
			const { start, end } = node.position;
			blocks.push({
				source: node.value ?? "",
				fenceLine: start.line,
				startLine: start.line + 1,
				indent: start.column - 1,
				closed: isClosed(fileLines, start, end),
			});
		}
		for (const child of node.children ?? []) visit(child);
	};
	visit(fromMarkdown(markdown) as Node);
	return blocks;
}

function isMermaid(lang: string | null | undefined): boolean {
	return /^(mermaid$|\{mermaid\b)/i.test(lang ?? "");
}

/**
 * A fence is closed when the last line of the code node is a fence of the same
 * character that is at least as long as the opening fence.
 */
function isClosed(
	fileLines: string[],
	start: { line: number; column: number },
	end: { line: number },
): boolean {
	if (end.line === start.line) return false;
	const opening = (fileLines[start.line - 1] ?? "").slice(start.column - 1);
	const fence = /^(`{3,}|~{3,})/.exec(opening)?.[1];
	if (!fence) return false;
	const marker = fence[0] === "`" ? "`" : "~";
	// Before the fence a line may hold only a container prefix: list indent or ">".
	const closing = new RegExp(`^[\\s>]*\\${marker}{${fence.length},}\\s*$`);
	return closing.test(fileLines[end.line - 1] ?? "");
}
