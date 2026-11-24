import { cleanMnemonicLabel } from '../core/textUtils.js';
import { IconCache } from './iconCache.js';
import { MenuButton } from './menuButton.js';

/**
 * Pooled top-bar button strip bound reactively to `MenuStore`.
 */
export class MenuBar {
    constructor({
        menuStore,
        panelAdapter,
        themeManager,
        dbusClient,
        actionDispatcher,
        isActive,
    }) {
        this._store = menuStore;
        this._panel = panelAdapter;
        this._theme = themeManager;
        this._dbus = dbusClient;
        this._actions = actionDispatcher;
        this._isActive = isActive;

        this._iconCache = new IconCache();
        this._buttons = [];

        this._unsubscribeTheme = this._theme.onThemeChanged(() => this.refreshPopupThemes());
        this._unsubscribe = this._store.subscribe(snapshot => this._renderSnapshot(snapshot));
    }

    refreshPopupThemes() {
        for (const btn of this._buttons) {
            btn.refreshTheme();
        }
    }

    hasOpenPopup() {
        return this._buttons.some(btn => btn.isPopupOpen());
    }

    clearHoverTimers() {
        for (const btn of this._buttons) {
            btn.clearHoverTimer();
        }
    }

    clearButtons() {
        for (const btn of this._buttons) {
            btn.destroy();
        }
        this._buttons = [];
        this._panel.removeOrphanedStatusButtons();
    }

    _renderSnapshot(snapshot) {
        if (!this._isActive()) return;

        this._theme.syncFromUiConfig(snapshot.uiConfig, {
            allowCssReload: Boolean(snapshot.fromLiveDaemon),
        });

        const items = snapshot.topItems || [];
        if (items.length === 0) {
            this.clearButtons();
            return;
        }

        const cascadeDeps = {
            isActive: this._isActive,
            themeManager: this._theme,
            fetchSubmenu: (nodeId, onSuccess, onError) =>
                this._dbus.fetchSubmenu(nodeId, onSuccess, onError),
            getUiConfig: () => this._store.getUiConfig(),
            getTopNodes: () => this._store.getTopNodes(),
            iconCache: this._iconCache,
            actionDispatcher: this._actions,
        };

        items.forEach(({ role, node }, idx) => {
            const label = cleanMnemonicLabel(node.label, 'Menu');
            if (idx < this._buttons.length) {
                const btn = this._buttons[idx];
                btn.setContent({ label, role });
                btn.updateRootNode({
                    node,
                    sourceKind: snapshot.source,
                    revision: snapshot.revision,
                });
                btn.show();
            } else {
                const btn = new MenuButton({
                    label,
                    role,
                    node,
                    sourceKind: snapshot.source,
                    revision: snapshot.revision,
                    cascadeDeps,
                });
                this._buttons.push(btn);
                this._panel.addMenuButton(idx, btn.actor);
            }
        });

        for (let idx = items.length; idx < this._buttons.length; idx++) {
            this._buttons[idx].hide();
        }
    }

    destroy() {
        this._unsubscribeTheme?.();
        this._unsubscribeTheme = null;
        this._unsubscribe?.();
        this._unsubscribe = null;
        this.clearButtons();
        this._iconCache?.clear();
        this._iconCache = null;
        this._store = null;
        this._panel = null;
        this._theme = null;
        this._dbus = null;
        this._actions = null;
    }
}
