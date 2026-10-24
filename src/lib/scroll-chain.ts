const LINE_HEIGHT = 16;

function pixels(delta: number, mode: number, page: number): number {
    if (mode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_HEIGHT;
    if (mode === WheelEvent.DOM_DELTA_PAGE) return delta * page;
    return delta;
}

function room(position: number, size: number, viewport: number, delta: number): boolean {
    if (delta === 0 || size <= viewport) return false;
    return delta < 0 ? position > 0 : position < size - viewport - 1;
}

function onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.defaultPrevented) return;
    const box = event.currentTarget as HTMLElement;
    const dy = pixels(event.deltaY, event.deltaMode, box.clientHeight);
    const dx = pixels(event.deltaX, event.deltaMode, box.clientWidth);
    const down = room(box.scrollTop, box.scrollHeight, box.clientHeight, dy);
    const across = room(box.scrollLeft, box.scrollWidth, box.clientWidth, dx);

    if (dy === 0 || down || Math.abs(dx) > Math.abs(dy)) return;
    event.preventDefault();
    if (across) box.scrollLeft += dx;
    window.scrollBy(0, dy);
}

for (const box of document.querySelectorAll<HTMLElement>("pre")) {
    box.addEventListener("wheel", onWheel, { passive: false });
}
