import { cleanMnemonicLabel } from './textUtils.js';

export function isSubmenuNode(node) {
    return (
        node?.item_type === 'Submenu' ||
        (Array.isArray(node?.children) && node.children.length > 0)
    );
}

export function isWindowListNode(node) {
    return (
        typeof node?.item_type === 'object' &&
        node.item_type !== null &&
        'WindowList' in node.item_type
    );
}

export function isSearchBarNode(node) {
    return node?.item_type === 'SearchBar';
}

export function isLazyMenuSource(sourceKind) {
    return sourceKind === 'Canonical-DBusMenu' || sourceKind === 'AT-SPI2';
}

export function hasDynamicMenuNodes(nodes, isDynamicAction) {
    return (nodes || []).some(
        node =>
            isWindowListNode(node) ||
            (typeof isDynamicAction === 'function' && Boolean(node?.action && isDynamicAction(node.action)))
    );
}

/**
 * Filters hidden items and collapses leading, consecutive, and trailing separators.
 * @param {Array<object>} nodes
 * @returns {Array<object>}
 */
export function sanitizeMenuSeparators(nodes) {
    const cleaned = [];
    for (const item of nodes || []) {
        if (!item?.visible) continue;
        if (item.item_type === 'Separator') {
            const isAtStart = cleaned.length === 0;
            const prevIsSep =
                cleaned.length > 0 && cleaned[cleaned.length - 1].item_type === 'Separator';
            if (isAtStart || prevIsSep) continue;
        }
        cleaned.push(item);
    }
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].item_type === 'Separator') {
        cleaned.pop();
    }
    return cleaned;
}

/**
 * Collects flattened searchable leaf actions matching `query`.
 * @param {Array<object>} topNodes
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Array<{ node: object, fullLabel: string }>}
 */
export function collectSearchableLeaves(topNodes, query, limit = 10) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return [];

    const out = [];
    const visit = (nodes, pathPrefix) => {
        for (const node of nodes || []) {
            if (out.length >= limit) return;
            if (!node.visible || node.item_type === 'Separator' || isSearchBarNode(node) || isWindowListNode(node)) {
                continue;
            }
            const clean = cleanMnemonicLabel(node.label);
            if (!clean) continue;

            const nextPath = [...pathPrefix, clean];
            if (Array.isArray(node.children) && node.children.length > 0) {
                visit(node.children, nextPath);
            } else if (node.item_type !== 'Submenu' && node.enabled) {
                const fullLabel = nextPath.join(' ▸ ');
                if (fullLabel.toLowerCase().includes(normalizedQuery)) {
                    out.push({ node, fullLabel });
                }
            }
        }
    };

    visit(topNodes || [], []);
    return out;
}
