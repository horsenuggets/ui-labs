/*--

FlattenStories

Flattens a hierarchical RootNodes tree into an ordered array of
StoryNodes, matching the visual order in the explorer. Folders
are traversed recursively so all stories are included regardless
of expand/collapse state.

--*/

export function FlattenStories(nodes: RootNodes): StoryNode[] {
	const result: StoryNode[] = [];

	for (const storybook of nodes.storybooks) {
		flattenChildren(storybook.Children, result);
	}
	for (const unknown of [...nodes.unknown].sort((a, b) => a.Instance.Name < b.Instance.Name)) {
		flattenChildren(unknown.Children, result);
	}

	return result;
}

function flattenChildren(children: ChildrenNode[], result: StoryNode[]) {
	const orderedChildren = [...children].sort((a, b) => {
		const aIsFolder = "Children" in a;
		const bIsFolder = "Children" in b;
		if (aIsFolder !== bIsFolder) return aIsFolder;
		const aName = "Children" in a ? a.Instance.Name : a.Name;
		const bName = "Children" in b ? b.Instance.Name : b.Name;
		return aName < bName;
	});

	for (const child of orderedChildren) {
		if ("Children" in child) {
			flattenChildren(child.Children, result);
		} else {
			result.push(child);
		}
	}
}
