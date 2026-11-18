import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

// Linux evdev hardware keycodes keep Ctrl+C/V/X/Z/Y/A working across non-Latin keyboard layouts.
const EVDEV_KEYCODES = {
    a: 30,
    c: 46,
    v: 47,
    x: 45,
    y: 21,
    z: 44,
};

const MOD_KEYCODES = {
    ctrl: 29,
    control: 29,
    shift: 42,
    alt: 56,
    super: 125,
};

/**
 * Emits layout-independent synthetic shortcuts via a reusable Clutter virtual keyboard,
 * tracking all scheduled timers and releasing any held modifiers safely on `destroy()`.
 */
export class KeyboardSynthesizer {
    constructor() {
        this._isDestroyed = false;
        this._vdev = null;
        this._activeTimers = new Set();
        this._heldModKeys = new Set();
    }

    _getVirtualDevice() {
        if (this._vdev) return this._vdev;
        const seat =
            global.backend?.get_default_seat?.() ??
            global.stage?.context?.get_backend?.()?.get_default_seat?.() ??
            Clutter.get_default_backend?.()?.get_default_seat?.();
        if (!seat) return null;
        this._vdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        return this._vdev;
    }

    _schedule(delayMs, callback) {
        if (this._isDestroyed) return;
        const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._activeTimers.delete(timerId);
            if (!this._isDestroyed) {
                callback();
            }
            return GLib.SOURCE_REMOVE;
        });
        this._activeTimers.add(timerId);
    }

    _releaseModifiers(vdev, modKeys) {
        const tRelease = GLib.get_monotonic_time();
        for (const kc of [...modKeys].reverse()) {
            try {
                vdev.notify_key(tRelease, kc, Clutter.KeyState.RELEASED);
            } catch (_e) {
                this._vdev = null;
            }
            this._heldModKeys.delete(kc);
        }
    }

    sendShortcut(shortcutStr) {
        const parts = String(shortcutStr || '')
            .split('+')
            .map(s => s.trim().toLowerCase());
        const modKeys = [];
        let mainKeycode = 0;

        for (const part of parts) {
            if (part in MOD_KEYCODES) modKeys.push(MOD_KEYCODES[part]);
            else if (part in EVDEV_KEYCODES) mainKeycode = EVDEV_KEYCODES[part];
        }

        this._schedule(140, () => {
            try {
                const vdev = this._getVirtualDevice();
                if (!vdev) return;

                const tPress = GLib.get_monotonic_time();
                for (const kc of modKeys) {
                    vdev.notify_key(tPress, kc, Clutter.KeyState.PRESSED);
                    this._heldModKeys.add(kc);
                }

                this._schedule(20, () => {
                    try {
                        const tKey = GLib.get_monotonic_time();
                        if (mainKeycode) {
                            vdev.notify_key(tKey, mainKeycode, Clutter.KeyState.PRESSED);
                            vdev.notify_key(tKey + 1000, mainKeycode, Clutter.KeyState.RELEASED);
                        }
                    } catch (_e) {
                        this._vdev = null;
                    }

                    this._schedule(20, () => {
                        if (this._vdev) {
                            this._releaseModifiers(this._vdev, modKeys);
                        }
                    });
                });
            } catch (_e) {
                this._vdev = null;
            }
        });
    }

    transformSelectedText(mode) {
        const clipboard = St.Clipboard.get_default();
        const applyTransform = rawText => {
            if (!rawText || this._isDestroyed) return;
            let transformed = rawText;
            if (mode === 'upper') transformed = rawText.toUpperCase();
            else if (mode === 'lower') transformed = rawText.toLowerCase();
            else if (mode === 'capitalize') {
                transformed = rawText.replace(/\b\w/g, ch => ch.toUpperCase());
            }
            clipboard.set_text(St.ClipboardType.CLIPBOARD, transformed);
            this.sendShortcut('Ctrl+v');
        };

        clipboard.get_text(St.ClipboardType.PRIMARY, (_cb, primaryText) => {
            if (this._isDestroyed) return;
            if (primaryText) {
                applyTransform(primaryText);
            } else {
                clipboard.get_text(St.ClipboardType.CLIPBOARD, (_cb2, clipText) => {
                    applyTransform(clipText);
                });
            }
        });
    }

    destroy() {
        this._isDestroyed = true;
        for (const timerId of this._activeTimers) {
            GLib.Source.remove(timerId);
        }
        this._activeTimers.clear();

        if (this._vdev && this._heldModKeys.size > 0) {
            this._releaseModifiers(this._vdev, [...this._heldModKeys]);
        }
        this._heldModKeys.clear();
        this._vdev = null;
    }
}
