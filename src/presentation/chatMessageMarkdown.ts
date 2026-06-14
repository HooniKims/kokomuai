export function renderChatMessageMarkdown(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\\text\{([^{}\n]+?)\}/g, '<span class="inline-math">$1</span>')
    .replace(/\\ce\{([^{}\n]+?)\}/g, (_match, expression: string) => `<span class="inline-math">${normalizeMathText(expression)}</span>`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `<span class="display-math">${normalizeMathText(expression)}</span>`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `<span class="inline-math">${normalizeMathText(expression)}</span>`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression: string) => `<span class="display-math">${normalizeMathText(expression)}</span>`)
    .replace(/\$([^$\n]+?)\$/g, (_match, expression: string) => `<span class="inline-math">${normalizeMathText(expression)}</span>`)
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function normalizeMathText(value: string): string {
  return value
    .replace(/\\text\{([^{}\n]+?)\}/g, "$1")
    .replace(/\\ce\{([^{}\n]+?)\}/g, "$1")
    .replace(/\\_/g, "_")
    .replace(/\\,/g, " ")
    .replace(/&amp;rightarrow;/g, "→")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\to/g, "→")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
