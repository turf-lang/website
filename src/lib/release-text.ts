const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderEntryText(text: string): string {
    return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}
