function moveWindowWorkspace(win, delta) {
    const ws = win.get_workspace?.();
    if (!ws) return;

    const targetIdx = ws.index() + delta;
    const wsMgr = global.workspace_manager;
    if (targetIdx >= 0 && targetIdx < wsMgr.get_n_workspaces()) {
        const targetWs = wsMgr.get_workspace_by_index(targetIdx);
        win.change_workspace(targetWs);
        targetWs.activate(global.get_current_time());
    }
}

/**
 * Single source of truth for compositor window actions, their live state probes, and dynamic flags.
 */
export const WINDOW_ACTIONS = {
    'sys:close_window': {
        isDynamic: false,
        execute: win => win.delete(global.get_current_time()),
    },
    'sys:minimize_window': {
        isDynamic: false,
        execute: win => {
            if (win.can_minimize?.()) win.minimize();
        },
    },
    'sys:maximize_window': {
        isDynamic: false,
        execute: win => {
            if (win.is_maximized?.()) win.unmaximize();
            else win.maximize();
        },
    },
    'sys:fullscreen_window': {
        isDynamic: true,
        requiresExistingCheck: true,
        getCheckState: win => Boolean(win?.is_fullscreen?.()),
        execute: win => {
            if (win.is_fullscreen?.()) win.unmake_fullscreen();
            else win.make_fullscreen();
        },
    },
    'sys:always_on_top': {
        isDynamic: true,
        requiresExistingCheck: false,
        getCheckState: win => Boolean(win?.is_above?.()),
        execute: win => {
            if (win.is_above?.()) win.unmake_above();
            else win.make_above();
        },
    },
    'sys:center_window': {
        isDynamic: false,
        execute: win => {
            const workArea = win.get_work_area_current_monitor?.();
            const rect = win.get_frame_rect?.();
            if (workArea && rect) {
                const newX = workArea.x + Math.round((workArea.width - rect.width) / 2);
                const newY = workArea.y + Math.round((workArea.height - rect.height) / 2);
                win.move_frame(true, newX, newY);
            }
        },
    },
    'sys:move_workspace_left': {
        isDynamic: false,
        execute: win => moveWindowWorkspace(win, -1),
    },
    'sys:move_workspace_right': {
        isDynamic: false,
        execute: win => moveWindowWorkspace(win, 1),
    },
};

export function isDynamicWindowAction(actionUri) {
    return Boolean(WINDOW_ACTIONS[actionUri]?.isDynamic);
}

/**
 * Returns live boolean check state for dynamic window actions when applicable, otherwise `null`.
 */
export function resolveWindowCheckOverride(actionUri, checkKind, focusWin) {
    const spec = WINDOW_ACTIONS[actionUri];
    if (!spec?.getCheckState || !focusWin) return null;
    if (spec.requiresExistingCheck && checkKind !== 'check') return null;
    return spec.getCheckState(focusWin);
}

/**
 * Executes a `sys:*` window action on the currently focused Meta.Window.
 * @returns {boolean} True if handled by WINDOW_ACTIONS
 */
export function executeWindowAction(actionUri) {
    const spec = WINDOW_ACTIONS[actionUri];
    if (!spec) return false;

    const win = global.display.focus_window;
    if (win) {
        spec.execute(win);
    }
    return true;
}
