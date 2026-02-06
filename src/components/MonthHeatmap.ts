import { appendIcon } from '../utils/icons';

export type MonthHeatmapOptions = {
	onTitleClick?: () => void;
	onDateClick?: (date: Date) => void;
};

export class MonthHeatmap {
	private container: HTMLElement;
	private grid: HTMLElement;
	private onTitleClick?: () => void;
	private onDateClick?: (date: Date) => void;

	constructor(parent: HTMLElement, options?: MonthHeatmapOptions) {
		this.container = parent.createDiv('time-grid-module month-heatmap');
		this.onTitleClick = options?.onTitleClick;
		this.onDateClick = options?.onDateClick;

		// 标题栏
		const header = this.container.createDiv('module-header');
		const titleEl = header.createSpan({ text: '本月', cls: 'module-title' });
		appendIcon(header, 'month');
		if (this.onTitleClick) {
			header.addClass('clickable');
			header.addEventListener('click', this.onTitleClick);
		}

		// 网格容器
		this.grid = this.container.createDiv('heatmap-grid');
	}

	update(now: Date): void {
		this.grid.empty();

		const year = now.getFullYear();
		const month = now.getMonth();
		const today = now.getDate();

		// 获取当月第一天和最后一天
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const daysInMonth = lastDay.getDate();
		const firstDayOfWeek = firstDay.getDay(); // 0=周日, 1=周一...

		// 转换为周一为 0 的格式
		const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

		// 创建星期标签
		const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];
		weekLabels.forEach(label => {
			const labelEl = this.grid.createDiv('week-label');
			labelEl.textContent = label;
		});

		// 填充空白（月初之前的日期）
		for (let i = 0; i < startOffset; i++) {
			this.grid.createDiv('day-cell empty');
		}

		// 创建日期格子
		for (let day = 1; day <= daysInMonth; day++) {
			const cell = this.grid.createDiv('day-cell');
			cell.textContent = day.toString();
			const cellDate = new Date(year, month, day);
			if (this.onDateClick) {
				cell.addClass('clickable');
				cell.addEventListener('click', () => this.onDateClick?.(cellDate));
			}

			const isPast = day < today;
			const isToday = day === today;

			if (isPast) {
				cell.addClass('past');
			} else if (isToday) {
				cell.addClass('current');
			} else {
				cell.addClass('future');
			}
		}
	}
}
