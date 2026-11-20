#!/usr/bin/env node
/** Command line: arguments, paths, streams and exit codes. */
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { dispose, mermaidVersion } from "./engine.js";
import { lint } from "./lint.js";
import { render } from "./report.js";
import type { Finding, Kind } from "./types.js";

const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

const KIND_BY_EXTENSION: Record<string, Kind> = {
	".md": "md",
	".markdown": "md",
	".mdx": "md",
	".qmd": "md",
	".mmd": "mmd",
	".mermaid": "mmd",
};

const HELP = `mermaid-lint: check Mermaid diagrams in Markdown with the real Mermaid parser

Usage:
  mermaid-lint [--json] PATH...
  mermaid-lint [--json] --stdin-kind md|mmd -

Paths:
  FILE  .md .markdown .mdx .qmd   Markdown; every \`\`\`mermaid block is checked
        .mmd .mermaid             one bare diagram
  DIR   searched recursively for the file types above
        (skips node_modules and directories whose name starts with a dot)
  -     standard input; needs --stdin-kind

Options:
  --json             print one JSON object instead of the text report
  --stdin-kind KIND  how to read standard input: md or mmd
  -h, --help         show this help
  -V, --version      show the tool version and the Mermaid version

Exit codes:
  0  no findings
  1  one or more findings (report on stdout)
  2  the check could not run: usage, I/O or internal error
     (cause and fix on stderr, nothing on stdout)

A finding is "file:line:column: error[rule] type: message", then the source
line, then a hint when one is known. The parser stops at the first error in a
diagram, so fix it and run again until the exit code is 0. A clean result means
that every diagram parses; it does not check how a diagram looks.

Examples:
  mermaid-lint docs/architecture.md
  mermaid-lint --json docs README.md
  cat diagram.mmd | mermaid-lint --stdin-kind mmd -
`;

/** A mistake in how the tool was called. It carries the fix for the caller. */
class UsageError extends Error {
	constructor(
		message: string,
		readonly fix: string,
	) {
		super(message);
	}
}

interface Input {
	/** The name to report. */
	file: string;
	kind: Kind;
	read: () => Promise<string>;
}

async function main(argv: string[]): Promise<number> {
	const { values, positionals } = parse(argv);
	if (values.help) {
		process.stdout.write(HELP);
		return EXIT_CLEAN;
	}
	if (values.version) {
		process.stdout.write(
			`mermaid-lint ${toolVersion()} (mermaid ${mermaidVersion()})\n`,
		);
		return EXIT_CLEAN;
	}

	const inputs = await resolveInputs(positionals, values["stdin-kind"]);
	const findings: Finding[] = [];
	let diagrams = 0;
	for (const input of inputs) {
		const result = await lint(await input.read(), input.kind, input.file);
		diagrams += result.diagrams;
		findings.push(...result.findings);
	}

	process.stdout.write(
		render(
			{
				files: inputs.length,
				diagrams,
				findings,
				mermaidVersion: mermaidVersion(),
			},
			values.json ? "json" : "text",
		),
	);
	return findings.length === 0 ? EXIT_CLEAN : EXIT_FINDINGS;
}

function parse(argv: string[]) {
	try {
		return parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				json: { type: "boolean", default: false },
				"stdin-kind": { type: "string" },
				help: { type: "boolean", short: "h", default: false },
				version: { type: "boolean", short: "V", default: false },
			},
		});
	} catch (error) {
		throw new UsageError(
			// Node adds advice about `--` after the first sentence; the fix line replaces it.
			(error instanceof Error ? error.message : String(error)).split(". ")[0] ??
				"",
			"run `mermaid-lint --help` for the flags",
		);
	}
}

