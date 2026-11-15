import React, { useCallback, useEffect, useMemo } from "@rbxts/react";
import { useProducer, useSelector, useSelectorCreator } from "@rbxts/react-reflex";
import { useInputBegan } from "Hooks/Context/UserInput";
import Configs from "Plugin/Configs";
import { selectFilter } from "Reflex/Explorer/Filter";
import { selectNodes } from "Reflex/Explorer/Nodes";
import { selectPopup } from "Reflex/Overlay";
import { selectKeepViewOnViewport, selectShortcutsEnabled } from "Reflex/PluginSettings";
import { selectPreview } from "Reflex/StoryPreview";
import { Detector } from "UI/Styles/Detector";
import { Div } from "UI/Styles/Div";
import TopList from "UI/Styles/List/TopList";
import Divisor from "UI/Utils/Divisor";

import Storybook from "../Nodes/ChildrenHolder/Storybook";
import UnknownNode from "../Nodes/ChildrenHolder/UnknownNode";
import { FlattenStories } from "./FlattenStories";
import { FilterNodes } from "./SearchFilter";

interface StoryTreeProps {}

function StoryTree(props: StoryTreeProps) {
	const nodes = useSelector(selectNodes).nodes;
	const filter = useSelector(selectFilter).search;
	const overlay = useSelector(selectPopup);
	const isBlocked = overlay !== undefined;

	const inputBegan = useInputBegan();
	const shortcutsEnabled = useSelector(selectShortcutsEnabled);
	const keepViewOnViewport = useSelector(selectKeepViewOnViewport);
	const rootStory = useSelectorCreator(selectPreview, Configs.RootPreviewKey);
	const { mountStory } = useProducer<RootProducer>();

	const filteredNodes = useMemo(() => {
		return filter === undefined ? nodes : FilterNodes(nodes, filter);
	}, [nodes, filter]);

	const MoveToStory = useCallback(
		(delta: number) => {
			const flatStories = FlattenStories(filteredNodes);
			if (flatStories.size() === 0) return;

			const currentModule = rootStory?.Module;
			let currentIndex = -1;

			if (currentModule) {
				for (let i = 0; i < flatStories.size(); i++) {
					if (flatStories[i].Module === currentModule) {
						currentIndex = i;
						break;
					}
				}
			}

			let nextIndex: number;
			if (currentIndex === -1) {
				nextIndex = delta > 0 ? 0 : flatStories.size() - 1;
			} else {
				const lastIndex = flatStories.size() - 1;
				nextIndex = currentIndex + delta;
				if (nextIndex > lastIndex) {
					nextIndex = 0;
				} else if (nextIndex < 0) {
					nextIndex = lastIndex;
				}
				if (nextIndex === currentIndex) return;
			}

			mountStory(flatStories[nextIndex].Module, keepViewOnViewport);
		},
		[filteredNodes, rootStory, keepViewOnViewport]
	);

	useEffect(() => {
		if (!shortcutsEnabled) return;

		const connection = inputBegan.Connect((input) => {
			if (!input.IsModifierKeyDown(Enum.ModifierKey.Alt)) return;
			if (input.KeyCode === Enum.KeyCode.Up) {
				MoveToStory(-1);
			} else if (input.KeyCode === Enum.KeyCode.Down) {
				MoveToStory(1);
			}
		});

		return () => {
			connection.Disconnect();
		};
	}, [MoveToStory, shortcutsEnabled]);

	const nodeList = useMemo(() => {
		const elementsList: React.Element[] = [];
		const booksSize = filteredNodes.storybooks.size();
		const unknownSize = filteredNodes.unknown.size();

		if (booksSize > 0) {
			filteredNodes.storybooks.forEach((node, index) => {
				elementsList.push(<Storybook Order={index} Node={node} />);
			});
			if (unknownSize > 0) {
				elementsList.push(
					<Div key={"2-Divisor"} Size={new UDim2(1, 0, 0, 8)} LayoutOrder={booksSize}>
						<Divisor Direction="X" Size={new UDim(1, -25)} Transparency={0.9} />
					</Div>
				);
			}
		}
		if (filteredNodes.unknown.size() > 0) {
			elementsList.push(<UnknownNode Order={booksSize + 1} UnknownNodes={filteredNodes.unknown} />);
		}
		return elementsList;
	}, [filteredNodes]);

	return (
		<Detector key="ScrollerFrame" Size={new UDim2(1, 0, 1, 0)} AnchorPoint={new Vector2(0.5, 0)} LayoutOrder={3}>
			<uiflexitem FlexMode={Enum.UIFlexMode.Fill} />
			<scrollingframe
				key={"Scroller"}
				AutomaticCanvasSize={Enum.AutomaticSize.Y}
				CanvasSize={new UDim2()}
				ScrollBarThickness={2}
				ScrollBarImageTransparency={0.8}
				Active={true}
				BorderSizePixel={0}
				ScrollingEnabled={!isBlocked}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={new UDim2(1, 6, 1, 0)}
			>
				<TopList HorizontalAlignment={Enum.HorizontalAlignment.Center} Padding={new UDim(0, 1)} />
				{nodeList}
			</scrollingframe>
		</Detector>
	);
}

export default StoryTree;
