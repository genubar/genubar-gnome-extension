import GLib from 'gi://GLib';

const UNFOCUS_DEBOUNCE_MS = 60;

/**
 * Extracts numeric X11 window ID from MetaWindow.get_description() when present.
 * @param {object | null | undefined} metaWindow
 * @returns {number}
 */
export function extractWindowXid(metaWindow) {
    const desc = metaWindow?.get_description?.() ?? '';
    if (desc.startsWith('0x')) {
        const parsed = parseInt(desc.split(' ')[0], 16);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

export function buildWindowFocusPayload(win) {
    const pid = win.get_pid() || 0;
    const appId = win.get_gtk_application_id?.() || win.get_wm_class?.() || '';
    return {
        pid,
        xid: extractWindowXid(win),
        title: win.get_title() || '',
        appId,
        gtkBusName: win.get_gtk_unique_bus_name?.() || '',
        gtkMenubarPath: win.get_gtk_menubar_object_path?.() || '',
        gtkAppMenuPath: win.get_gtk_app_menu_object_path?.() || '',
        gtkAppPath: win.get_gtk_application_object_path?.() || '',
        gtkWinPath: win.get_gtk_window_object_path?.() || '',
    };
}

/**
 * Tracks window focus transitions and lifecycle (`unmanaging`) across ALL opened windows,
 * ensuring background window closures also invalidate cached PID entries cleanly.
 */
export class FocusTracker {
    constructor({ isActive, hasOpenPopup, onWindowFocus, onDesktopFocus, onWindowClosed }) {
        this._isActive = isActive;
        this._hasOpenPopup = hasOpenPopup;
        this._onWindowFocus = onWindowFocus;
        this._onDesktopFocus = onDesktopFocus;
        this._onWindowClosed = onWindowClosed;

        this._trackedWindows = new Map();
        this._lastFocusedWin = null;
        this._unfocusTimerId = null;
        this._focusSignalId = null;
    }

    start() {
        if (this._focusSignalId) return;
        this._focusSignalId = global.display.connect('notify::focus-window', () => {
            if (this._isActive()) {
                this.syncCurrentFocus();
            }
        });
    }

    clearUnfocusTimer() {
        if (this._unfocusTimerId !== null) {
            GLib.Source.remove(this._unfocusTimerId);
            this._unfocusTimerId = null;
        }
    }

    _untrackWindow(win) {
        const sigId = this._trackedWindows.get(win);
        if (sigId) {
            try {
                win.disconnect(sigId);
            } catch (_e) {
                // Window actor may already be disposed
            }
            this._trackedWindows.delete(win);
        }
    }

    _trackWindow(win) {
        if (!win || this._trackedWindows.has(win)) return;
        const pid = win.get_pid?.() || 0;
        const sigId = win.connect('unmanaging', () => {
            const wasFocused = this._lastFocusedWin === win;
            this._untrackWindow(win);
            this._onWindowClosed?.(pid);
            if (wasFocused && this._isActive()) {
                this._lastFocusedWin = null;
                this.syncCurrentFocus();
            }
        });
        this._trackedWindows.set(win, sigId);
    }

    syncCurrentFocus() {
        this.clearUnfocusTimer();
        if (!this._isActive()) return;

        const win = global.display.focus_window;
        if (!win || win.is_skip_taskbar?.()) {
            this._lastFocusedWin = null;
            this._unfocusTimerId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                UNFOCUS_DEBOUNCE_MS,
                () => {
                    this._unfocusTimerId = null;
                    if (!this._isActive()) return GLib.SOURCE_REMOVE;
                    const currentWin = global.display.focus_window;
                    if (
                        (!currentWin || currentWin.is_skip_taskbar?.()) &&
                        !this._hasOpenPopup?.()
                    ) {
                        this._onDesktopFocus?.();
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
            return;
        }

        this._lastFocusedWin = win;
        this._trackWindow(win);
        this._onWindowFocus?.(buildWindowFocusPayload(win));
    }

    destroy() {
        this.clearUnfocusTimer();
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
        for (const [win, sigId] of this._trackedWindows) {
            try {
                win.disconnect(sigId);
            } catch (_e) {
                // Ignore disposed actors
            }
        }
        this._trackedWindows.clear();
        this._lastFocusedWin = null;
        this._onWindowFocus = null;
        this._onDesktopFocus = null;
        this._onWindowClosed = null;
    }
}
