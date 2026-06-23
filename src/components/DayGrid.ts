import { appendIcon } from '../utils/icons';

export class DayGrid {
	private container: HTMLElement;
	private grid: HTMLElement;

	constructor(parent: HTMLElement) {
		this.container = parent.createDiv('tg-module tg-day-grid');
		
		const header = this.container.createDiv('tg-module-header');
		header.createSpan({ text: '今日 (24h)', cls: 'tg-module-title' });
		appendIcon(header, 'day');

		this.grid = this.container.createDiv('tg-day-grid-container');
	}

	update(now: Date): void {
		this.grid.empty();

		const currentHour = now.getHours();

		for (let hour = 0; hour < 24; hour++) {
			const cell = this.grid.createDiv('tg-hour-cell');
			cell.textContent = hour.toString();

			if (hour < currentHour) {
				cell.addClass('past');
			} else if (hour === currentHour) {
				cell.addClass('current');
			} else {
				cell.addClass('future');
			}
		}
	}
}
