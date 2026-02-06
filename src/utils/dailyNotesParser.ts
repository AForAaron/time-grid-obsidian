export interface SimpleTimeTrackerEntry {
	name: string;
	startTime?: string | null;
	endTime?: string | null;
	subEntries?: SimpleTimeTrackerEntry[];
}

export interface SimpleTimeTrackerData {
	entries?: SimpleTimeTrackerEntry[];
}

export interface DurationBucket {
	name: string;
	durationMs: number;
}

const SIMPLE_TRACKER_REGEX = /```simple-time-tracker\s*([\s\S]*?)```/m;

function formatDateFallback(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function getDailyNoteFilename(date: Date): string {
	const moment = (window as Window & { moment?: (d?: Date) => { format: (fmt: string) => string } }).moment;
	if (moment) {
		return moment(date).format('YYYY-MM-DD');
	}
	return formatDateFallback(date);
}

export function getDailyNotePath(basePath: string, date: Date): string {
	return `${basePath}/${getDailyNoteFilename(date)}.md`;
}

export function extractSimpleTimeTracker(content: string): SimpleTimeTrackerData | null {
	const match = content.match(SIMPLE_TRACKER_REGEX);
	if (!match) {
		return null;
	}
	try {
		return JSON.parse(match[1].trim()) as SimpleTimeTrackerData;
	} catch {
		return null;
	}
}

function getEntryDurationMs(entry: SimpleTimeTrackerEntry, now: Date): number {
	const start = entry.startTime ? Date.parse(entry.startTime) : NaN;
	const end = entry.endTime ? Date.parse(entry.endTime) : now.getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
		return 0;
	}
	return end - start;
}

function collectEntries(
	entries: SimpleTimeTrackerEntry[] | undefined,
	now: Date,
	order: string[],
	buckets: Map<string, number>
): void {
	if (!entries) {
		return;
	}

	const addBucket = (name: string, durationMs: number) => {
		if (durationMs <= 0) {
			return;
		}
		if (!buckets.has(name)) {
			order.push(name);
			buckets.set(name, durationMs);
		} else {
			buckets.set(name, (buckets.get(name) ?? 0) + durationMs);
		}
	};

	for (const entry of entries) {
		const name = entry.name || '未命名';
		if (entry.subEntries && entry.subEntries.length > 0) {
			let total = 0;
			for (const subEntry of entry.subEntries) {
				total += getEntryDurationMs(subEntry, now);
			}
			addBucket(name, total);
			continue;
		}

		const durationMs = getEntryDurationMs(entry, now);
		addBucket(name, durationMs);
	}
}

export function aggregateDurations(data: SimpleTimeTrackerData | null, now: Date): DurationBucket[] {
	if (!data || !data.entries || data.entries.length === 0) {
		return [];
	}
	const order: string[] = [];
	const buckets = new Map<string, number>();
	collectEntries(data.entries, now, order, buckets);

	return order
		.map((name) => ({ name, durationMs: buckets.get(name) ?? 0 }))
		.filter((item) => item.durationMs > 0);
}
