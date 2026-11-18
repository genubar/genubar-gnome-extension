import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { L0MenuCache } from './lib/core/l0Cache.js';
import { MenuStore } from './lib/core/menuStore.js';
import { TrackerDbusClient } from './lib/ipc/dbusClient.js';
import { VersionVerifier } from './lib/ipc/versionCheck.js';
import { ActionDispatcher } from './lib/platform/actionRegistry.js';
import { FocusTracker } from './lib/platform/focusTracker.js';
import { PanelAdapter } from './lib/platform/panelAdapter.js';
import { ThemeManager } from './lib/platform/themeManager.js';
import { MenuBar } from './lib/ui/menuBar.js';

/**
 * Slim GNOME Shell Extension Composition Root connecting focus tracking, D-Bus IPC,
 * L0 cache, MenuStore, panel integration, actions, and UI components.
 */
export default class GenubarExtension extends Extension {
    enable() {
        this._isEnabled = true;
        this._daemonLost = false;

        const isActive = () => Boolean(this._isEnabled && this._isUserSessionActive());

        this._store = new MenuStore();
        this._l0Cache = new L0MenuCache();
        this._dbusClient = new TrackerDbusClient(isActive);
        this._versionVerifier = new VersionVerifier(this.metadata, this._dbusClient);
        this._panelAdapter = new PanelAdapter();
        this._themeManager = new ThemeManager(this.path);
        this._actionDispatcher = new ActionDispatcher(this._dbusClient);

        this._menuBar = new MenuBar({
            menuStore: this._store,
            panelAdapter: this._panelAdapter,
            themeManager: this._themeManager,
            dbusClient: this._dbusClient,
            actionDispatcher: this._actionDispatcher,
            isActive,
        });

        const applyDaemonJson = (rawJson, expectedSeq = null) => {
            const parsed = this._store?.apply({
                rawJson,
                expectedSeq,
                fromLiveDaemon: true,
            });
            if (parsed) {
                this._l0Cache?.setFromPayload(parsed, rawJson);
            }
        };

        this._focusTracker = new FocusTracker({
            isActive,
            hasOpenPopup: () => this._menuBar?.hasOpenPopup() ?? false,
            onWindowClosed: pid => this._l0Cache?.invalidatePid(pid),
            onWindowFocus: focusPayload => {
                const seq = this._store.bumpFocusSeq();
                const cached = this._l0Cache.getForWindow(focusPayload.pid, focusPayload.appId);
                if (cached) {
                    this._store.apply({
                        rawJson: cached.rawJson,
                        payload: cached.payload,
                        expectedSeq: seq,
                        fromLiveDaemon: false,
                    });
                }
                this._dbusClient.notifyFocusChanged(focusPayload, rawJson =>
                    applyDaemonJson(rawJson, seq)
                );
            },
            onDesktopFocus: () => {
                const seq = this._store.bumpFocusSeq();
                const desktopCached = this._l0Cache.getDesktop();
                if (desktopCached) {
                    this._store.apply({
                        rawJson: desktopCached.rawJson,
                        payload: desktopCached.payload,
                        expectedSeq: seq,
                        fromLiveDaemon: false,
                    });
                }
                this._dbusClient.notifyFocusChanged(
                    { pid: 0, xid: 0, title: 'Desktop' },
                    rawJson => applyDaemonJson(rawJson, seq)
                );
            },
        });

        this._panelAdapter.removeOrphanedStatusButtons();
        this._panelAdapter.unlockPanelWidth();

        this._dbusClient.subscribeActiveMenuChanged(rawJson => applyDaemonJson(rawJson, null));
        this._dbusClient.watchDaemon({
            onAppeared: () => {
                this._versionVerifier?.verify();
                const needsSync = this._daemonLost || !this._store?.hasLiveSync();
                this._daemonLost = false;
                if (needsSync) {
                    this._focusTracker?.syncCurrentFocus();
                }
            },
            onVanished: () => {
                this._daemonLost = true;
                this._versionVerifier?.reset();
                this._store?.clear();
            },
        });

        this._sessionModeSignalId = Main.sessionMode.connect('updated', () => {
            if (!this._isUserSessionActive()) {
                this._focusTracker?.clearUnfocusTimer();
                this._menuBar?.clearHoverTimers();
                this._store?.clear();
                this._panelAdapter?.restorePanelWidth();
            } else if (this._isEnabled) {
                this._panelAdapter?.unlockPanelWidth();
                this._focusTracker?.syncCurrentFocus();
            }
        });

        this._focusTracker.start();

        if (this._isUserSessionActive()) {
            this._versionVerifier.verify();
            this._focusTracker.syncCurrentFocus();
        }
    }

    disable() {
        this._isEnabled = false;

        if (this._sessionModeSignalId) {
            Main.sessionMode.disconnect(this._sessionModeSignalId);
            this._sessionModeSignalId = null;
        }

        this._focusTracker?.destroy();
        this._focusTracker = null;
        this._versionVerifier?.destroy();
        this._versionVerifier = null;
        this._dbusClient?.destroy();
        this._dbusClient = null;
        this._actionDispatcher?.destroy();
        this._actionDispatcher = null;
        this._menuBar?.destroy();
        this._menuBar = null;
        this._panelAdapter?.destroy();
        this._panelAdapter = null;
        this._themeManager?.destroy();
        this._themeManager = null;
        this._store?.clear();
        this._store = null;
        this._l0Cache?.clear();
        this._l0Cache = null;
    }

    _isUserSessionActive() {
        const mode = Main.sessionMode.currentMode;
        return mode === 'user' || mode === 'user-classic';
    }
}
