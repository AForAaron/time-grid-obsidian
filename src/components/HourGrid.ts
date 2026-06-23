import { appendIcon } from '../utils/icons';

export class HourGrid {
	private container: HTMLElement;
	private grid: HTMLElement;
	private timeDisplay: HTMLElement;

	constructor(parent: HTMLElement) {
		this.container = parent.createDiv('tg-module tg-hour-grid');
		
		const header = this.container.createDiv('tg-module-header');
		header.createSpan({ text: '当下 (60m)', cls: 'tg-module-title' });
		this.timeDisplay = header.createSpan({ cls: 'tg-time-display' });
		appendIcon(header, 'hour');

		this.grid = this.container.createDiv('tg-hour-grid-container');
	}

	update(now: Date): void {
		// 更新时间显示
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
		this.timeDisplay.textContent = timeStr;

		// 更新网格
		this.grid.empty();

		const currentMinute = now.getMinutes();

		for (let minute = 0; minute < 60; minute++) {
			const cell = this.grid.createDiv('tg-minute-cell');

			if (minute < currentMinute) {
				cell.addClass('past');
			} else if (minute === currentMinute) {
				cell.addClass('current');
			} else {
				cell.addClass('future');
			}
		}
	}
}
