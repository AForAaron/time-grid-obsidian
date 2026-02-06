import { Plugin } from 'obsidian';
import { TimeGridView, TIME_GRID_VIEW } from './views/TimeGridView';

export default class TimeGridPlugin extends Plugin {
	async onload() {

		// 注册右侧面板视图
		this.registerView(
			TIME_GRID_VIEW,
			(leaf) => new TimeGridView(leaf)
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
