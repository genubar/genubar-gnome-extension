import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const TRACKER_BUS_NAME = 'org.genubar.WindowTracker';
export const TRACKER_OBJECT_PATH = '/org/genubar/WindowTracker';
export const TRACKER_INTERFACE = 'org.genubar.WindowTracker';

/**
 * Session D-Bus client communicating with `org.genubar.WindowTracker`.
 */
export class TrackerDbusClient {
    constructor(isActiveFn) {
        this._isActiveFn = isActiveFn;
        this._isDestroyed = false;
        this._signalSubId = null;
        this._busWatchId = null;
    }

    _canDeliver() {
        return !this._isDestroyed && (!this._isActiveFn || this._isActiveFn());
    }

    _call(methodName, params, replyType, onReply, onError = null, timeoutMs = -1) {
        if (this._isDestroyed) return;
        Gio.DBus.session.call(
            TRACKER_BUS_NAME,
            TRACKER_OBJECT_PATH,
            TRACKER_INTERFACE,
            methodName,
            params,
            replyType,
            Gio.DBusCallFlags.NO_AUTO_START,
            timeoutMs,
            null,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    if (onReply && this._canDeliver()) {
                        onReply(reply);
                    }
                } catch (_e) {
                    if (onError && this._canDeliver()) {
                        onError();
                    }
                }
            }
        );
    }

    subscribeActiveMenuChanged(onJson) {
        if (this._signalSubId || this._isDestroyed) return;
        this._signalSubId = Gio.DBus.session.signal_subscribe(
            null,
            TRACKER_INTERFACE,
            'ActiveMenuChanged',
            TRACKER_OBJECT_PATH,
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                if (!this._canDeliver()) return;
                const [jsonStr] = params.deepUnpack();
                if (jsonStr) onJson(jsonStr);
            }
        );
    }

    watchDaemon({ onAppeared, onVanished }) {
        if (this._busWatchId || this._isDestroyed) return;
        this._busWatchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            TRACKER_BUS_NAME,
            Gio.BusNameWatcherFlags.NONE,
            () => {
                if (this._canDeliver()) {
                    onAppeared?.();
                }
            },
            () => {
                if (!this._isDestroyed) {
                    onVanished?.();
                }
            }
        );
    }

    getDaemonInfo(onInfo, onError = null) {
        this._call(
            'GetDaemonInfo',
            null,
            new GLib.VariantType('(ssu)'),
            reply => {
                const [daemonVersion, expectedExtensionVersion, ipcProtocolVersion] =
                    reply.deepUnpack();
                onInfo({ daemonVersion, expectedExtensionVersion, ipcProtocolVersion });
            },
            onError
        );
    }

    getActiveMenu(onJson) {
        this._call('GetActiveMenu', null, new GLib.VariantType('(s)'), reply => {
            const [jsonStr] = reply.deepUnpack();
            if (jsonStr) onJson(jsonStr);
        });
    }

    notifyFocusChanged(focusPayload, onJson) {
        const variant = new GLib.Variant('(uusssssss)', [
            focusPayload.pid ?? 0,
            focusPayload.xid ?? 0,
            focusPayload.title ?? '',
            focusPayload.appId ?? '',
            focusPayload.gtkBusName ?? '',
            focusPayload.gtkMenubarPath ?? '',
            focusPayload.gtkAppMenuPath ?? '',
            focusPayload.gtkAppPath ?? '',
            focusPayload.gtkWinPath ?? '',
        ]);
        this._call('NotifyFocusChanged', variant, new GLib.VariantType('(s)'), reply => {
            const [jsonStr] = reply.deepUnpack();
            if (jsonStr) onJson(jsonStr);
        });
    }

    fetchSubmenu(nodeId, onChildren, onError = null) {
        this._call(
            'FetchSubmenu',
            new GLib.Variant('(i)', [nodeId]),
            new GLib.VariantType('(s)'),
            reply => {
                const [subJson] = reply.deepUnpack();
                if (!subJson) {
                    onError?.();
                    return;
                }
                try {
                    const subNode = JSON.parse(subJson);
                    if (subNode && Array.isArray(subNode.children)) {
                        onChildren(subNode.children);
                    } else {
                        onError?.();
                    }
                } catch (_e) {
                    onError?.();
                }
            },
            onError,
            10000
        );
    }

    activateItem(itemId) {
        this._call('ActivateItem', new GLib.Variant('(i)', [itemId]), null, null);
    }

    destroy() {
        this._isDestroyed = true;
        if (this._busWatchId) {
            Gio.bus_unwatch_name(this._busWatchId);
            this._busWatchId = null;
        }
        if (this._signalSubId) {
            Gio.DBus.session.signal_unsubscribe(this._signalSubId);
            this._signalSubId = null;
        }
    }
}
