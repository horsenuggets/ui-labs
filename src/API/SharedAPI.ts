import { Debris } from "@rbxts/services";
import Configs from "Plugin/Configs";
import { RootProducer } from "Reflex";
import { selectNodes } from "Reflex/Explorer/Nodes";
import { selectStory } from "Reflex/ModuleList/Story";
import { GetEntryByKey, selectStoryPreviews } from "Reflex/StoryPreview";

const MOUNT_TIMEOUT = 5;
const MOUNT_POLL_INTERVAL = 0.1;

function removeStoryExtension(name: string): string {
	const ext = Configs.Extensions.Story;
	if (name.sub(-ext.size()) === ext) {
		return name.sub(1, -ext.size() - 1);
	}
	return name;
}

function findStoryModule(name: string): ModuleScript | undefined {
	const state = RootProducer.getState();
	const stories = selectStory(state).list;
	const nodemap = selectNodes(state).nodemap;

	// Exact match on module name (without extension)
	for (const module of stories) {
		const moduleName = removeStoryExtension(module.Name);
		if (moduleName === name) return module;
	}

	// Match on node display name
	for (const module of stories) {
		const node = nodemap.get(module);
		if (node && node.Name === name) return module;
	}

	// Partial path match
	for (const module of stories) {
		if (module.GetFullName().find(name)[0] !== undefined) return module;
	}

	return undefined;
}

function findMountedEntryByName(name: string): [string, PreviewEntry] | undefined {
	const state = RootProducer.getState();
	const previews = selectStoryPreviews(state);
	const nodemap = selectNodes(state).nodemap;

	for (const [key, entry] of previews) {
		const moduleName = removeStoryExtension(entry.Module.Name);
		if (moduleName === name) return [key, entry];

		const node = nodemap.get(entry.Module);
		if (node && node.Name === name) return [key, entry];
	}

	return undefined;
}

function listStories(): Array<{ name: string; path: string; module: ModuleScript }> {
	const state = RootProducer.getState();
	const stories = selectStory(state).list;
	const nodemap = selectNodes(state).nodemap;

	const results: Array<{ name: string; path: string; module: ModuleScript }> = [];
	for (const module of stories) {
		const node = nodemap.get(module);
		const name = node ? node.Name : removeStoryExtension(module.Name);
		results.push({ name, path: module.GetFullName(), module });
	}
	return results;
}

function mountStory(name: string): Frame | undefined {
	const module = findStoryModule(name);
	if (!module) {
		warn(`[UILabs API] Story not found: "${name}"`);
		return undefined;
	}

	// Mount as root story (replaces current root, same as clicking
	// in the sidebar)
	RootProducer.mountStory(module, false);
	RootProducer.selectStory(Configs.RootPreviewKey);

	// Poll until the Holder frame is assigned by the
	// PreviewController React component
	let elapsed = 0;
	while (elapsed < MOUNT_TIMEOUT) {
		task.wait(MOUNT_POLL_INTERVAL);
		elapsed += MOUNT_POLL_INTERVAL;

		const state = RootProducer.getState();
		const previews = selectStoryPreviews(state);
		const entry = previews.get(Configs.RootPreviewKey);
		if (entry && entry.Module === module && entry.Holder) {
			// Give the story one more frame to finish rendering
			task.wait(MOUNT_POLL_INTERVAL);
			return entry.Holder;
		}
	}

	warn(`[UILabs API] Timed out waiting for story "${name}" to mount.`);
	return undefined;
}

function unmountStory(name: string): boolean {
	const found = findMountedEntryByName(name);
	if (!found) {
		// Also try unmounting by key directly
		const state = RootProducer.getState();
		const previews = selectStoryPreviews(state);
		const entry = GetEntryByKey(previews, name);
		if (entry) {
			RootProducer.unmountStory(entry.Key);
			return true;
		}
		return false;
	}

	const [key] = found;
	RootProducer.unmountStory(key);
	return true;
}

function getStoryHolder(name: string): Frame | undefined {
	const found = findMountedEntryByName(name);
	if (found) {
		const [, entry] = found;
		return entry.Holder;
	}

	// Try by key
	const state = RootProducer.getState();
	const previews = selectStoryPreviews(state);
	const entry = GetEntryByKey(previews, name);
	return entry?.Holder;
}

