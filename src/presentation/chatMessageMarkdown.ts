export function renderChatMessageMarkdown(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\$\$([\s\S]*?)\$\$/g, '<span class="display-math">$1</span>')
    .replace(/\$([^$\n]+?)\$/g, '<span class="inline-math">$1</span>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
