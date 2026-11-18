import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

const DEFAULT_MAX_FILE_ICONS = 256;

/**
 * Bounded LRU cache for file-backed `Gio.Icon` instances and aligned `St.Icon` slot widgets.
 */
export class IconCache {
    constructor(maxEntries = DEFAULT_MAX_FILE_ICONS) {
        this._maxEntries = Math.max(16, maxEntries);
        this._fileIconCache = new Map();
    }

    clear() {
        this._fileIconCache.clear();
    }

    _getFileIcon(iconPath) {
        const expanded = iconPath.startsWith('~/')
            ? `${GLib.get_home_dir()}/${iconPath.slice(2)}`
            : iconPath;

        if (this._fileIconCache.has(expanded)) {
            const cached = this._fileIconCache.get(expanded);
            this._fileIconCache.delete(expanded);
            this._fileIconCache.set(expanded, cached);
            return cached;
        }

        const gicon = Gio.icon_new_for_string(expanded);
        if (this._fileIconCache.size >= this._maxEntries) {
            const oldest = this._fileIconCache.keys().next().value;
            this._fileIconCache.delete(oldest);
        }
        this._fileIconCache.set(expanded, gicon);
        return gicon;
    }

    buildSlot(iconNameOrPath, sizePx, isEnabled) {
        if (!iconNameOrPath) {
            return new St.Widget({
                width: sizePx,
                style_class: 'genubar-item-icon',
            });
        }

        const isFileIcon = iconNameOrPath.startsWith('/') || iconNameOrPath.startsWith('~/');
        const iconProps = {
            icon_size: sizePx,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: isEnabled ? 'genubar-item-icon' : 'genubar-item-icon-disabled',
        };

        if (isFileIcon) {
            iconProps.gicon = this._getFileIcon(iconNameOrPath);
        } else {
            iconProps.icon_name = iconNameOrPath;
        }

        const actor = new St.Icon(iconProps);
        if (!isEnabled && isFileIcon) {
            actor.set_opacity(115);
        }
        return actor;
    }
}
