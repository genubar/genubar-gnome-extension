import GLib from 'gi://GLib';
import St from 'gi://St';
import { KeyboardSynthesizer } from './shortcuts.js';
import { executeWindowAction } from './windowActions.js';

const TEXT_TRANSFORM_MODES = {
    'sys:transform_upper': 'upper',
    'sys:transform_lower': 'lower',
    'sys:transform_capitalize': 'capitalize',
};

const DBUS_ACTIVATE_DELAY_MS = 25;

/**
 * Routes activated menu items to synthetic shortcuts, clipboard ops, window manager actions,
 * or remote Daemon execution (`ActivateItem`).
 */
export class ActionDispatcher {
    constructor(dbusClient) {
        this._dbusClient = dbusClient;
        this._keyboard = new KeyboardSynthesizer();
        this._pendingActivateTimers = new Set();
    }

    trigger(itemId, actionUri = null) {
        if (itemId === -999) return;

        if (actionUri) {
            if (actionUri.startsWith('key:')) {
                this._keyboard.sendShortcut(actionUri.slice(4));
                return;
            }

            if (actionUri.startsWith('copy:') || actionUri.startsWith('insert:')) {
                const isInsert = actionUri.startsWith('insert:');
                const text = actionUri.slice(isInsert ? 7 : 5);
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
                if (isInsert) {
                    this._keyboard.sendShortcut('Ctrl+v');
                }
                return;
            }

            if (actionUri in TEXT_TRANSFORM_MODES) {
                this._keyboard.transformSelectedText(TEXT_TRANSFORM_MODES[actionUri]);
                return;
            }

            if (executeWindowAction(actionUri)) {
                return;
            }
        }

        const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DBUS_ACTIVATE_DELAY_MS, () => {
            this._pendingActivateTimers.delete(timerId);
            this._dbusClient?.activateItem(itemId);
            return GLib.SOURCE_REMOVE;
        });
        this._pendingActivateTimers.add(timerId);
    }

    destroy() {
        for (const timerId of this._pendingActivateTimers) {
            GLib.Source.remove(timerId);
        }
        this._pendingActivateTimers.clear();
        this._keyboard?.destroy();
        this._keyboard = null;
        this._dbusClient = null;
    }
}
