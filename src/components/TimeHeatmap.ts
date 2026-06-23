import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import { aggregateDurations, extractSimpleTimeTracker, getDailyNoteFilename } from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';

export type TimeHeatmapOptions = {
	onTitleClick?: () => void;
	onDateClick?: (date: Date) => void;
};

type HeatmapDay = {
	date: Date;
	dateKey: string;
	durationMs: number;
	level: number;
	intensity: number;
	isToday: boolean;
	isFuture: boolean;
};

const WEEKS_TO_SHOW = 26;
const HOUR_MS = 60 * 60 * 1000;
const LEVEL_STOPS = [1 * HOUR_MS, 4 * HOUR_MS, 8 * HOUR_MS, 12 * HOUR_MS];

export class TimeHeatmap {
	private app: App;
	private container: HTMLElement;
	private content: HTMLElement;
	private grid: HTMLElement;
	private monthLabels: HTMLElement;
	private summary: HTMLElement;
	private tooltip: HTMLElement;
	private onTitleClick?: () => void;
	private onDateClick?: (date: Date) => void;
	private lastRenderedMinute = '';
	private lastAutoScrollDateKey = '';
	private refreshInFlight = false;
	private fileCache = new Map<string, { mtime: number; content: string }>();

	constructor(parent: HTMLElement, app: App, options?: TimeHeatmapOptions) {
		this.app = app;
		this.container = parent.createDiv('tg-module tg-time-heatmap');
		this.onTitleClick = options?.onTitleClick;
		this.onDateClick = options?.onDateClick;

		const header = this.container.createDiv('tg-module-header');
		const titleWrap = header.createDiv('tg-module-heading');
		titleWrap.createSpan({ text: '时间热力图', cls: 'tg-module-title' });
		this.summary = titleWrap.createSpan({ cls: 'tg-heatmap-summary' });
		appendIcon(header, 'month');
		if (this.onTitleClick) {
			header.addClass('tg-clickable');
			header.addEventListener('click', this.onTitleClick);
		}

		const body = this.container.createDiv('tg-heatmap-body');
		const weekLabels = body.createDiv('tg-heatmap-weekdays');
		['一', '二', '三', '四', '五', '六', '日'].forEach(label => {
			weekLabels.createDiv({ text: label, cls: 'tg-heatmap-weekday' });
		});

		this.content = body.createDiv('tg-heatmap-content');
		this.monthLabels = this.content.createDiv('tg-heatmap-month-labels');
		this.grid = this.content.createDiv('tg-heatmap-week-grid');

		const legend = this.container.createDiv('tg-heatmap-legend');
		legend.createSpan({ text: '少', cls: 'tg-heatmap-legend-label' });
		for (let level = 0; level <= 4; level++) {
			const swatch = legend.createSpan({ cls: `tg-heatmap-legend-swatch level-${level}` });
			swatch.setAttr('aria-hidden', 'true');
		}
		legend.createSpan({ text: '多', cls: 'tg-heatmap-legend-label' });

		this.tooltip = this.container.createDiv('tg-heatmap-tooltip');
		this.tooltip.hide();
	}

	update(now: Date): void {
		const minuteKey = `${getDailyNoteFilename(now)}-${now.getHours()}-${now.getMinutes()}`;
		if (minuteKey === this.lastRenderedMinute || this.refreshInFlight) {
			return;
		}

		this.lastRenderedMinute = minuteKey;
		this.refreshInFlight = true;
		void this.refresh(now).finally(() => {
			this.refreshInFlight = false;
		});
	}

	private async refresh(now: Date): Promise<void> {
		const days = getVisibleDates(now);
		const heatmapDays: HeatmapDay[] = [];
		let totalMs = 0;
		let activeDays = 0;

		for (const date of days) {
			const dateKey = getDailyNoteFilename(date);
			const durationMs = await this.getDurationForDate(date, now);
			const isToday = isSameDate(date, now);
			const isFuture = startOfDay(date).getTime() > startOfDay(now).getTime();
			if (durationMs > 0) {
				activeDays++;
				totalMs += durationMs;
			}
			heatmapDays.push({
				date,
				dateKey,
				durationMs,
				level: getLevel(durationMs),
				intensity: getIntensity(durationMs),
				isToday,
				isFuture,
			});
		}

		this.render(now, heatmapDays, totalMs, activeDays);
	}

	private async getDurationForDate(date: Date, now: Date): Promise<number> {
		const file = getDailyNoteFileForDate(this.app, date);
		if (!(file instanceof TFile)) {
			return 0;
		}

		const cached = this.fileCache.get(file.path);
		let content = cached?.content;
		if (!cached || cached.mtime !== file.stat.mtime) {
			content = await this.app.vault.read(file);
			this.fileCache.set(file.path, { mtime: file.stat.mtime, content });
		}

		const data = extractSimpleTimeTracker(content ?? '');
		const referenceNow = isSameDate(date, now) ? now : endOfDay(date);
		return aggregateDurations(data, referenceNow).reduce((sum, item) => sum + item.durationMs, 0);
	}

