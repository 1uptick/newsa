import { escapeAttr } from "./html";

export type ContentBlock =
  | { type: "p"; html: string }
  | { type: "img"; html: string }
  | { type: "other"; html: string };

const EDITABLE_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote"]);

function pushTopLevelNodeToBlocks(node: ChildNode, blocks: ContentBlock[]): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const html = el.outerHTML;
    if (tag === "img") {
      blocks.push({ type: "img", html });
    } else if (EDITABLE_TAGS.has(tag)) {
      const isEmptyP = tag === "p" && !(el.textContent ?? "").trim();
      if (isEmptyP) return;
      blocks.push({ type: "p", html });
    } else {
      blocks.push({ type: "other", html });
    }
  } else if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text) blocks.push({ type: "other", html: text });
  }
}

/**
 * Strip full-document wrappers so `DOMParser` + synthetic `<body>...</body>` does not
 * treat pasted `</body>` / `</html>` as closing the wrapper (which drops following nodes).
 */
function stripDocumentWrapperTagsForBodyParse(html: string): string {
  return html
    .replace(/<\/?html\b[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body\b[^>]*>/gi, "");
}

export function parseContentIntoBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Prefer fragment parsing: Excel/Word/browser copies often include `</body></html>`;
  // `parseFromString('<body>' + fragment + '</body>')` closes the body early and loses tail nodes.
  if (typeof document !== "undefined") {
    const tpl = document.createElement("template");
    tpl.innerHTML = content;
    tpl.content.childNodes.forEach((node) => pushTopLevelNodeToBlocks(node, blocks));
    return blocks;
  }

  const safe = stripDocumentWrapperTagsForBodyParse(content);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${safe}</body>`, "text/html");
  doc.body.childNodes.forEach((node) => pushTopLevelNodeToBlocks(node, blocks));
  return blocks;
}

export function blocksToContent(blocks: ContentBlock[]): string {
  return blocks.map((b) => b.html).join("");
}

export function insertImageAfterBlockContent(
  blocks: ContentBlock[],
  afterIndex: number,
  imageUrl: string,
  options?: { centered?: boolean; alt?: string },
): string {
  const margin = options?.centered ? "1rem auto" : "1rem 0";
  const alt = options?.alt?.trim() ?? "";
  const img = `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;display:block;margin:${margin};" />`;
  const newBlocks: ContentBlock[] = [
    ...blocks.slice(0, afterIndex + 1),
    { type: "img", html: img },
    ...blocks.slice(afterIndex + 1),
  ];
  return blocksToContent(newBlocks);
}

export function removeBlockAtIndex(blocks: ContentBlock[], index: number): string {
  const newBlocks = blocks.filter((_, i) => i !== index);
  return blocksToContent(newBlocks);
}

export function replaceBlockAtIndex(blocks: ContentBlock[], index: number, newHtml: string): string {
  const block = blocks[index];
  if (!block) return blocksToContent(blocks);
  const newBlocks = [...blocks];
  newBlocks[index] = { ...block, html: newHtml };
  return blocksToContent(newBlocks);
}
