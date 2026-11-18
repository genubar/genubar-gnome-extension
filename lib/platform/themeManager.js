import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Manages live stylesheet hot-reloading and Light/Dark panel & popup CSS classes.
 */
export class ThemeManager {
    constructor(extensionDir) {
        this._extensionDir = extensionDir;
        this._lastCssRevision = 0;
        this._themeMode = 'auto';
        this._recolorPanel = false;
        this._themeListeners = new Set();
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        const handleSystemThemeChange = () => {
            this.applyPanelTheme();
            this._notifyThemeListeners();
        };
        this._colorSchemeSignalId = this._interfaceSettings.connect(
            'changed::color-scheme',
            handleSystemThemeChange
        );
        this._gtkThemeSignalId = this._interfaceSettings.connect(
            'changed::gtk-theme',
            handleSystemThemeChange
        );
    }

    onThemeChanged(listener) {
        this._themeListeners.add(listener);
        return () => this._themeListeners.delete(listener);
    }

    _notifyThemeListeners() {
        for (const listener of this._themeListeners) {
            try {
                listener();
            } catch (_e) {
                // Keep updating remaining listeners
            }
        }
    }

    destroy() {
        if (this._colorSchemeSignalId) {
            this._interfaceSettings.disconnect(this._colorSchemeSignalId);
            this._colorSchemeSignalId = null;
        }
        if (this._gtkThemeSignalId) {
            this._interfaceSettings.disconnect(this._gtkThemeSignalId);
            this._gtkThemeSignalId = null;
        }
        this._themeListeners.clear();
        Main.panel.remove_style_class_name('genubar-panel-light');
    }

    reloadStylesheet() {
        try {
            const cssFile = Gio.File.new_for_path(`${this._extensionDir}/stylesheet.css`);
            if (!cssFile.query_exists(null)) return;

            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) {
                theme.unload_stylesheet(cssFile);
                theme.load_stylesheet(cssFile);
            }
        } catch (_e) {
            // Ignore if theme is mid-transition
        }
    }

    syncFromUiConfig(uiCfg) {
        if (!uiCfg) return;
        const rev = uiCfg.css_revision || 0;
        if (rev > 0 && rev !== this._lastCssRevision) {
            this._lastCssRevision = rev;
            this.reloadStylesheet();
        }
        this._themeMode = uiCfg.theme_mode || 'auto';
        this._recolorPanel = Boolean(uiCfg.recolor_gnome_panel);
        this.applyPanelTheme();
        this._notifyThemeListeners();
    }

    isLightActive() {
        if (this._themeMode === 'light') return true;
        if (this._themeMode === 'dark') return false;
        const scheme = this._interfaceSettings.get_string('color-scheme');
        if (scheme === 'prefer-dark') return false;
        if (scheme === 'prefer-light') return true;
        // GNOME Settings uses 'default' (not 'prefer-light') for standard Light mode,
        // so only fall back to dark when a legacy '-dark' GTK theme is active.
        const gtkTheme = this._interfaceSettings.get_string('gtk-theme') || '';
        return !gtkTheme.toLowerCase().endsWith('-dark');
    }

    applyPanelTheme() {
        if (this._recolorPanel && this.isLightActive()) {
            Main.panel.add_style_class_name('genubar-panel-light');
        } else {
            Main.panel.remove_style_class_name('genubar-panel-light');
        }
    }

    applyPopupThemeClass(popupActor) {
        if (!popupActor) return;
        if (this.isLightActive()) {
            popupActor.remove_style_class_name('genubar-theme-dark');
            popupActor.add_style_class_name('genubar-theme-light');
        } else {
            popupActor.remove_style_class_name('genubar-theme-light');
            popupActor.add_style_class_name('genubar-theme-dark');
        }
    }

    applyPopupMenuTheme(menu) {
        if (!menu) return;
        this.applyPopupThemeClass(menu.box);
        this.applyPopupThemeClass(menu.actor);
    }
}
