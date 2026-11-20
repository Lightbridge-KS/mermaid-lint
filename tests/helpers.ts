import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

/** Absolute path of a file under `tests/fixtures/`. */
export function fixture(relative: string): string {
	return fileURLToPath(new URL(`./fixtures/${relative}`, import.meta.url));
}

export interface CliRun {
	code: number | null;
	stdout: string;
	stderr: string;
}

/** Runs the built CLI. Build first: `pnpm build`. */
export function runCli(args: string[], input?: string): Promise<CliRun> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args]);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
		child.stdin.end(input ?? "");
	});
}
