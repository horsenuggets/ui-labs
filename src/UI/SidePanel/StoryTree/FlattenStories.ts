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
	for (const unknown of nodes.unknown) {
		for (const story of unknown.Children) {
			result.push(story);
		}
	}

	return result;
}

function flattenChildren(children: ChildrenNode[], result: StoryNode[]) {
	for (const child of children) {
		if ("Children" in child) {
			flattenChildren(child.Children, result);
		} else {
			result.push(child);
		}
	}
}
