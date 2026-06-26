import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import {
	aggregateDurations,
	DurationBucket,
	getDailyNoteFilename,
	parseSimpleTimeTracker,
} from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';

const DAY_MS = 24 * 60 * 60 * 1000;
const RING_RADIUS = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const MAX_TASK_ROWS = 5;

const COLOR_CLASSES = [
	'tg-pie-slice-0',
	'tg-pie-slice-1',
	'tg-pie-slice-2',
	'tg-pie-slice-3',
	'tg-pie-slice-4',
	'tg-pie-slice-5',
	'tg-pie-slice-6',
	'tg-pie-slice-7',
];

type DailyPieStatus = 'ready' | 'no-diary' | 'no-tracker' | 'invalid' | 'no-entries';

type DisplayBucket = DurationBucket & {
	key: string;
	colorClass: string;
};

export class DailyPieChart {
	private app: App;
	private container: HTMLElement;
	private chartWrap: HTMLElement;
	private legend: HTMLElement;
	private statusLine: HTMLElement;
	private lastFilePath: string | null = null;
	private lastMtime = 0;
	private cachedContent: string | null = null;
	private lastRenderKey = '';
	private refreshInFlight = false;

	constructor(parent: HTMLElement, app: App) {
		this.app = app;
		this.container = parent.createDiv('tg-module tg-pie-module');

		const header = this.container.createDiv('tg-module-header');
		header.createSpan({ text: '今日计时分布', cls: 'tg-module-title' });
		appendIcon(header, 'pie');

		const body = this.container.createDiv('tg-pie-body');
		this.chartWrap = body.createDiv('tg-pie-chart');
		this.legend = body.createDiv('tg-pie-legend');
		this.statusLine = body.createDiv('tg-pie-status');
	}

	update(now: Date): void {
		if (this.refreshInFlight) {
			return;
		}
		this.refreshInFlight = true;
		void this.refresh(now).finally(() => {
			this.refreshInFlight = false;
		});
	}

	private async refresh(now: Date): Promise<void> {
		const dateKey = getDailyNoteFilename(now);
		const file = getDailyNoteFileForDate(this.app, now);
		if (!(file instanceof TFile)) {
			this.lastFilePath = null;
			this.lastMtime = 0;
			this.cachedContent = null;
			this.renderIfNeeded('no-diary', [], dateKey, 'no-file');
			return;
		}

		const content = await this.getFileContent(file);
		const parsed = parseSimpleTimeTracker(content);
		if (parsed.status === 'missing') {
			this.renderIfNeeded('no-tracker', [], dateKey, `${file.path}-${file.stat.mtime}-missing`);
			return;
		}
		if (parsed.status === 'invalid') {
			this.renderIfNeeded('invalid', [], dateKey, `${file.path}-${file.stat.mtime}-invalid`);
			return;
		}

		const buckets = aggregateDurations(parsed.data, now, startOfDay(now), endOfDay(now));
		const status: DailyPieStatus = buckets.length > 0 ? 'ready' : 'no-entries';
		const hasRunningEntry = buckets.some((bucket) => bucket.isRunning);
		const tickingKey = hasRunningEntry ? String(Math.floor(now.getTime() / 1000)) : 'static';
		this.renderIfNeeded(status, buckets, dateKey, `${file.path}-${file.stat.mtime}-${status}-${tickingKey}`);
	}

	private async getFileContent(file: TFile): Promise<string> {
		if (this.lastFilePath === file.path && this.lastMtime === file.stat.mtime && this.cachedContent !== null) {
			return this.cachedContent;
		}
		this.lastFilePath = file.path;
		this.lastMtime = file.stat.mtime;
		this.cachedContent = await this.app.vault.read(file);
		return this.cachedContent;
	}

	private renderIfNeeded(status: DailyPieStatus, buckets: DurationBucket[], dateKey: string, key: string): void {
		const renderKey = `${dateKey}-${key}`;
		if (renderKey === this.lastRenderKey) {
			return;
		}
		this.lastRenderKey = renderKey;
		this.render(status, buckets);
	}

