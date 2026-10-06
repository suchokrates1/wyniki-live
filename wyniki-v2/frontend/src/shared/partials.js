// HTML partials for Alpine pages: `<!-- @partial name -->` is replaced by the named HTML,
// also inside <template> contents, before Alpine starts. Partials may name other partials.

const MARK = /<!--\s*@partial\s+([\w-]+)\s*-->/g;

export function expandPartials(html, partials, trail = []) {
  return String(html || '').replace(MARK, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial "${name}"`);
    if (trail.includes(name)) throw new Error(`Partial loop: ${[...trail, name].join(' → ')}`);
    return expandPartials(partials[name], partials, [...trail, name]);
  });
}

export function mountPartials(root, partials) {
  const visit = (node) => {
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT);
    const marks = [];
    const templates = [];
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      if (current.nodeType === Node.COMMENT_NODE && /^\s*@partial\s+[\w-]+\s*$/.test(current.data)) marks.push(current);
      else if (current.nodeName === 'TEMPLATE') templates.push(current);
    }
    marks.forEach((mark) => {
      const holder = node.ownerDocument.createElement('template');
      holder.innerHTML = expandPartials(`<!-- @partial ${mark.data.trim().split(/\s+/)[1]} -->`, partials).trim();
      mark.replaceWith(holder.content);
    });
    templates.forEach((template) => visit(template.content));
  };
  visit(root);
}
