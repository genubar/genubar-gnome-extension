import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PANEL_INSERT_INDEX = 1;

/**
 * Isolates all direct `Main.panel` mutations (dateMenu center-box relocation and statusArea cleanup).
 */
export class PanelAdapter {
    constructor() {
        this._movedDateMenu = false;
    }

    unlockPanelWidth() {
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        const dateMenu = Main.panel.statusArea.dateMenu;

        if (dateMenu && dateMenu.container.get_parent() === centerBox) {
            centerBox.remove_child(dateMenu.container);
            rightBox.insert_child_at_index(dateMenu.container, 0);
            this._movedDateMenu = true;
        }
        if (centerBox && centerBox.get_n_children() === 0) {
            centerBox.hide();
        }
    }

    restorePanelWidth() {
        const centerBox = Main.panel._centerBox;
        const rightBox = Main.panel._rightBox;
        const dateMenu = Main.panel.statusArea.dateMenu;

        if (centerBox) {
            centerBox.show();
        }
        if (this._movedDateMenu && dateMenu && dateMenu.container.get_parent() === rightBox) {
            rightBox.remove_child(dateMenu.container);
            centerBox.add_child(dateMenu.container);
            this._movedDateMenu = false;
        }
    }

    addMenuButton(index, buttonActor) {
        Main.panel.addToStatusArea(
            `genubar-menu-${index}`,
            buttonActor,
            PANEL_INSERT_INDEX + index,
            'left'
        );
    }

    removeOrphanedStatusButtons() {
        if (!Main.panel?.statusArea) return;
        for (const key of Object.keys(Main.panel.statusArea)) {
            if (key.startsWith('genubar-')) {
                try {
                    const leftover = Main.panel.statusArea[key];
                    if (leftover) {
                        leftover.destroy();
                    }
                } catch (_e) {
                    // Actor may already be disposed
                }
                delete Main.panel.statusArea[key];
            }
        }
    }

    destroy() {
        this.removeOrphanedStatusButtons();
        this.restorePanelWidth();
    }
}
