export function renderChatMessageMarkdown(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\\text\{([^{}\n]+?)\}/g, '<span class="inline-math">$1</span>')
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `<span class="inline-math">${normalizeMathText(expression)}</span>`)
    .replace(/\$\$([\s\S]*?)\$\$/g, '<span class="display-math">$1</span>')
    .replace(/\$([^$\n]+?)\$/g, '<span class="inline-math">$1</span>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function normalizeMathText(value: string): string {
  return value.replace(/\\_/g, "_").replace(/\\,/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
