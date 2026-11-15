import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/UI/SidePanel/StoryTree/FlattenStories.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function flatten(nodes) {
	// Model Luau's boolean table.sort comparator at the runtime boundary.
	return runInNewContext(
		`
		const originalSort = Array.prototype.sort;
		Array.prototype.sort = function(compare) {
			return originalSort.call(this, (a, b) => compare(a, b) ? -1 : compare(b, a) ? 1 : 0);
		};
		const exports = {};
		${compiled}
		const nodes = JSON.parse(input);
		const result = exports.FlattenStories(nodes);
		if (JSON.stringify(nodes) !== input) throw new Error("Navigation mutated the input tree.");
		JSON.stringify(result);
		`,
		{ input: JSON.stringify(nodes) }
	);
}

const story = (Name) => ({ Name, Module: Name });
const folder = (Name, Children) => ({ Instance: { Name }, Children });

test("Navigation follows alphabetical folders before alphabetical stories", () => {
	const nodes = {
		storybooks: [
			{
				Children: [
					story("Zebra"),
					folder("ZFolder", [story("Zulu"), story("Alpha")]),
					story("Apple"),
					folder("AFolder", [story("Beta"), folder("Nested", [story("NestedStory")])])
				]
			}
		],
		unknown: [folder("ZUnknown", [story("Last")]), folder("AUnknown", [story("Y"), story("X")])]
	};
	const before = JSON.stringify(nodes);
	const result = JSON.parse(flatten(nodes)).map((entry) => entry.Name);
	assert.deepEqual(result, ["NestedStory", "Beta", "Alpha", "Zulu", "Apple", "Zebra", "X", "Y", "Last"]);
	assert.equal(JSON.stringify(nodes), before);
	assert.equal(flatten(nodes), flatten(nodes));
});

test("Navigation preserves storybook order and includes each story once", () => {
	const nodes = {
		storybooks: [{ Children: [story("ZBookStory")] }, { Children: [story("ABookStory")] }],
		unknown: []
	};
	assert.deepEqual(
		JSON.parse(flatten(nodes)).map((entry) => entry.Name),
		["ZBookStory", "ABookStory"]
	);
});

test("Navigation handles every combination of empty root collections", () => {
	for (const hasBooks of [false, true]) {
		for (const hasUnknown of [false, true]) {
			const nodes = {
				storybooks: hasBooks ? [{ Children: [story("Known")] }] : [],
				unknown: hasUnknown ? [folder("Unknown", [story("Other")])] : []
			};
			const expected = [...(hasBooks ? ["Known"] : []), ...(hasUnknown ? ["Other"] : [])];
			assert.deepEqual(
				JSON.parse(flatten(nodes)).map((entry) => entry.Name),
				expected
			);
		}
	}
});
