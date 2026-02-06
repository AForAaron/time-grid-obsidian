import { App, TFile } from 'obsidian';
import { appendIcon } from '../utils/icons';
import { aggregateDurations, extractSimpleTimeTracker, getDailyNotePath } from '../utils/dailyNotesParser';

const DAILY_NOTES_PATH = 'Daily Notes';

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
		const filePath = getDailyNotePath(DAILY_NOTES_PATH, now);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			this.renderEmpty();
			return;
		}

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

		let currentAngle = 0;
		buckets.forEach((item, index) => {
			const pieDuration = item.durationMs * scale;
			const ratio = pieDuration / totalForPie;
			const angle = ratio * 360;
			const startAngle = currentAngle;
			const endAngle = currentAngle + angle;
			currentAngle = endAngle;

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', describeArc(60, 60, 48, startAngle, endAngle));
			path.setAttribute('class', `tg-pie-slice ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`);
			svg.appendChild(path);
		});

		if (remainderMs > 0) {
			const ratio = remainderMs / totalForPie;
			const angle = ratio * 360;
			const startAngle = currentAngle;
			const endAngle = currentAngle + angle;
			currentAngle = endAngle;

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', describeArc(60, 60, 48, startAngle, endAngle));
			path.setAttribute('class', 'tg-pie-slice tg-pie-slice-muted');
			svg.appendChild(path);
		}

		this.chartWrap.appendChild(svg);

		buckets.forEach((item, index) => {
			const row = this.legend.createDiv('tg-pie-legend-row');
			const swatch = row.createDiv(`tg-pie-legend-swatch ${COLOR_CLASSES[index % COLOR_CLASSES.length]}`);
			swatch.setAttr('aria-hidden', 'true');
			row.createDiv('tg-pie-legend-label').textContent = item.name;
			row.createDiv('tg-pie-legend-value').textContent = formatDuration(item.durationMs);
		});

		if (remainderMs > 0) {
			const row = this.legend.createDiv('tg-pie-legend-row');
			const swatch = row.createDiv('tg-pie-legend-swatch tg-pie-slice-muted');
			swatch.setAttr('aria-hidden', 'true');
			row.createDiv('tg-pie-legend-label').textContent = '未记录';
			row.createDiv('tg-pie-legend-value').textContent = formatDuration(remainderMs);
		}
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
