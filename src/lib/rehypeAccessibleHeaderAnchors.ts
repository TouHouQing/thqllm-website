type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function hasClass(value: unknown, className: string) {
  if (Array.isArray(value)) {
    return value.includes(className);
  }

  return typeof value === 'string' && value.split(/\s+/).includes(className);
}

function visit(node: HastNode) {
  if (
    node.type === 'element' &&
    node.tagName === 'a' &&
    node.properties &&
    (node.properties.ariaHidden === true || node.properties.ariaHidden === 'true') &&
    (hasClass(node.properties.class, 'rp-header-anchor') ||
      hasClass(node.properties.className, 'rp-header-anchor'))
  ) {
    node.properties.tabIndex = -1;
  }

  for (const child of node.children ?? []) {
    visit(child);
  }
}

export function rehypeAccessibleHeaderAnchors() {
  return (tree: HastNode) => {
    visit(tree);
  };
}
