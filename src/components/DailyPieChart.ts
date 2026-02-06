import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import { aggregateDurations, extractSimpleTimeTracker } from '../utils/dailyNotesParser';
import { getDailyNoteFileForDate } from '../utils/dailyNotes';

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

export class DailyPieChart {
	private app: App;
	private container: HTMLElement;
	private chartWrap: HTMLElement;
	private legend: HTMLElement;
	private emptyState: HTMLElement;
	private lastFilePath: string | null = null;
	private lastMtime = 0;

	constructor(parent: HTMLElement, app: App) {
		this.app = app;
		this.container = parent.createDiv('time-grid-module tg-pie-module');

		const header = this.container.createDiv('module-header');
		header.createSpan({ text: '今日计时分布', cls: 'module-title' });
		appendIcon(header, 'pie');

		const body = this.container.createDiv('tg-pie-body');
		this.chartWrap = body.createDiv('tg-pie-chart');
		this.legend = body.createDiv('tg-pie-legend');
		this.emptyState = this.container.createDiv('tg-pie-empty');
		this.emptyState.textContent = '今日暂无计时记录';
		this.emptyState.hide();
	}

	update(now: Date): void {
		void this.refresh(now);
	}

	private async refresh(now: Date): Promise<void> {
		const file = getDailyNoteFileForDate(this.app, now);
		if (!(file instanceof TFile)) {
			this.renderEmpty();
			return;
		}

		const filePath = file.path;
		if (this.lastFilePath === filePath && this.lastMtime === file.stat.mtime) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastMtime = file.stat.mtime;

		const content = await this.app.vault.read(file);
		const data = extractSimpleTimeTracker(content);
		const buckets = aggregateDurations(data, now);
		this.renderChart(buckets);
	}

	private renderEmpty(): void {
		this.chartWrap.empty();
		this.legend.empty();
		this.emptyState.show();
	}

	private renderChart(buckets: Array<{ name: string; durationMs: number }>): void {
		this.chartWrap.empty();
		this.legend.empty();

		if (buckets.length === 0) {
			this.renderEmpty();
			return;
		}

		this.emptyState.hide();

		const dayMs = 24 * 60 * 60 * 1000;
		const totalRecorded = buckets.reduce((sum, item) => sum + item.durationMs, 0);
		const remainderMs = Math.max(0, dayMs - totalRecorded);
		const scale = totalRecorded > dayMs ? dayMs / totalRecorded : 1;
		const totalForPie = totalRecorded > dayMs ? dayMs : totalRecorded + remainderMs;

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 120 120');
		svg.classList.add('tg-pie');

		const legendRows: HTMLElement[] = [];
		let currentAngle = 0;
		buckets.forEach((item, index) => {
			const pieDuration = item.durationMs * scale;
			const ratio = pieDuration / totalForPie;
			const percent = (pieDuration / dayMs) * 100;
			const angle = ratio * 360;
			const startAngle = currentAngle;
			const endAngle = currentAngle + angle;
			currentAngle = endAngle;

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', describeArc(60, 60, 48, startAngle, endAngle));
			path.setAttribute('class', `tg-pie-slice ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`);
			path.setAttribute('data-legend-index', String(index));
			const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
			title.textContent = `${item.name} · ${formatDuration(item.durationMs)} · ${formatPercent(percent)}`;
			path.appendChild(title);
			svg.appendChild(path);
		});

		if (remainderMs > 0) {
			const ratio = remainderMs / totalForPie;
			const percent = (remainderMs / dayMs) * 100;
			const angle = ratio * 360;
			const startAngle = currentAngle;
			const endAngle = currentAngle + angle;
			currentAngle = endAngle;

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', describeArc(60, 60, 48, startAngle, endAngle));
			path.setAttribute('class', 'tg-pie-slice tg-pie-slice-muted');
			path.setAttribute('data-legend-index', String(buckets.length));
			const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
			title.textContent = `未记录 · ${formatDuration(remainderMs)} · ${formatPercent(percent)}`;
			path.appendChild(title);
			svg.appendChild(path);
		}

		this.chartWrap.appendChild(svg);

		buckets.forEach((item, index) => {
			const row = this.legend.createDiv(`tg-pie-legend-row tg-pie-legend-color-${index % COLOR_CLASSES.length}`);
			row.setAttr('data-legend-index', String(index));
			const swatch = row.createDiv(`tg-pie-legend-swatch ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`);
			swatch.setAttr('aria-hidden', 'true');
			row.createDiv('tg-pie-legend-label').textContent = item.name;
			row.createDiv('tg-pie-legend-value').textContent = formatDuration(item.durationMs);
			row.createDiv('tg-pie-legend-percent').textContent = formatPercent((item.durationMs / dayMs) * 100);
			legendRows.push(row);
		});

		if (remainderMs > 0) {
			const row = this.legend.createDiv('tg-pie-legend-row tg-pie-legend-color-muted');
			row.setAttr('data-legend-index', String(buckets.length));
			const swatch = row.createDiv('tg-pie-legend-swatch tg-pie-slice-muted');
			swatch.setAttr('aria-hidden', 'true');
			row.createDiv('tg-pie-legend-label').textContent = '未记录';
			row.createDiv('tg-pie-legend-value').textContent = formatDuration(remainderMs);
			row.createDiv('tg-pie-legend-percent').textContent = formatPercent((remainderMs / dayMs) * 100);
			legendRows.push(row);
		}

		const setActive = (index: number | null) => {
			legendRows.forEach((row, rowIndex) => {
				if (index === rowIndex) {
					row.classList.add('tg-pie-legend-row-active');
				} else {
					row.classList.remove('tg-pie-legend-row-active');
				}
			});
		};

		const paths = svg.querySelectorAll('path[data-legend-index]');
		paths.forEach((path) => {
			const index = Number(path.getAttribute('data-legend-index'));
			path.addEventListener('mouseenter', () => setActive(index));
			path.addEventListener('mouseleave', () => setActive(null));
		});
	}
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
	const radians = (angle - 90) * Math.PI / 180;
	return {
		x: cx + r * Math.cos(radians),
		y: cy + r * Math.sin(radians),
	};
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
	if (endAngle - startAngle >= 360) {
		return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
	}
	const start = polarToCartesian(cx, cy, r, endAngle);
	const end = polarToCartesian(cx, cy, r, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function formatPercent(value: number): string {
	return `${Math.max(0, value).toFixed(0)}%`;
}
