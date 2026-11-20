import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("the built CLI prints its version", async () => {
	const { stdout } = await run(process.execPath, [cli, "--version"]);
	expect(stdout).toMatch(/^mermaid-lint \d+\.\d+\.\d+/);
});
