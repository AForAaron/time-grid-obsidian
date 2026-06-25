import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import { aggregateDurations, extractSimpleTimeTracker, getDailyNoteFilename } from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';
import {
	HEATMAP_RANGES,
	WritingStatsTracker,
} from '../utils/writingStats';

export type TimeHeatmapOptions = {
	onTitleClick?: () => void;
	onDateClick?: (date: Date) => void;
};

type HeatmapDay = {
	date: Date;
	dateKey: string;
	value: number;
	wordCount: number;
	level: number;
	isToday: boolean;
	isFuture: boolean;
};

const FIXED_RANGE_KEY = '6m';
const FIXED_RANGE = HEATMAP_RANGES[FIXED_RANGE_KEY];

export class TimeHeatmap {
	private app: App;
	private writingStats: WritingStatsTracker;
	private container: HTMLElement;
	private content: HTMLElement;
	private grid: HTMLElement;
	private monthLabels: HTMLElement;
	private summary: HTMLElement;
	private tooltip: HTMLElement;
	private onTitleClick?: () => void;
	private onDateClick?: (date: Date) => void;
	private lastRenderedKey = '';
	private lastAutoScrollKey = '';
	private refreshInFlight = false;
	private fileCache = new Map<string, { mtime: number; content: string }>();

	constructor(parent: HTMLElement, app: App, writingStats: WritingStatsTracker, options?: TimeHeatmapOptions) {
		this.app = app;
		this.writingStats = writingStats;
		this.container = parent.createDiv('tg-module tg-time-heatmap');
		this.onTitleClick = options?.onTitleClick;
		this.onDateClick = options?.onDateClick;

		const header = this.container.createDiv('tg-module-header tg-heatmap-header');
		const titleWrap = header.createDiv('tg-module-heading');
		titleWrap.createSpan({ text: '活动热力图', cls: 'tg-module-title' });
		this.summary = titleWrap.createSpan({ cls: 'tg-heatmap-summary' });
		const actions = header.createDiv('tg-heatmap-actions');
		this.createNavButton(actions, 'chevronLeft', '向左查看更早日期', -1);
		this.createNavButton(actions, 'chevronRight', '向右查看更近日期', 1);
		appendIcon(actions, 'month');
		if (this.onTitleClick) {
			header.addClass('tg-clickable');
			header.addEventListener('click', this.onTitleClick);
		}

		const body = this.container.createDiv('tg-heatmap-body');
		const weekLabels = body.createDiv('tg-heatmap-weekdays');
		['一', '', '三', '', '五', '', '日'].forEach(label => {
			const weekday = weekLabels.createDiv({ text: label, cls: 'tg-heatmap-weekday' });
			if (!label) {
				weekday.addClass('is-empty');
			}
		});

		this.content = body.createDiv('tg-heatmap-content');
		this.monthLabels = this.content.createDiv('tg-heatmap-month-labels');
		this.grid = this.content.createDiv('tg-heatmap-week-grid');

		const legend = this.container.createDiv('tg-heatmap-legend');
		legend.createSpan({ text: '少', cls: 'tg-heatmap-legend-label' });
		const bar = legend.createDiv('tg-heatmap-legend-bar');
		for (let level = 0; level <= 4; level++) {
			const segment = bar.createSpan({ cls: `tg-heatmap-legend-segment level-${level}` });
			segment.setAttr('aria-hidden', 'true');
		}
		legend.createSpan({ text: '多', cls: 'tg-heatmap-legend-label' });

		this.tooltip = this.container.createDiv('tg-heatmap-tooltip');
		this.tooltip.hide();
	}

	update(now: Date): void {
		const renderKey = `${getDailyNoteFilename(now)}-${now.getHours()}-${now.getMinutes()}-${this.writingStats.getRevision()}`;
		if (renderKey === this.lastRenderedKey || this.refreshInFlight) {
			return;
		}

		this.lastRenderedKey = renderKey;
		this.refreshInFlight = true;
		void this.refresh(now).finally(() => {
			this.refreshInFlight = false;
		});
	}