async function resolveInputs(
	paths: string[],
	stdinKind: string | undefined,
): Promise<Input[]> {
	if (paths.length === 0) {
		throw new UsageError(
			"no path given",
			"pass a file, a directory, or `-` for standard input",
		);
	}
	if (stdinKind !== undefined && stdinKind !== "md" && stdinKind !== "mmd") {
		throw new UsageError(
			`unknown --stdin-kind "${stdinKind}"`,
			"use `--stdin-kind md` (Markdown) or `--stdin-kind mmd` (one diagram)",
		);
	}
	const unique = [...new Set(paths)];
	if (stdinKind !== undefined && !unique.includes("-")) {
		throw new UsageError(
			"--stdin-kind was given, but no path is `-`",
			"add `-` to read standard input, or remove --stdin-kind",
		);
	}

	const inputs: Input[] = [];
	for (const path of unique) {
		if (path === "-") {
			if (stdinKind === undefined) {
				throw new UsageError(
					"standard input needs --stdin-kind",
					"add `--stdin-kind md` (Markdown) or `--stdin-kind mmd` (one diagram)",
				);
			}
			inputs.push({ file: "<stdin>", kind: stdinKind, read: readStdin });
			continue;
		}
		const info = await stat(path).catch((error: unknown) => {
			if (codeOf(error) === "ENOENT") {
				throw new UsageError(
					`path not found: ${path}`,
					"check the path; it is read relative to the current directory",
				);
			}
			throw unreadable(path, error);
		});
		if (info.isDirectory()) {
			for (const file of await walk(path)) inputs.push(fileInput(file));
			continue;
		}
		if (!kindOf(path)) {
			throw new UsageError(
				`unsupported file type: ${path}`,
				`use one of ${Object.keys(KIND_BY_EXTENSION).join(" ")}, or pipe the text with \`-\` and --stdin-kind`,
			);
		}
		inputs.push(fileInput(path));
	}
	return inputs;
}

function fileInput(file: string): Input {
	return {
		file,
		kind: kindOf(file) as Kind,
		read: () =>
			readFile(file, "utf8").catch((error: unknown) => {
				throw unreadable(file, error);
			}),
	};
}

function kindOf(path: string): Kind | undefined {
	return KIND_BY_EXTENSION[extname(path).toLowerCase()];
}

/** Lists the supported files under `directory`, in a stable order. */
async function walk(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		(error: unknown) => {
			throw unreadable(directory, error);
		},
	);
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			files.push(...(await walk(path)));
		} else if (kindOf(path) && (await isFile(entry, path))) {
			files.push(path);
		}
	}
	return files;
}

/** An I/O failure on `path`, with the system error code as the cause. */
function unreadable(path: string, error: unknown): UsageError {
	return new UsageError(
		`cannot read ${path} (${codeOf(error) ?? "unknown error"})`,
		"check that the path exists and that this user may read it",
	);
}

function codeOf(error: unknown): string | undefined {
	return (error as { code?: string } | null)?.code;
}

/**
 * True for a file and for a symbolic link to a file. A link to a directory is
 * not followed, so a scan cannot loop.
 */
async function isFile(
	entry: { isFile(): boolean; isSymbolicLink(): boolean },
	path: string,
): Promise<boolean> {
	if (entry.isFile()) return true;
	if (!entry.isSymbolicLink()) return false;
	const target = await stat(path).catch(() => null);
	return target?.isFile() ?? false;
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

function toolVersion(): string {
	const require = createRequire(import.meta.url);
	return (require("../package.json") as { version: string }).version;
}

try {
	process.exitCode = await main(process.argv.slice(2));
} catch (error) {
	// Exit 1 means "findings", so every failure of the tool itself must be exit 2.
	const [cause, fix] =
		error instanceof UsageError
			? [error.message, error.fix]
			: [
					`internal error: ${error instanceof Error ? error.message : String(error)}`,
					"this is a defect in mermaid-lint; report it with the input that caused it",
				];
	process.stderr.write(`mermaid-lint: error: ${cause}\n  fix: ${fix}\n`);
	process.exitCode = EXIT_USAGE;
} finally {
	await dispose();
}
