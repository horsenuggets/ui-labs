import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rojo = process.platform === "win32" ? "rojo.exe" : "rojo";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const rojoVersion = spawnSync(rojo, ["--version"], { cwd: root });

test("The plugin entry overrides the server suffix without replacing compiled output or dependencies", () => {
	const project = JSON.parse(readFileSync(new URL("../default.project.json", import.meta.url), "utf8"));
	assert.equal(project.tree.$path, "out");
	assert.equal(project.tree.include.$path, "include");
	assert.equal(project.tree.include.node_modules["@rbxts"].$path, "node_modules/@rbxts");
	assert.equal(project.tree.UILabs?.$path, "out/UILabs.server.luau");
	assert.equal(project.tree.UILabs?.$properties?.RunContext, "Plugin");
	// The explicit entry must not also be discovered under the root output directory.
	assert.ok(project.globIgnorePaths.includes(project.tree.UILabs.$path));
});

test(
	"The standard binary plugin build preserves the UILabs plugin run context",
	{ skip: rojoVersion.error?.code === "ENOENT" ? "Install the declared Rojo tool with rokit install." : false },
	(t) => {
		assert.ifError(rojoVersion.error);
		assert.equal(rojoVersion.status, 0, rojoVersion.stderr?.toString());
		execFileSync(npm, ["run", "build:rbxm"], {
			cwd: root,
			shell: process.platform === "win32",
			stdio: "pipe"
		});
		const temporary = mkdtempSync(path.join(tmpdir(), "ui-labs-plugin-build-"));
		try {
			// Read back the actual binary, rather than rebuilding the source project as XML.
			const project = path.join(temporary, "artifact.project.json");
			const output = path.join(temporary, "artifact.rbxmx");
			writeFileSync(
				project,
				JSON.stringify({ name: "PluginArtifact", tree: { $path: path.join(root, "ui-labs.rbxm") } })
			);
			execFileSync(rojo, ["build", project, "--output", output], { cwd: root, stdio: "pipe" });
			const xml = readFileSync(output, "utf8");
			const entries = Array.from(xml.matchAll(/<Item class="Script"[^>]*>\s*<Properties>([\s\S]*?)<\/Properties>/g))
				.map((match) => match[1])
				.filter((properties) => /<string name="Name">UILabs<\/string>/.test(properties));
			assert.equal(entries.length, 1, "The binary must contain exactly one UILabs Script entry.");
			const context = entries[0].match(/<token name="RunContext">(\d+)<\/token>/)?.[1];
			t.diagnostic(`Built UILabs Script RunContext is ${context}. Expected Plugin (3), not Server (1).`);
			assert.equal(context, "3");
			assert.match(entries[0], /<string name="Source">[\s\S]*plugin:CreateToolbar/);
		} finally {
			rmSync(temporary, { force: true, recursive: true });
		}
	}
);