	private async refresh(now: Date): Promise<void> {
		const days = getVisibleDates(now, FIXED_RANGE.weeks);
		const rawValues: Array<{ date: Date; dateKey: string; value: number; wordCount: number; isToday: boolean; isFuture: boolean }> = [];
		let totalDuration = 0;
		let totalWords = 0;
		let timeActiveDays = 0;
		let maxValue = 0;

		for (const date of days) {
			const dateKey = getDailyNoteFilename(date);
			const value = await this.getDurationForDate(date, now);
			const wordCount = this.writingStats.getWordCountForDate(dateKey);
			const isToday = isSameDate(date, now);
			const isFuture = startOfDay(date).getTime() > startOfDay(now).getTime();
			totalWords += wordCount;
			if (value > 0) {
				timeActiveDays++;
				totalDuration += value;
				maxValue = Math.max(maxValue, value);
			}
			rawValues.push({ date, dateKey, value, wordCount, isToday, isFuture });
		}

		const heatmapDays = rawValues.map((item) => ({
			...item,
			level: getLevel(item.value, maxValue),
		}));

		this.render(now, heatmapDays, timeActiveDays, totalDuration, totalWords);
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

	private render(
		now: Date,
		days: HeatmapDay[],
		timeActiveDays: number,
		totalDuration: number,
		totalWords: number
	): void {
		this.monthLabels.empty();
		this.grid.empty();
		this.monthLabels.setAttr('style', `grid-template-columns: repeat(${FIXED_RANGE.weeks}, var(--tg-heatmap-cell-size));`);
		this.summary.textContent =
			`${FIXED_RANGE.label}(${FIXED_RANGE.weeks}周) · 计时 ${timeActiveDays}天 / ${formatDuration(totalDuration)} · 净增 ${formatWords(totalWords)}`;
		let todayCell: HTMLElement | null = null;
		let todayDateKey = '';

		getMonthLabels(now, FIXED_RANGE.weeks).forEach(({ label, week }) => {
			const monthEl = this.monthLabels.createDiv({ text: label, cls: 'tg-heatmap-month-label' });
			monthEl.setAttr('style', `grid-column: ${week + 1};`);
		});

		for (let week = 0; week < FIXED_RANGE.weeks; week++) {
			const column = this.grid.createDiv('tg-heatmap-week-column');
			for (let day = 0; day < 7; day++) {
				const dayData = days[week * 7 + day];
				const cell = column.createDiv(`tg-heatmap-cell level-${dayData.level}`);
				cell.setAttr('aria-label', `${dayData.dateKey} ${formatTooltipValue(dayData.value, dayData.wordCount)}`);
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

		this.scrollToToday(todayCell, `${FIXED_RANGE_KEY}-${todayDateKey}`);
	}

	private createNavButton(parent: HTMLElement, icon: 'chevronLeft' | 'chevronRight', label: string, direction: -1 | 1): void {
		const button = parent.createEl('button', {
			cls: 'tg-heatmap-nav-button',
			attr: {
				type: 'button',
				'aria-label': label,
			},
		});
		appendIcon(button, icon);
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			this.scrollCalendar(direction);
		});
	}

	private scrollCalendar(direction: -1 | 1): void {
		const maxScroll = Math.max(0, this.content.scrollWidth - this.content.clientWidth);
		if (maxScroll <= 0) {
			return;
		}

		const step = Math.max(72, Math.floor(this.content.clientWidth * 0.75));
		const target = Math.max(0, Math.min(this.content.scrollLeft + direction * step, maxScroll));
		this.content.scrollTo({ left: target, behavior: 'smooth' });
	}

	private scrollToToday(todayCell: HTMLElement | null, todayKey: string, attempt = 0): void {
		if (!todayCell || !todayKey || this.lastAutoScrollKey === todayKey) {
			return;
		}

		this.lastAutoScrollKey = todayKey;
		window.requestAnimationFrame(() => {
			if (!this.content.isConnected || !todayCell.isConnected) {
				return;
			}

			const cellRect = todayCell.getBoundingClientRect();
			if ((this.content.clientWidth <= 0 || cellRect.width <= 0) && attempt < 2) {
				this.lastAutoScrollKey = '';
				window.setTimeout(() => this.scrollToToday(todayCell, todayKey, attempt + 1), 50);
				return;
			}

			const maxScroll = this.content.scrollWidth - this.content.clientWidth;
			if (maxScroll <= 0) {
				this.content.scrollLeft = 0;
				return;
			}

			const contentRect = this.content.getBoundingClientRect();
			const centeredOffset = (this.content.clientWidth - cellRect.width) / 2;
			const target = this.content.scrollLeft + (cellRect.left - contentRect.left) - centeredOffset;
			this.content.scrollLeft = Math.max(0, Math.min(target, maxScroll));
		});
	}

	private showTooltip(event: MouseEvent, dayData: HeatmapDay): void {
		this.tooltip.empty();
		this.tooltip.createEl('strong', { text: dayData.dateKey });
		this.tooltip.createDiv({ text: formatTooltipValue(dayData.value, dayData.wordCount) });
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

function getVisibleDates(now: Date, weeksToShow: number): Date[] {
	const weekStart = getStartOfWeek(now);
	const dates: Date[] = [];
	for (let week = 0; week < weeksToShow; week++) {
		for (let day = 0; day < 7; day++) {
			const date = new Date(weekStart);
			date.setDate(weekStart.getDate() + (week - (weeksToShow - 1)) * 7 + day);
			dates.push(date);
		}
	}
	return dates;
}

function getMonthLabels(now: Date, weeksToShow: number): Array<{ label: string; week: number }> {
	const labels: Array<{ label: string; week: number }> = [];
	let lastMonth = -1;
	for (let week = 0; week < weeksToShow; week++) {
		const weekStart = getStartOfWeek(now);
		weekStart.setDate(weekStart.getDate() + (week - (weeksToShow - 1)) * 7);
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

function getLevel(value: number, maxValue: number): number {
	if (value <= 0 || maxValue <= 0) {
		return 0;
	}
	return Math.max(1, Math.min(4, Math.ceil((value / maxValue) * 4)));
}

function formatWords(value: number): string {
	return `${Math.round(value).toLocaleString()}字`;
}

function formatTooltipValue(value: number, wordCount: number): string {
	return `记录 ${formatDuration(value)} · 净增 ${formatWords(wordCount)}`;
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