function getMountedStories(): Array<{ name: string; key: string; holder: Frame | undefined }> {
	const state = RootProducer.getState();
	const previews = selectStoryPreviews(state);
	const nodemap = selectNodes(state).nodemap;

	const results: Array<{ name: string; key: string; holder: Frame | undefined }> = [];
	for (const [key, entry] of previews) {
		const node = nodemap.get(entry.Module);
		const name = node ? node.Name : removeStoryExtension(entry.Module.Name);
		results.push({ name, key, holder: entry.Holder });
	}
	return results;
}

const BACKGROUND_COLOR = Color3.fromRGB(19, 20, 20);
const PATTERN_ASSET = "rbxassetid://106415912242239";
const PATTERN_TILE_SIZE = 40;
const PATTERN_TRANSPARENCY = 0.95;
const RENDER_DISPLAY_ORDER = 2147483647;
const RENDER_DEBRIS_LIFETIME = 30;
const SCREENSHOT_GUI_NAME = "UILabsRender";

function renderStory(name: string, width?: number, height?: number): ScreenGui | undefined {
	const CoreGui = game.GetService("CoreGui");

	// Clean up any existing render
	const existing = CoreGui.FindFirstChild(SCREENSHOT_GUI_NAME);
	if (existing) {
		existing.Destroy();
	}

	// Mount the story and get the holder
	const holder = mountStory(name);
	if (!holder) {
		return undefined;
	}

	// Find the first GuiObject child to clone
	let sourceGui: GuiObject | undefined;
	for (const child of holder.GetChildren()) {
		if (child.IsA("GuiObject")) {
			sourceGui = child as GuiObject;
			break;
		}
	}
	if (!sourceGui) {
		warn(`[UILabs API] No GuiObject found in story holder for "${name}".`);
		return undefined;
	}

	const storyWidth = width ?? math.floor(sourceGui.AbsoluteSize.X);
	const storyHeight = height ?? math.floor(sourceGui.AbsoluteSize.Y);

	// Create ScreenGui
	const screenGui = new Instance("ScreenGui");
	screenGui.Name = SCREENSHOT_GUI_NAME;
	screenGui.DisplayOrder = RENDER_DISPLAY_ORDER;
	screenGui.IgnoreGuiInset = true;
	screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;

	// Dark background
	const bg = new Instance("Frame");
	bg.Name = "Background";
	bg.Size = UDim2.fromScale(1, 1);
	bg.BackgroundColor3 = BACKGROUND_COLOR;
	bg.BorderSizePixel = 0;
	bg.ZIndex = RENDER_DISPLAY_ORDER;
	bg.Parent = screenGui;

	// Tiled cross pattern
	const pattern = new Instance("ImageLabel");
	pattern.Name = "Pattern";
	pattern.Size = UDim2.fromScale(1, 1);
	pattern.BackgroundTransparency = 1;
	pattern.Image = PATTERN_ASSET;
	pattern.ScaleType = Enum.ScaleType.Tile;
	pattern.TileSize = UDim2.fromOffset(PATTERN_TILE_SIZE, PATTERN_TILE_SIZE);
	pattern.ImageTransparency = PATTERN_TRANSPARENCY;
	pattern.ImageColor3 = new Color3(1, 1, 1);
	pattern.Parent = bg;

	// Centered container
	const container = new Instance("Frame");
	container.Name = "Container";
	container.Size = UDim2.fromOffset(storyWidth, storyHeight);
	container.Position = UDim2.fromScale(0.5, 0.5);
	container.AnchorPoint = new Vector2(0.5, 0.5);
	container.BackgroundTransparency = 1;
	container.Parent = bg;

	// Clone story content
	const clone = sourceGui.Clone();
	clone.Size = UDim2.fromScale(1, 1);
	clone.Position = UDim2.fromScale(0, 0);
	clone.AnchorPoint = new Vector2(0, 0);
	clone.Parent = container;

	screenGui.Parent = CoreGui;
	Debris.AddItem(screenGui, RENDER_DEBRIS_LIFETIME);

	return screenGui;
}

export function registerSharedAPI(): void {
	const api: SharedUILabsAPI = {
		listStories,
		mountStory,
		unmountStory,
		getStoryHolder,
		getMountedStories,
		renderStory
	};

	(shared as unknown as { UILabs?: SharedUILabsAPI }).UILabs = api;
}

export function unregisterSharedAPI(): void {
	(shared as unknown as { UILabs?: SharedUILabsAPI }).UILabs = undefined;
}
