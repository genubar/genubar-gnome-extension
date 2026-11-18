import { isSearchBarNode, isSubmenuNode } from './menuModel.js';

/**
 * Resolves `{ checkKind: 'check' | 'radio' | null, isChecked: boolean }` for a menu node,
 * optionally consulting a pure dynamic override callback `(action, checkKind) => boolean | null`.
 */
export function resolveCheckRadioState(node, getDynamicCheckState = null) {
    const isSubmenu = isSubmenuNode(node);
    let checkKind = null;
    let isChecked = false;

    if (!isSubmenu && typeof node?.item_type === 'object' && node.item_type !== null) {
        if ('Check' in node.item_type) {
            checkKind = 'check';
            isChecked = Boolean(node.item_type.Check);
        } else if ('Radio' in node.item_type) {
            checkKind = 'radio';
            isChecked = Boolean(node.item_type.Radio);
        }
    }

    if (!isSubmenu && node?.action && typeof getDynamicCheckState === 'function') {
        const overrideState = getDynamicCheckState(node.action, checkKind);
        if (typeof overrideState === 'boolean') {
            checkKind = checkKind || 'check';
            isChecked = overrideState;
        }
    }

    return { checkKind, isChecked };
}

/**
 * Computes whether icon and check slots should be reserved across a rendered column.
 */
export function computeColumnSlotReservation(nodes, uiCfg = {}) {
    let columnHasAnyIcon = false;
    let columnHasAnyCheck = false;

    for (const node of nodes || []) {
        if (!node.visible || node.item_type === 'Separator' || isSearchBarNode(node)) continue;
        if (uiCfg.show_menu_icons !== false && node.icon) columnHasAnyIcon = true;
        if (
            typeof node.item_type === 'object' &&
            node.item_type !== null &&
            ('Check' in node.item_type || 'Radio' in node.item_type)
        ) {
            columnHasAnyCheck = true;
        }
    }

    const iconPolicy =
        uiCfg.reserve_icon_column !== false ? uiCfg.icon_column_policy || 'always' : 'never';
    const reserveIconCol =
        uiCfg.show_menu_icons !== false &&
        (iconPolicy === 'always' || (iconPolicy === 'auto' && columnHasAnyIcon));

    const checkPolicy = uiCfg.check_column_policy || 'auto';
    const reserveCheckCol =
        checkPolicy === 'always' || (checkPolicy === 'auto' && columnHasAnyCheck);

    return { reserveIconCol, reserveCheckCol };
}
