import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { isVersionAtLeast } from '../core/textUtils.js';

/**
 * Performs a single Daemon <-> Extension version compatibility handshake per connection.
 */
export class VersionVerifier {
    constructor(metadata, dbusClient) {
        this._metadata = metadata;
        this._dbus = dbusClient;
        this._checkedThisConnection = false;
        this._checkInFlight = false;
        this._compatNotified = false;
    }

    reset() {
        this._checkedThisConnection = false;
        this._checkInFlight = false;
        this._compatNotified = false;
    }

    verify() {
        if (this._checkedThisConnection || this._checkInFlight || !this._dbus) {
            return;
        }
        this._checkInFlight = true;

        this._dbus.getDaemonInfo(
            ({ daemonVersion, expectedExtensionVersion, ipcProtocolVersion }) => {
                this._checkInFlight = false;
                this._checkedThisConnection = true;

                const extVer =
                    this._metadata['genubar-version'] ||
                    this._metadata['version-name'] ||
                    '0.1.0';
                const minDaemon = this._metadata['min-daemon-version'] || '0.1.0';
                const extIpc = this._metadata['ipc-protocol-version'] ?? 1;

                const ipcOk = Number(ipcProtocolVersion) === Number(extIpc);
                const verOk = isVersionAtLeast(daemonVersion, minDaemon);

                if ((!ipcOk || !verOk) && !this._compatNotified) {
                    this._compatNotified = true;
                    Main.notify(
                        'Genubar Version Mismatch',
                        `Extension v${extVer} requires Daemon v${minDaemon}+ (IPC v${extIpc}). Running Daemon v${daemonVersion} (IPC v${ipcProtocolVersion}, expects Extension v${expectedExtensionVersion}).`
                    );
                }
            },
            () => {
                this._checkInFlight = false;
            }
        );
    }

    destroy() {
        this._dbus = null;
        this._metadata = null;
    }
}
