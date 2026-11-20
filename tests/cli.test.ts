import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fixture, runCli } from "./helpers.js";

describe("exit codes", () => {
	test("0 and one summary line when every diagram parses", async () => {
		const run = await runCli([fixture("samples/good.mmd")]);
		expect(run.code).toBe(0);
		expect(run.stdout).toMatch(
			/^ok: 1 diagram, 1 file \(mermaid \d+\.\d+\.\d+\)\n$/,
		);
		expect(run.stderr).toBe("");
	});

	test("1 and a file:line:column finding when a diagram is rejected", async () => {
		const file = fixture("samples/bad.mmd");
		const run = await runCli([file]);
		expect(run.code).toBe(1);
		expect(run.stdout).toContain(`${file}:3:5: error[syntax] flowchart-v2: `);
		expect(run.stdout).toContain("  3 |   B -> C\n");
		expect(run.stdout).toMatch(
			/\n1 error in 1 of 1 diagram, 1 file \(mermaid /,
		);
		expect(run.stderr).toBe("");
	});

	test.each([
		["no path", [], "no path given"],
		["a missing path", ["missing.md"], "path not found: missing.md"],
		["an unknown flag", ["--bogus", "a.md"], "Unknown option '--bogus'"],
		[
			"an unsupported extension",
			[fixture("samples/tree/notes.txt")],
			"unsupported file type",
		],
		["stdin without a kind", ["-"], "standard input needs --stdin-kind"],
		[
			"a bad stdin kind",
			["--stdin-kind", "txt", "-"],
			'unknown --stdin-kind "txt"',
		],
		[
			"a stdin kind without stdin",
			["--stdin-kind", "md", fixture("samples/good.mmd")],
			"--stdin-kind was given, but no path is `-`",
		],
	])(
		"2 with a cause and a fix on stderr for %s",
		async (_name, args, cause) => {
			const run = await runCli(args);
			expect(run.code).toBe(2);
			expect(run.stdout).toBe("");
			expect(run.stderr).toContain(`mermaid-lint: error: ${cause}`);
			expect(run.stderr).toMatch(/\n {2}fix: \S/);
		},
	);
});

describe("inputs", () => {
	test("standard input is read as the given kind", async () => {
		const run = await runCli(
			["--stdin-kind", "mmd", "-"],
			"flowchart TD\n  A -> B\n",
		);
		expect(run.code).toBe(1);
		expect(run.stdout).toContain("<stdin>:2:5: error[syntax]");
	});

	test("a directory is searched recursively, without hidden directories and node_modules", async () => {
		const run = await runCli([fixture("samples/tree")]);
		expect(run.code).toBe(0);
		expect(run.stdout).toMatch(/^ok: 2 diagrams, 2 files /);
	});

	test("a Markdown file with no Mermaid block is clean and says so in the count", async () => {
		const run = await runCli([fixture("samples/none.md")]);
		expect(run.code).toBe(0);
		expect(run.stdout).toMatch(/^ok: 0 diagrams, 1 file /);
	});

	test("the same path given twice is read once", async () => {
		const file = fixture("samples/good.mmd");
		const run = await runCli([file, file]);
		expect(run.stdout).toMatch(/^ok: 1 diagram, 1 file /);
	});
});

describe("reports", () => {
	test("the text report lists each finding in file coordinates, then a summary", async () => {
		const file = fixture("samples/mixed.md");
		const run = await runCli([file]);
		expect(run.code).toBe(1);
		expect(run.stdout).toContain(`${file}:23:22: error[syntax] flowchart-v2: `);
		expect(run.stdout).toContain("  23 |      B --> C[Call foo(bar)]\n");
		expect(run.stdout).toContain(`${file}:30:12: error[syntax] pie: `);
		expect(run.stdout).toContain(`${file}:48:1: error[empty-block] `);
		expect(run.stdout).toMatch(
			/\n3 errors in 3 of 5 diagrams, 1 file \(mermaid /,
		);
	});

	test("--json prints one object with the same findings", async () => {
		const file = fixture("samples/mixed.md");
		const run = await runCli(["--json", file]);
		expect(run.code).toBe(1);
		const report = JSON.parse(run.stdout);
		expect(report).toMatchObject({
			schema: 1,
			mermaid_version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
			summary: { files: 1, diagrams: 5, errors: 3 },
		});
		expect(report.findings).toHaveLength(3);
		expect(Object.keys(report.findings[0])).toEqual([
			"file",
			"line",
			"column",
			"block",
			"diagram_type",
			"rule",
			"message",
			"hint",
			"excerpt",
		]);
		expect(report.findings[0]).toMatchObject({
			file,
			line: 23,
			column: 22,
			block: 2,
			diagram_type: "flowchart-v2",
			rule: "syntax",
		});
	});

	test("--json on a clean run has an empty findings list", async () => {
		const run = await runCli(["--json", fixture("samples/good.mmd")]);
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toMatchObject({
			summary: { files: 1, diagrams: 1, errors: 0 },
			findings: [],
		});
	});
});

describe("the file system", () => {
	let root: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "mermaid-lint-"));
		await mkdir(join(root, "scan", "locked"), { recursive: true });
		await writeFile(join(root, "scan", "a.mmd"), "flowchart TD\n  A --> B\n");
		await writeFile(join(root, "target.mmd"), "flowchart TD\n  A -> B\n");
		await mkdir(join(root, "links"));
		await symlink(join(root, "target.mmd"), join(root, "links", "linked.mmd"));
		await symlink(join(root, "scan"), join(root, "links", "dir-link"));
		await chmod(join(root, "scan", "locked"), 0o000);
	});

	afterAll(async () => {
		await chmod(join(root, "scan", "locked"), 0o755);
		await rm(root, { recursive: true });
	});

	// The owner "root" may read a directory with mode 000, so the case does not apply.
	test.skipIf(process.getuid?.() === 0)(
		"a directory that cannot be read is exit 2, not a crash",
		async () => {
			const run = await runCli([join(root, "scan")]);
			expect(run.code).toBe(2);
			expect(run.stdout).toBe("");
			expect(run.stderr).toMatch(
				/^mermaid-lint: error: cannot read .*locked \(EACCES\)\n {2}fix: /,
			);
		},
	);

	test("a scan lints a linked file and does not follow a linked directory", async () => {
		const run = await runCli([join(root, "links")]);
		expect(run.code).toBe(1);
		expect(run.stdout).toContain("linked.mmd:2:5: error[syntax]");
		expect(run.stdout).toMatch(/\n1 error in 1 of 1 diagram, 1 file /);
	});
});

describe("information flags", () => {
	test("--version prints the tool version and the Mermaid version", async () => {
		const run = await runCli(["--version"]);
		expect(run.code).toBe(0);
		expect(run.stdout).toMatch(
			/^mermaid-lint \d+\.\d+\.\d+ \(mermaid \d+\.\d+\.\d+\)\n$/,
		);
	});

	test("--help states the exit codes", async () => {
		const run = await runCli(["--help"]);
		expect(run.code).toBe(0);
		expect(run.stdout).toContain("Exit codes:");
		expect(run.stdout).toContain("--stdin-kind");
	});
});
