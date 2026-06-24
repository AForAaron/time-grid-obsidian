import { Plugin } from 'obsidian';
import { TimeGridView, TIME_GRID_VIEW } from './views/TimeGridView';
import { normalizeTimeGridData, TimeGridPluginData, WritingStatsTracker } from './utils/writingStats';

export default class TimeGridPlugin extends Plugin {
	private dataStore: TimeGridPluginData;
	private writingStats: WritingStatsTracker;

	async onload() {
		this.dataStore = normalizeTimeGridData(await this.loadData());
		this.writingStats = new WritingStatsTracker(this, this.dataStore, async () => {
			await this.saveData(this.dataStore);
		});
		this.writingStats.registerEvents();
		void this.writingStats.initializeBaselines();

		// 注册右侧面板视图
		this.registerView(
			TIME_GRID_VIEW,
			(leaf) => new TimeGridView(leaf, this.writingStats)
		);

		// 在右侧打开面板
		this.app.workspace.onLayoutReady(() => {
			this.activateView();
		});
	}

	async onunload() {
		// 清理资源
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(TIME_GRID_VIEW)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: TIME_GRID_VIEW, active: true });
				leaf = rightLeaf;
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
