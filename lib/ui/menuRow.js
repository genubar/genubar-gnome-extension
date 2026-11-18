import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { isSubmenuNode } from '../core/menuModel.js';
import { resolveCheckRadioState } from '../core/slotLayout.js';
import { cleanMnemonicLabel } from '../core/textUtils.js';
import { resolveWindowCheckOverride } from '../platform/windowActions.js';

export function buildCheckSlot(checkKind, isChecked, checkStyle, sizePx, isEnabled) {
    if (!checkKind) {
        return new St.Widget({
            width: sizePx,
            style_class: 'genubar-item-icon',
        });
    }

    if (checkStyle === 'icon') {
        if (!isChecked) {
            return new St.Widget({
                width: sizePx,
                style_class: 'genubar-item-icon',
            });
        }
        const iconName =
            checkKind === 'radio' ? 'radio-checked-symbolic' : 'object-select-symbolic';
        return new St.Icon({
            icon_name: iconName,
            icon_size: sizePx,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: isEnabled ? 'genubar-item-icon' : 'genubar-item-icon-disabled',
        });
    }

    let glyph = '';
    if (checkStyle === 'box') {
        glyph =
            checkKind === 'radio'
                ? isChecked
                    ? '◉'
                    : '○'
                : isChecked
                  ? '☑'
                  : '☐';
    } else {
        glyph = checkKind === 'radio' ? (isChecked ? '•' : '') : isChecked ? '✓' : '';
    }

    return new St.Label({
        text: glyph,
        width: sizePx,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: isEnabled
            ? 'genubar-item-label genubar-item-icon'
            : 'genubar-item-label-disabled genubar-item-icon-disabled',
    });
}

function appendLeadingSlots(row, opts) {
    const {
        pos,
        style,
        sizePx,
        isEnabled,
        checkKind,
        isChecked,
        hasIcon,
        iconName,
        reserveCheckCol,
        reserveIconCol,
        iconCache,
    } = opts;

    const addIcon = () => row.add_child(iconCache.buildSlot(hasIcon ? iconName : null, sizePx, isEnabled));
    const addCheck = () => row.add_child(buildCheckSlot(checkKind, isChecked, style, sizePx, isEnabled));

    if (pos === 'replace_icon') {
        const reserveCombined = reserveIconCol || reserveCheckCol;
        if (checkKind && (isChecked || style === 'box' || !hasIcon)) {
            addCheck();
        } else if (hasIcon || reserveCombined) {
            addIcon();
        }
    } else if (pos === 'before_icon') {
        if (checkKind || reserveCheckCol) addCheck();
        if (hasIcon || reserveIconCol) addIcon();
    } else if (pos === 'after_icon') {
        if (hasIcon || reserveIconCol) addIcon();
        if (checkKind || reserveCheckCol) addCheck();
    } else if (pos === 'right') {
        if (hasIcon || reserveIconCol) addIcon();
    }
}

/**
 * Unified row factory for standard menu items, lazy submenus, WindowList items, and search matches.
 */
export function createMenuItemRow(ctx) {
    const {
        node,
        labelOverride = null,
        showSlots = true,
        isButtonDestroyed = () => false,
        rootPopupMenu,
        uiCfg = {},
        sizePx = 14,
        focusWin = null,
        reserveCheckCol = false,
        reserveIconCol = false,
        iconCache = null,
        actionDispatcher,
        onOpenSubmenu = null,
        onClearSubmenu = null,
        scheduleHover = null,
        clearHover = null,
    } = ctx;

    const displayLabel = labelOverride ?? cleanMnemonicLabel(node.label);
    if (!displayLabel) return null;

    const isSubmenu = !labelOverride && isSubmenuNode(node);
    const isEnabled = Boolean(node.enabled);
    const { checkKind, isChecked } = showSlots
        ? resolveCheckRadioState(node, (action, existingKind) =>
              resolveWindowCheckOverride(action, existingKind, focusWin)
          )
        : { checkKind: null, isChecked: false };

    const row = new St.BoxLayout({
        reactive: true,
        can_focus: isEnabled,
        track_hover: true,
        style_class: isEnabled
            ? 'genubar-item-row'
            : 'genubar-item-row genubar-item-row-disabled',
    });

    const pos = uiCfg.check_position || 'before_icon';
    const style = uiCfg.check_style || 'symbol';

    if (showSlots && iconCache) {
        const hasIcon = Boolean(uiCfg.show_menu_icons !== false && node.icon);
        appendLeadingSlots(row, {
            pos,
            style,
            sizePx,
            isEnabled,
            checkKind,
            isChecked,
            hasIcon,
            iconName: node.icon,
            reserveCheckCol,
            reserveIconCol,
            iconCache,
        });
    }

    row.add_child(
        new St.Label({
            text: displayLabel,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: isEnabled ? 'genubar-item-label' : 'genubar-item-label-disabled',
        })
    );

    if (showSlots && pos === 'right' && (checkKind || reserveCheckCol)) {
        row.add_child(buildCheckSlot(checkKind, isChecked, style, sizePx, isEnabled));
    }

    if (isSubmenu) {
        row.add_child(
            new St.Label({
                text: '▸',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.END,
                style_class: isEnabled
                    ? 'genubar-submenu-arrow'
                    : 'genubar-submenu-arrow-disabled',
            })
        );
    } else if (!labelOverride && node.shortcut && node.shortcut.length > 0) {
        row.add_child(
            new St.Label({
                text: node.shortcut.join('+'),
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.END,
                style_class: isEnabled
                    ? 'genubar-shortcut-label'
                    : 'genubar-shortcut-label-disabled',
            })
        );
    }

    if (scheduleHover && onOpenSubmenu && onClearSubmenu) {
        row.connect('notify::hover', () => {
            if (!row.hover || isButtonDestroyed()) return;
            scheduleHover(() => {
                if (isButtonDestroyed() || !row.hover || !rootPopupMenu.isOpen) return;
                if (isEnabled && isSubmenu) {
                    onOpenSubmenu(row);
                } else {
                    onClearSubmenu();
                }
            });
        });
    }

    row.connect('button-release-event', (_actor, event) => {
        if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
        clearHover?.();
        if (!isEnabled) return Clutter.EVENT_STOP;
        if (isSubmenu && onOpenSubmenu) {
            onOpenSubmenu(row);
        } else if (node._metaWindow) {
            rootPopupMenu.close(false);
            Main.activateWindow(node._metaWindow);
        } else {
            rootPopupMenu.close(false);
            actionDispatcher.trigger(node.id, node.action);
        }
        return Clutter.EVENT_STOP;
    });

    return row;
}