	private render(now: Date, days: HeatmapDay[], totalMs: number, activeDays: number): void {
		this.monthLabels.empty();
		this.grid.empty();
		this.monthLabels.setAttr('style', `grid-template-columns: repeat(${WEEKS_TO_SHOW}, 10px);`);
		this.summary.textContent = `${WEEKS_TO_SHOW}周 · ${activeDays}天 · ${formatDuration(totalMs)}`;
		let todayCell: HTMLElement | null = null;
		let todayDateKey = '';

		getMonthLabels(now).forEach(({ label, week }) => {
			const monthEl = this.monthLabels.createDiv({ text: label, cls: 'tg-heatmap-month-label' });
			monthEl.setAttr('style', `grid-column: ${week + 1};`);
		});

		for (let week = 0; week < WEEKS_TO_SHOW; week++) {
			const column = this.grid.createDiv('tg-heatmap-week-column');
			for (let day = 0; day < 7; day++) {
				const dayData = days[week * 7 + day];
				const cell = column.createDiv(`tg-heatmap-cell level-${dayData.level}`);
				cell.setAttr('style', `--tg-intensity: ${dayData.intensity}%;`);
				cell.setAttr('aria-label', `${dayData.dateKey} 记录 ${formatDuration(dayData.durationMs)}`);
				cell.addEventListener('mouseenter', (event) => this.showTooltip(event, dayData));
				cell.addEventListener('mousemove', (event) => this.moveTooltip(event));
				cell.addEventListener('mouseleave', () => this.hideTooltip());

				if (dayData.isToday) {
					cell.addClass('today');
					todayCell = cell;
					todayDateKey = dayData.dateKey;
				}
				if (dayData.isFuture) {
					cell.addClass('future');
				}
				if (this.onDateClick) {
					cell.addClass('tg-clickable');
					cell.addEventListener('click', () => this.onDateClick?.(dayData.date));
				}
			}
		}

		this.scrollToToday(todayCell, todayDateKey);
	}

	private scrollToToday(todayCell: HTMLElement | null, todayDateKey: string): void {
		if (!todayCell || !todayDateKey || this.lastAutoScrollDateKey === todayDateKey) {
			return;
		}

		this.lastAutoScrollDateKey = todayDateKey;
		window.requestAnimationFrame(() => {
			if (this.content.scrollWidth <= this.content.clientWidth) {
				this.content.scrollLeft = 0;
				return;
			}

			const contentRect = this.content.getBoundingClientRect();
			const cellRect = todayCell.getBoundingClientRect();
			const centeredOffset = (this.content.clientWidth - cellRect.width) / 2;
			const target = this.content.scrollLeft + (cellRect.left - contentRect.left) - centeredOffset;
			const maxScroll = this.content.scrollWidth - this.content.clientWidth;
			this.content.scrollLeft = Math.max(0, Math.min(target, maxScroll));
		});
	}

	private showTooltip(event: MouseEvent, dayData: HeatmapDay): void {
		this.tooltip.empty();
		this.tooltip.createEl('strong', { text: dayData.dateKey });
		this.tooltip.createDiv({ text: `记录 ${formatDuration(dayData.durationMs)}` });
		this.tooltip.show();
		this.moveTooltip(event);
	}

	private moveTooltip(event: MouseEvent): void {
		this.tooltip.setAttr('style', `left: ${event.clientX + 12}px; top: ${event.clientY + 12}px;`);
	}

	private hideTooltip(): void {
		this.tooltip.hide();
	}
}

function getVisibleDates(now: Date): Date[] {
	const weekStart = getStartOfWeek(now);
	const dates: Date[] = [];
	for (let week = 0; week < WEEKS_TO_SHOW; week++) {
		for (let day = 0; day < 7; day++) {
			const date = new Date(weekStart);
			date.setDate(weekStart.getDate() + (week - (WEEKS_TO_SHOW - 1)) * 7 + day);
			dates.push(date);
		}
	}
	return dates;
}

function getMonthLabels(now: Date): Array<{ label: string; week: number }> {
	const labels: Array<{ label: string; week: number }> = [];
	let lastMonth = -1;
	for (let week = 0; week < WEEKS_TO_SHOW; week++) {
		const weekStart = getStartOfWeek(now);
		weekStart.setDate(weekStart.getDate() + (week - (WEEKS_TO_SHOW - 1)) * 7);
		const month = weekStart.getMonth();
		if (month !== lastMonth && weekStart.getDate() <= 7) {
			labels.push({ label: `${month + 1}月`, week });
			lastMonth = month;
		}
	}
	return labels;
}

function getStartOfWeek(date: Date): Date {
	const result = startOfDay(date);
	const dayIndex = result.getDay() === 0 ? 6 : result.getDay() - 1;
	result.setDate(result.getDate() - dayIndex);
	return result;
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isSameDate(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();
}

function getLevel(durationMs: number): number {
	if (durationMs <= 0) {
		return 0;
	}
	if (durationMs < LEVEL_STOPS[0]) {
		return 1;
	}
	if (durationMs < LEVEL_STOPS[1]) {
		return 2;
	}
	if (durationMs < LEVEL_STOPS[2]) {
		return 3;
	}
	return 4;
}

function getIntensity(durationMs: number): number {
	if (durationMs <= 0) {
		return 0;
	}
	return Math.min(100, Math.round((durationMs / LEVEL_STOPS[3]) * 100));
}

function formatDuration(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0 && minutes > 0) {
		return `${hours}h ${minutes}m`;
	}
	if (hours > 0) {
		return `${hours}h`;
	}
	return `${minutes}m`;
}