	private render(status: DailyPieStatus, buckets: DurationBucket[]): void {
		this.chartWrap.empty();
		this.legend.empty();
		this.statusLine.empty();

		const hasData = status === 'ready' && buckets.length > 0;
		const displayBuckets = hasData ? getDisplayBuckets(buckets) : [];
		const totalRecorded = hasData ? buckets.reduce((sum, item) => sum + item.durationMs, 0) : 0;
		const remainderMs = Math.max(0, DAY_MS - totalRecorded);
		const scale = totalRecorded > DAY_MS ? DAY_MS / totalRecorded : 1;
		const runningCount = buckets.filter((bucket) => bucket.isRunning).length;

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 144 144');
		svg.classList.add('tg-pie');
		svg.appendChild(createRingCircle(hasData ? 'tg-pie-ring-track' : 'tg-pie-ring-empty'));

		if (hasData) {
			const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			group.setAttribute('transform', 'rotate(-90 72 72)');
			let offset = 0;
			displayBuckets.forEach((bucket) => {
				const rawLength = (bucket.durationMs * scale / DAY_MS) * RING_CIRCUMFERENCE;
				const gap = displayBuckets.length > 1 ? 2.5 : 0;
				const segmentLength = Math.max(0.75, Math.min(RING_CIRCUMFERENCE, rawLength - gap));
				const circle = createRingCircle(`tg-pie-ring-segment ${bucket.colorClass}`);
				circle.setAttribute('stroke-dasharray', `${segmentLength.toFixed(2)} ${(RING_CIRCUMFERENCE - segmentLength).toFixed(2)}`);
				circle.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
				circle.setAttribute('data-legend-key', bucket.key);
				const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
				title.textContent = `${bucket.name} · ${formatDuration(bucket.durationMs, bucket.isRunning)} · ${formatPercent(bucket.durationMs / DAY_MS * 100)}`;
				circle.appendChild(title);
				group.appendChild(circle);
				offset += rawLength;
			});
			svg.appendChild(group);
		}

		this.chartWrap.appendChild(svg);
		const center = this.chartWrap.createDiv('tg-pie-center');
		center.createDiv('tg-pie-center-value').textContent = formatDuration(totalRecorded, runningCount > 0);
		center.createDiv('tg-pie-center-label').textContent = hasData ? '已记录' : '今日暂无记录';

		const rows: HTMLElement[] = [];
		const segments = Array.from(svg.querySelectorAll<SVGCircleElement>('[data-legend-key]'));
		displayBuckets.forEach((bucket) => {
			rows.push(this.renderLegendRow(bucket));
		});
		if (!hasData || remainderMs > 0) {
			rows.push(this.renderLegendRow({
				key: '__unrecorded',
				name: '未记录',
				durationMs: hasData ? remainderMs : DAY_MS,
				isRunning: false,
				colorClass: 'tg-pie-slice-muted',
			}));
		}
		this.bindHover(rows, segments);
		this.renderStatus(status, buckets.length, runningCount);
	}

	private renderLegendRow(bucket: DisplayBucket): HTMLElement {
		const row = this.legend.createDiv('tg-pie-legend-row');
		row.setAttr('data-legend-key', bucket.key);
		const swatch = row.createSpan({ cls: `tg-pie-legend-swatch ${bucket.colorClass}` });
		swatch.setAttr('aria-hidden', 'true');

		const label = row.createDiv('tg-pie-legend-label');
		label.createSpan({ text: bucket.name, cls: 'tg-pie-legend-name' });
		if (bucket.isRunning) {
			const running = label.createSpan({ cls: 'tg-pie-running-badge' });
			running.createSpan('tg-pie-running-dot');
			running.createSpan({ text: '进行中' });
		}

		row.createDiv('tg-pie-legend-value').textContent = formatDuration(bucket.durationMs, bucket.isRunning);
		row.createDiv('tg-pie-legend-percent').textContent = formatPercent(bucket.durationMs / DAY_MS * 100);

		const bar = row.createDiv('tg-pie-legend-bar');
		const fill = bar.createDiv(`tg-pie-legend-bar-fill ${bucket.colorClass}`);
		fill.setAttr('style', `width: ${formatBarWidth(bucket.durationMs)};`);
		return row;
	}

