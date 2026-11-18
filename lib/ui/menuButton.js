import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { CascadeController } from './cascadeController.js';

function labelStyleForRole(role) {
    return role === 'app' ? 'genubar-app-button' : 'genubar-menu-button';
}

/**
 * Composition wrapper around `PanelMenu.Button` avoiding monkey-patching on GNOME Shell actors
 * and supporting `'logo' | 'app' | 'menu'` button roles cleanly.
 */
export class MenuButton {
    constructor({ label, role, node, sourceKind, revision, cascadeDeps }) {
        this._isDestroyed = false;
        this._role = role;
        this._cleanLabel = label;

        this.actor = new PanelMenu.Button(0.0, label, false);
        this.actor.add_style_class_name('genubar-panel-button');

        if (this.actor.menu.setSourceAlignment) {
            this.actor.menu.setSourceAlignment(0.0);
        } else if (this.actor.menu._boxPointer) {
            this.actor.menu._boxPointer._sourceAlignment = 0.0;
        }

        this._labelActor = new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: labelStyleForRole(role),
        });
        this._labelActor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this.actor.add_child(this._labelActor);

        this._cascade = new CascadeController({
            ...cascadeDeps,
            popupMenu: this.actor.menu,
            isDestroyed: () => this._isDestroyed,
            rootNodeId: node.id,
            sourceKind,
            initialChildren: node.children || [],
            revision,
        });
    }

    isPopupOpen() {
        return Boolean(this.actor?.menu?.isOpen);
    }

    setContent({ label, role }) {
        if (this._cleanLabel !== label) {
            this._cleanLabel = label;
            this._labelActor.set_text(label);
        }
        if (this._role !== role) {
            this._role = role;
            this._labelActor.set_style_class_name(labelStyleForRole(role));
        }
    }

    updateRootNode({ node, sourceKind, revision }) {
        this._cascade.updateRoot({
            nodeId: node.id,
            sourceKind,
            children: node.children || [],
            revision,
        });
    }

    show() {
        if (!this.actor.visible) this.actor.show();
        if (this.actor.container && !this.actor.container.visible) {
            this.actor.container.show();
        }
    }

    hide() {
        if (this.actor.menu?.isOpen) {
            this.actor.menu.close(false);
        }
        if (this.actor.visible) this.actor.hide();
        if (this.actor.container?.visible) {
            this.actor.container.hide();
        }
    }

    clearHoverTimer() {
        this._cascade?.clearHoverTimer();
    }

    refreshTheme() {
        this._cascade?.refreshTheme();
    }

    destroy() {
        this._isDestroyed = true;
        this._cascade?.destroy();
        this._cascade = null;
        try {
            this.actor?.destroy();
        } catch (_e) {
            // Actor may already be disposed
        }
        this.actor = null;
        this._labelActor = null;
    }
}
