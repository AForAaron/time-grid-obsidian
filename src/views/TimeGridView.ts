import { ItemView, WorkspaceLeaf } from 'obsidian';
import { MonthHeatmap } from '../components/MonthHeatmap';
import { DayGrid } from '../components/DayGrid';
import { HourGrid } from '../components/HourGrid';
import { DailyPieChart } from '../components/DailyPieChart';

export const TIME_GRID_VIEW = 'time-grid-view';

export class TimeGridView extends ItemView {
	private monthHeatmap: MonthHeatmap;
	private dayGrid: DayGrid;
	private hourGrid: HourGrid;
	private dailyPieChart: DailyPieChart;
	private updateInterval: number;

	getViewType(): string {
		return TIME_GRID_VIEW;
	}

	getDisplayText(): string {
		return 'Time Grid';
	}

	getIcon(): string {
		return 'clock';
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('time-grid-container');

		// 创建垂直布局容器
		const wrapper = container.createDiv('time-grid-wrapper');

		// 初始化三个组件
		this.monthHeatmap = new MonthHeatmap(wrapper);
		this.dayGrid = new DayGrid(wrapper);
		this.hourGrid = new HourGrid(wrapper);
		this.dailyPieChart = new DailyPieChart(wrapper, this.app);

		// 每秒更新一次（节流到 1 秒，降低内存占用）
		this.updateInterval = window.setInterval(() => {
			this.updateAll();
		}, 1000);

		// 初始渲染
		this.updateAll();
	}

	async onClose(): Promise<void> {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
	}

	private updateAll(): void {
		const now = new Date();
		this.monthHeatmap.update(now);
		this.dayGrid.update(now);
		this.hourGrid.update(now);
		this.dailyPieChart.update(now);
	}
}