	private bindHover(rows: HTMLElement[], segments: SVGCircleElement[]): void {
		const setActive = (key: string | null) => {
			rows.forEach((row) => {
				const matches = row.getAttribute('data-legend-key') === key;
				row.classList.toggle('tg-pie-legend-row-active', matches);
				row.classList.toggle('tg-pie-legend-row-dimmed', key !== null && !matches);
			});
			segments.forEach((segment) => {
				const matches = segment.getAttribute('data-legend-key') === key;
				segment.classList.toggle('tg-pie-ring-segment-active', matches);
				segment.classList.toggle('tg-pie-ring-segment-dimmed', key !== null && !matches);
			});
		};

		rows.forEach((row) => {
			const key = row.getAttribute('data-legend-key');
			row.addEventListener('mouseenter', () => setActive(key));
			row.addEventListener('mouseleave', () => setActive(null));
		});
		segments.forEach((segment) => {
			const key = segment.getAttribute('data-legend-key');
			segment.addEventListener('mouseenter', () => setActive(key));
			segment.addEventListener('mouseleave', () => setActive(null));
		});
	}

	private renderStatus(status: DailyPieStatus, count: number, runningCount: number): void {
		const text = getStatusText(status, count, runningCount);
		if (runningCount > 0) {
			this.statusLine.addClass('tg-pie-status-active');
			this.statusLine.createSpan('tg-pie-status-dot');
		} else {
			this.statusLine.removeClass('tg-pie-status-active');
		}
		this.statusLine.createSpan({ text });
	}
}

function createRingCircle(className: string): SVGCircleElement {
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', '72');
	circle.setAttribute('cy', '72');
	circle.setAttribute('r', String(RING_RADIUS));
	circle.setAttribute('fill', 'none');
	circle.setAttribute('class', className);
	return circle;
}

function getDisplayBuckets(buckets: DurationBucket[]): DisplayBucket[] {
	const sorted = [...buckets].sort((a, b) => b.durationMs - a.durationMs);
	const visible = sorted.slice(0, MAX_TASK_ROWS).map((bucket) => ({
		...bucket,
		key: bucket.name,
		colorClass: getColorClass(bucket.name),
	}));
	const remaining = sorted.slice(MAX_TASK_ROWS);
	if (remaining.length === 0) {
		return visible;
	}
	visible.push({
		key: '__other',
		name: '其他',
		durationMs: remaining.reduce((sum, item) => sum + item.durationMs, 0),
		isRunning: remaining.some((item) => item.isRunning),
		colorClass: 'tg-pie-slice-other',
	});
	return visible;
}

function getColorClass(name: string): string {
	let hash = 0;
	for (let index = 0; index < name.length; index++) {
		hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
	}
	return COLOR_CLASSES[hash % COLOR_CLASSES.length];
}

function getStatusText(status: DailyPieStatus, count: number, runningCount: number): string {
	if (status === 'ready') {
		return runningCount > 0 ? `${runningCount} 段进行中 · 实时更新` : `共 ${count} 段计时`;
	}
	if (status === 'no-diary') {
		return '今日还没有日记 · 创建后自动统计';
	}
	if (status === 'no-tracker') {
		return '日记中没有 simple-time-tracker 块';
	}
	if (status === 'invalid') {
		return 'simple-time-tracker 格式有误';
	}
	return '计时块中暂无有效记录';
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDuration(ms: number, includeSeconds = false): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (includeSeconds) {
		const paddedMinutes = String(minutes).padStart(2, '0');
		const paddedSeconds = String(seconds).padStart(2, '0');
		return hours > 0 ? `${hours}h ${paddedMinutes}m ${paddedSeconds}s` : `${minutes}m ${paddedSeconds}s`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function formatPercent(value: number): string {
	const percent = Math.max(0, value);
	if (percent >= 10 || percent === 0) {
		return `${Math.round(percent)}%`;
	}
	return `${Math.round(percent * 10) / 10}%`;
}

function formatBarWidth(ms: number): string {
	return `${Math.min(100, Math.max(0, ms / DAY_MS * 100)).toFixed(1)}%`;
}
