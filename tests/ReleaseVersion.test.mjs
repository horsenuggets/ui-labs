import assert from "node:assert/strict";
import test from "node:test";

import { getReleaseVersion } from "../scripts/release-version.mjs";

const source = 'const Configs = { Version: { Mayor: 1, Minor: 6, Fix: 1, ForkSuffix: "-horse.0.4" } };';
const version = "1.6.1-horse.0.4";

test("Release version comes from the plugin configuration deterministically", () => {
	assert.equal(getReleaseVersion(source, version), version);
	assert.equal(getReleaseVersion(source, version), getReleaseVersion(source, version));
	assert.equal(getReleaseVersion(`// Version: { Mayor: 99 }\n${source}`, version), version);
});

test("Release version rejects missing, mismatched, and prefixed requests", () => {
	for (const requested of [undefined, "", "1.6.1-horse.0.5", `v${version}`, "1.6.1-horse.0.4\ninvalid=output"]) {
		assert.throws(() => getReleaseVersion(source, requested));
	}
});

test("Release version rejects missing or malformed metadata", () => {
	for (const invalid of [
		"",
		"const Configs = getConfigs();",
		"const Configs = { Version: getVersion() };",
		"const Configs = { Version:",
		source.replace("Mayor: 1, ", ""),
		source.replace("Minor: 6", 'Minor: "6"'),
		source.replace("Fix: 1", "Fix: -1"),
		source.replace("Fix: 1", "Fix: 1.5"),
		source.replace("Fix: 1", "Fix: 9007199254740992"),
		source.replace("Fix: 1", "Fix: 1, Fix: 2"),
		source.replace('"-horse.0.4"', '"-horse.00.4"'),
		source.replace('"-horse.0.4"', '"-other.0.4"')
	]) {
		assert.throws(() => getReleaseVersion(invalid, version));
	}
});

test("Every numeric version component may be zero", () => {
	assert.equal(
		getReleaseVersion(source.replace("Mayor: 1, Minor: 6, Fix: 1", "Mayor: 0, Minor: 0, Fix: 0"), "0.0.0-horse.0.4"),
		"0.0.0-horse.0.4"
	);
});
