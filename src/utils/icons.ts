export type TimeGridIcon = 'month' | 'day' | 'hour' | 'pie';

const iconSvg: Record<TimeGridIcon, string> = {
	month: `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	<path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4zm6 0h4v4h-4v-4zM7 16h4v4H7v-4zm6 0h4v4h-4v-4z"/>
</svg>`,
	day: `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	<path d="M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zm0-2a10 10 0 1 1 0 20a10 10 0 0 1 0-20zm1 5h-2v6l5 3l1-1.732-4-2.268V7z"/>
</svg>`,
	hour: `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	<path d="M9 2h6v2H9V2zm3 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm1 2h-2v4.5l3.5 2.1l1-1.7-2.5-1.4V9z"/>
</svg>`,
	pie: `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
	<path d="M11 2v9H2a10 10 0 0 1 9-9zm2 0a10 10 0 1 1-4.9 18.7L13 11V2z"/>
</svg>`,
};

export function appendIcon(parent: HTMLElement, name: TimeGridIcon): HTMLSpanElement {
	const span = parent.createSpan({ cls: 'tg-icon' });
	span.innerHTML = iconSvg[name];
	return span;
}
