import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import { aggregateDurations, extractSimpleTimeTracker, getDailyNoteFilename } from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';
import {
	HEATMAP_RANGES,
	HeatmapMode,
	HeatmapRangeKey,
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
	level: number;
	isToday: boolean;
	isFuture: boolean;
};

const MODE_LABELS: Record<HeatmapMode, string> = {
	words: '字数',
	time: '时间',
};

const RANGE_ORDER: HeatmapRangeKey[] = ['3m', '6m', '1y'];
const MODE_ORDER: HeatmapMode[] = ['words', 'time'];

export class TimeHeatmap {
	private app: App;
	private writingStats: WritingStatsTracker;
	private container: HTMLElement;
	private controls: HTMLElement;
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
		appendIcon(header, 'month');
		if (this.onTitleClick) {
			header.addClass('tg-clickable');
			header.addEventListener('click', this.onTitleClick);
		}

		this.controls = this.container.createDiv('tg-heatmap-controls');

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
		const bar = legend.createDiv('tg-heatmap-legend-bar');
		for (let level = 0; level <= 4; level++) {
			const segment = bar.createSpan({ cls: `tg-heatmap-legend-segment level-${level}` });
			segment.setAttr('aria-hidden', 'true');
		}
		legend.createSpan({ text: '多', cls: 'tg-heatmap-legend-label' });

		this.tooltip = this.container.createDiv('tg-heatmap-tooltip');
		this.tooltip.hide();
		this.renderControls();
	}

	update(now: Date): void {
		const preferences = this.writingStats.getPreferences();
		const renderKey = `${getDailyNoteFilename(now)}-${now.getHours()}-${now.getMinutes()}-${preferences.mode}-${preferences.range}-${this.writingStats.getRevision()}`;
		if (renderKey === this.lastRenderedKey || this.refreshInFlight) {
			return;
		}

		this.lastRenderedKey = renderKey;
		this.refreshInFlight = true;
		void this.refresh(now).finally(() => {
			this.refreshInFlight = false;
		});
	}

	private renderControls(): void {
		this.controls.empty();
		this.createSegmentedControl(
			MODE_ORDER,
			this.writingStats.getPreferences().mode,
			(value) => MODE_LABELS[value],
			(mode) => this.updatePreferences({ mode })
		);
		this.createSegmentedControl(
			RANGE_ORDER,
			this.writingStats.getPreferences().range,
			(value) => HEATMAP_RANGES[value].label.replace('近', ''),
			(range) => this.updatePreferences({ range })
		);
	}

	private createSegmentedControl<T extends string>(
		values: T[],
		activeValue: T,
		getLabel: (value: T) => string,
		onSelect: (value: T) => void
	): void {
		const group = this.controls.createDiv('tg-segmented');
		values.forEach((value) => {
			const button = group.createEl('button', { text: getLabel(value), cls: 'tg-segmented-button' });
			button.type = 'button';
			if (value === activeValue) {
				button.addClass('active');
			}
			button.addEventListener('click', (event) => {
				event.stopPropagation();
				onSelect(value);
			});
		});
	}

	private updatePreferences(preferences: Partial<{ mode: HeatmapMode; range: HeatmapRangeKey }>): void {
		this.lastRenderedKey = '';
		this.lastAutoScrollKey = '';
		void this.writingStats.setPreferences(preferences).then(() => {
			this.renderControls();
			this.update(new Date());
		});
	}

	private async refresh(now: Date): Promise<void> {
		const preferences = this.writingStats.getPreferences();
		const range = HEATMAP_RANGES[preferences.range];
		const days = getVisibleDates(now, range.weeks);
		const rawValues: Array<{ date: Date; dateKey: string; value: number; isToday: boolean; isFuture: boolean }> = [];
		let total = 0;
		let activeDays = 0;
		let maxValue = 0;

		for (const date of days) {
			const dateKey = getDailyNoteFilename(date);
			const value = await this.getValueForDate(date, now, preferences.mode);
			const isToday = isSameDate(date, now);
			const isFuture = startOfDay(date).getTime() > startOfDay(now).getTime();
			if (value > 0) {
				activeDays++;
				total += value;
				maxValue = Math.max(maxValue, value);
			}
			rawValues.push({ date, dateKey, value, isToday, isFuture });
		}

		const heatmapDays = rawValues.map((item) => ({
			...item,
			level: getLevel(item.value, maxValue),
		}));

		this.render(now, heatmapDays, activeDays, total, preferences.mode, preferences.range);
	}

	private async getValueForDate(date: Date, now: Date, mode: HeatmapMode): Promise<number> {
		if (mode === 'words') {
			return this.writingStats.getWordCountForDate(getDailyNoteFilename(date));
		}
		return this.getDurationForDate(date, now);
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
		activeDays: number,
		total: number,
		mode: HeatmapMode,
		rangeKey: HeatmapRangeKey
	): void {
		const range = HEATMAP_RANGES[rangeKey];
		this.monthLabels.empty();
		this.grid.empty();
		this.monthLabels.setAttr('style', `grid-template-columns: repeat(${range.weeks}, 10px);`);
		this.summary.textContent = `${range.label}(${range.weeks}周) · ${activeDays}天 · ${formatTotalValue(total, mode)}`;
		let todayCell: HTMLElement | null = null;
		let todayDateKey = '';

		getMonthLabels(now, range.weeks).forEach(({ label, week }) => {
			const monthEl = this.monthLabels.createDiv({ text: label, cls: 'tg-heatmap-month-label' });
			monthEl.setAttr('style', `grid-column: ${week + 1};`);
		});

		for (let week = 0; week < range.weeks; week++) {
			const column = this.grid.createDiv('tg-heatmap-week-column');
			for (let day = 0; day < 7; day++) {
				const dayData = days[week * 7 + day];
				const cell = column.createDiv(`tg-heatmap-cell level-${dayData.level}`);
				cell.setAttr('aria-label', `${dayData.dateKey} ${formatTooltipValue(dayData.value, mode)}`);
				cell.addEventListener('mouseenter', (event) => this.showTooltip(event, dayData, mode));
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

		this.scrollToToday(todayCell, `${rangeKey}-${todayDateKey}`);
	}

	private scrollToToday(todayCell: HTMLElement | null, todayKey: string): void {
		if (!todayCell || !todayKey || this.lastAutoScrollKey === todayKey) {
			return;
		}

		this.lastAutoScrollKey = todayKey;
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

	private showTooltip(event: MouseEvent, dayData: HeatmapDay, mode: HeatmapMode): void {
		this.tooltip.empty();
		this.tooltip.createEl('strong', { text: dayData.dateKey });
		this.tooltip.createDiv({ text: formatTooltipValue(dayData.value, mode) });
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

function formatTotalValue(value: number, mode: HeatmapMode): string {
	if (mode === 'words') {
		return `${Math.round(value).toLocaleString()}字`;
	}
	return formatDuration(value);
}

function formatTooltipValue(value: number, mode: HeatmapMode): string {
	if (mode === 'words') {
		return `新增 ${Math.round(value).toLocaleString()}字`;
	}
	return `记录 ${formatDuration(value)}`;
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
