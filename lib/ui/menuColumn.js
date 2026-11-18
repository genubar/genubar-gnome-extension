import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { isSearchBarNode } from '../core/menuModel.js';
import { computeColumnSlotReservation } from '../core/slotLayout.js';
import { createMenuItemRow } from './menuRow.js';
import { createInlineSearchBar } from './searchWidget.js';
import { expandWindowListNodes } from './windowListExpander.js';

function createScrollColumn(depth) {
    const scrollView = new St.ScrollView({
        style_class: depth === 0 ? 'genubar-menu-scroll' : 'genubar-submenu-scroll',
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
    });
    const colBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'genubar-column-box',
    });
    return { scrollView, colBox };
}

function attachScrollChild(scrollView, colBox) {
    if (scrollView.set_child) scrollView.set_child(colBox);
    else scrollView.add_child(colBox);
    return scrollView;
}

export function createLoadingColumn(depth) {
    const { scrollView, colBox } = createScrollColumn(depth);
    const row = new St.BoxLayout({
        style_class: 'genubar-item-row genubar-item-row-disabled',
    });
    row.add_child(
        new St.Label({
            text: 'Loading...',
            style_class: 'genubar-item-label-disabled',
        })
    );
    colBox.add_child(row);
    return attachScrollChild(scrollView, colBox);
}

/**
 * Builds a scrollable menu column for either the root column (`depth === 0`) or nested submenus.
 */
export function buildMenuColumn({
    rawNodes,
    depth,
    rootPopupMenu,
    isButtonDestroyed,
    getUiConfig,
    getTopNodes,
    iconCache,
    actionDispatcher,
    onOpenSubmenu,
    onClearSubmenu,
    scheduleHover,
    clearHover,
}) {
    const { scrollView, colBox } = createScrollColumn(depth);

    let activeSubmenuRow = null;
    const setActiveRow = newRow => {
        if (activeSubmenuRow && activeSubmenuRow !== newRow) {
            activeSubmenuRow.remove_style_class_name('genubar-item-row-active');
        }
        activeSubmenuRow = newRow;
        if (activeSubmenuRow) {
            activeSubmenuRow.add_style_class_name('genubar-item-row-active');
        }
    };

    const focusWin = global.display.focus_window;
    const nodes = expandWindowListNodes(rawNodes, focusWin);
    const uiCfg = getUiConfig?.() || {};
    const sizePx = uiCfg.icon_size_px || 14;
    const { reserveIconCol, reserveCheckCol } = computeColumnSlotReservation(nodes, uiCfg);

    for (const node of nodes) {
        if (!node.visible) continue;

        if (node.item_type === 'Separator') {
            colBox.add_child(new St.Widget({ style_class: 'genubar-menu-separator' }));
            continue;
        }

        if (isSearchBarNode(node)) {
            colBox.add_child(
                createInlineSearchBar({
                    rootPopupMenu,
                    placeholderText: node.label || 'Search menu...',
                    getTopNodes,
                    actionDispatcher,
                    clearHover,
                })
            );
            continue;
        }

        const row = createMenuItemRow({
            node,
            isButtonDestroyed,
            rootPopupMenu,
            uiCfg,
            sizePx,
            focusWin,
            reserveCheckCol,
            reserveIconCol,
            iconCache,
            actionDispatcher,
            onOpenSubmenu: rowActor => {
                setActiveRow(rowActor);
                onOpenSubmenu(node, () => !isButtonDestroyed() && rootPopupMenu.isOpen && activeSubmenuRow === rowActor);
            },
            onClearSubmenu: () => {
                setActiveRow(null);
                onClearSubmenu();
            },
            scheduleHover,
            clearHover,
        });

        if (row) {
            colBox.add_child(row);
        }
    }

    return attachScrollChild(scrollView, colBox);
}
