import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function renderExplorer(nodes) {
	for (const list of [nodes.storybooks, nodes.unknown]) {
		Object.defineProperty(list, "size", { value: () => list.length });
	}
	let onInput;
	const mounted = [];
	const React = {
		createElement: (type, props, ...children) => ({ type, props, children }),
		useCallback: (callback) => callback,
		useEffect: (effect) => effect(),
		useMemo: (compute) => compute()
	};
	const exports = {};
	const flattenSource = readFileSync(
		new URL("../src/UI/SidePanel/StoryTree/FlattenStories.ts", import.meta.url),
		"utf8"
	);
	const treeSource = readFileSync(new URL("../src/UI/SidePanel/StoryTree/index.tsx", import.meta.url), "utf8");
	const compile = (source) =>
		ts.transpileModule(source, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
		}).outputText;
	const dimensions = class {
		static fromScale() {
			return {};
		}
	};
	runInNewContext(
		`
		const originalSort = Array.prototype.sort;
		Array.prototype.sort = function(compare) {
			return originalSort.call(this, (a, b) => compare(a, b) ? -1 : compare(b, a) ? 1 : 0);
		};
		Array.prototype.size = function() { return this.length; };
		${compile(flattenSource)}
		${compile(treeSource)}
	`,
		{
			exports,
			UDim: dimensions,
			UDim2: dimensions,
			Vector2: dimensions,
			Enum: new Proxy({}, { get: () => new Proxy({}, { get: (_, key) => key }) }),
			require: (name) => {
				if (name === "@rbxts/react") return { default: React, ...React };
				if (name === "@rbxts/react-reflex")
					return {
						useProducer: () => ({ mountStory: (module) => mounted.push(module) }),
						useSelector: (selector) =>
							({ selectNodes: { nodes }, selectFilter: {}, selectShortcutsEnabled: true })[selector],
						useSelectorCreator: () => undefined
					};
				if (name === "Hooks/Context/UserInput")
					return {
						useInputBegan: () => ({
							Connect: (callback) => {
								onInput = callback;
								return { Disconnect() {} };
							}
						})
					};
				if (name === "Plugin/Configs") return { default: { RootPreviewKey: "RootStory" } };
				if (name === "./FlattenStories") return { FlattenStories: exports.FlattenStories };
				return new Proxy({ default: name }, { get: (target, key) => (key in target ? target[key] : key) });
			}
		}
	);
	const tree = exports.default({});
	return { tree, navigate: () => onInput({ IsModifierKeyDown: () => true, KeyCode: "Down" }), mounted };
}

const story = (Name) => ({ Name, Module: Name });
const folder = (Name, Children) => ({ Instance: { Name }, Children });

test("Navigation recomputes folder ordering after a rename without a tree update", () => {
	const renamed = folder("Z", [story("Moved")]);
	const nodes = { storybooks: [{ Children: [renamed, folder("B", [story("First")])] }], unknown: [] };
	const explorer = renderExplorer(nodes);
	explorer.navigate();
	assert.deepEqual(explorer.mounted, ["First"]);
	renamed.Instance.Name = "A";
	explorer.navigate();
	assert.deepEqual(explorer.mounted, ["First", "Moved"]);
});

test("Root entries have explicit layout orders with the unknown section last", () => {
	const nodes = { storybooks: [{ Children: [] }, { Children: [] }], unknown: [folder("Unknown", [])] };
	const { tree } = renderExplorer(nodes);
	const scrollingFrame = tree.children[1];
	const entries = scrollingFrame.children[1];
	assert.deepEqual(
		Array.from(entries, (entry) => entry.props.LayoutOrder ?? entry.props.Order),
		[0, 1, 2, 3]
	);
});
