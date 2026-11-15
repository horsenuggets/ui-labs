import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(path) {
	return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
}

const mapExports = {};
runInNewContext(compile("../src/UI/StoryControls/ControlMap.ts"), {
	exports: mapExports,
	require: () => ({ default: () => undefined })
});
const libraryExports = {};
runInNewContext(compile("../src/UI/StoryPreview/PreviewController/StoryCheck/LibraryDefine.ts"), {
	exports: libraryExports,
	pairs: Object.entries,
	typeIs: (value, kind) => (kind === "table" ? value !== null && typeof value === "object" : typeof value === kind),
	typeOf: (value) => (value !== null && typeof value === "object" ? "table" : typeof value),
	require: (name) => {
		if (name === "@rbxts/sift") return { default: { Dictionary: { values: Object.values } } };
		if (name === "@rbxts/ui-labs") {
			return { Primitive: { string: true, number: true, boolean: true }, Datatype: { Color3: true } };
		}
		if (name === "UI/StoryControls/ControlMap") return mapExports;
		if (name === "Utils/MiscUtils") return { Cast: (value) => value };
		const library = name.match(/\/([A-Za-z]+)Check$/)?.[1];
		if (library) {
			return {
				[`${library}Checker`]: () => (library === "Generic" ? "valid" : "pass"),
				[`${library}Keys`]: []
			};
		}
		throw new Error(`Unexpected module "${name}".`);
	}
});

function validate(control) {
	return libraryExports.DefineStoryLibrary({ controls: { Example: control } });
}

const group = (Controls) => ({ EntryType: "ControlGroup", Controls });
const control = (Type, value = 1) => ({ EntryType: "Control", Type, ControlValue: value });

test("Object controls accept both nil and assigned defaults", () => {
	for (const value of [{ EntryType: "Control", Type: "Object" }, control("Object", "assigned")]) {
		assert.equal(validate(value).Sucess, true);
		assert.equal(validate(group({ Nested: value })).Sucess, true);
	}
});

test("Other control kinds still require defaults", () => {
	for (const Type of Object.keys(mapExports.AllControlsMap).filter((kind) => kind !== "Object")) {
		assert.equal(validate({ EntryType: "Control", Type }).Sucess, false);
		assert.equal(validate(control(Type)).Sucess, true);
	}
});

test("Malformed nested lists and unsupported controls return validation errors", () => {
	for (const value of [1, "invalid", false, null, undefined]) {
		assert.equal(validate(group(value)).Sucess, false);
		assert.equal(validate(group({ Nested: group(value) })).Sucess, false);
	}
	for (const value of [control("Unsupported"), { EntryType: "Control", Type: "Number" }, {}]) {
		assert.equal(validate(group({ Nested: group({ Invalid: value }) })).Sucess, false);
	}
});

test("Empty and valid nested groups mount successfully", () => {
	assert.equal(validate(group({})).Sucess, true);
	assert.equal(validate(group({ Nested: group({ Number: 0, String: "", Boolean: false }) })).Sucess, true);
});
