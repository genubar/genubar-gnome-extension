import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { collectSearchableLeaves } from '../core/menuModel.js';
import { createMenuItemRow } from './menuRow.js';

const MAX_SEARCH_RESULTS = 10;

/**
 * Inline SearchBar widget placed inside Help (or profile-configured submenus),
 * sharing `createMenuItemRow` for result styling and supporting Enter activation.
 */
export function createInlineSearchBar({
    rootPopupMenu,
    placeholderText,
    getTopNodes,
    actionDispatcher,
    clearHover,
}) {
    const wrapper = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
    });

    const searchEntry = new St.Entry({
        hint_text: placeholderText,
        can_focus: true,
        reactive: true,
        style_class: 'genubar-search-entry',
    });

    const resultsBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
    });

    wrapper.add_child(searchEntry);
    wrapper.add_child(resultsBox);

    let currentMatches = [];

    searchEntry.clutter_text.connect('text-changed', () => {
        resultsBox.destroy_all_children();
        currentMatches = collectSearchableLeaves(
            getTopNodes?.() || [],
            searchEntry.get_text(),
            MAX_SEARCH_RESULTS
        );

        for (const match of currentMatches) {
            const row = createMenuItemRow({
                node: match.node,
                labelOverride: match.fullLabel,
                showSlots: false,
                rootPopupMenu,
                actionDispatcher,
                clearHover,
            });
            if (row) {
                resultsBox.add_child(row);
            }
        }
    });

    searchEntry.clutter_text.connect('activate', () => {
        if (currentMatches.length === 0) return;
        const topMatch = currentMatches[0].node;
        clearHover?.();
        rootPopupMenu.close(false);
        actionDispatcher.trigger(topMatch.id, topMatch.action);
    });

    return wrapper;
}
