import { isWindowListNode, sanitizeMenuSeparators } from '../core/menuModel.js';
import { truncateMiddle } from '../core/textUtils.js';

/**
 * Expands `WindowList` placeholder nodes into interactive Radio items for all windows
 * belonging to the active application, collapsing redundant separators.
 */
export function expandWindowListNodes(rawNodes, focusWin = global.display.focus_window) {
    const expanded = [];

    for (const node of rawNodes || []) {
        if (isWindowListNode(node)) {
            const minWin = node.item_type.WindowList.min_windows_to_show ?? 1;
            const maxLen = node.item_type.WindowList.max_title_length ?? 48;
            if (!focusWin) continue;

            const focusAppId = focusWin.get_gtk_application_id?.() || '';
            const focusWmClass = focusWin.get_wm_class?.() || '';
            const focusPid = focusWin.get_pid?.() || 0;

            const appWindows = global
                .get_window_actors()
                .map(actor => actor.get_meta_window())
                .filter(win => {
                    if (!win || win.is_skip_taskbar?.()) return false;
                    if (focusAppId && win.get_gtk_application_id?.() === focusAppId) return true;
                    if (focusWmClass && win.get_wm_class?.() === focusWmClass) return true;
                    return focusPid > 0 && win.get_pid?.() === focusPid;
                });

            if (appWindows.length >= minWin) {
                appWindows.forEach((win, idx) => {
                    const isFocused = win === focusWin;
                    const rawTitle = win.get_title() || `Window ${idx + 1}`;
                    expanded.push({
                        id: -2000 - idx,
                        label: truncateMiddle(rawTitle, maxLen),
                        enabled: true,
                        visible: true,
                        item_type: { Radio: isFocused },
                        icon: null,
                        shortcut: null,
                        action: null,
                        _metaWindow: win,
                        children: [],
                    });
                });
            }
            continue;
        }
        expanded.push(node);
    }

    return sanitizeMenuSeparators(expanded);
}
