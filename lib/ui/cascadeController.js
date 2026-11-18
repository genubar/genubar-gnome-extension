import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { hasDynamicMenuNodes, isLazyMenuSource } from '../core/menuModel.js';
import { isDynamicWindowAction } from '../platform/windowActions.js';
import { buildMenuColumn, createLoadingColumn } from './menuColumn.js';

const HOVER_OPEN_DELAY_MS = 130;

function createPlaceholderNodes(label) {
    return [
        {
            id: -999,
            label,
            enabled: false,
            visible: true,
            item_type: 'Standard',
            children: [],
        },
    ];
}

/**
 * Owns the open column stack, 130ms hover timer, and read-only lazy submenu cache for one button.
 */
export class CascadeController {
    constructor({
        popupMenu,
        isDestroyed,
        isActive,
        themeManager,
        fetchSubmenu,
        getUiConfig,
        getTopNodes,
        iconCache,
        actionDispatcher,
        rootNodeId,
        sourceKind,
        initialChildren,
        revision,
    }) {
        this._popupMenu = popupMenu;
        this._isDestroyed = isDestroyed;
        this._isActive = isActive;
        this._theme = themeManager;
        this._fetchSubmenu = fetchSubmenu;
        this._getUiConfig = getUiConfig;
        this._getTopNodes = getTopNodes;
        this._iconCache = iconCache;
        this._actions = actionDispatcher;

        this._openColumns = [];
        this._lazyCache = new Map();
        this._fetchSeqByDepth = new Map();
        this._hoverTimerId = null;
        this._rootNodeId = rootNodeId;
        this._sourceKind = sourceKind;
        this._currentChildren = initialChildren || [];
        this._lastRevision = revision || 0;
        this._isRootDirty = true;

        popupMenu.box.add_style_class_name('genubar-popup-content');
        this._theme.applyPopupMenuTheme(popupMenu);

        this._columnsContainer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'genubar-columns-container',
        });
        popupMenu.box.add_child(this._columnsContainer);

        const placeholder = createLoadingColumn(0);
        this._columnsContainer.add_child(placeholder);
        this._openColumns.push(placeholder);

        this._openStateSignalId = popupMenu.connect('open-state-changed', (_menu, isOpen) => {
            this.clearHoverTimer();
            if (this._isDestroyed() || !this._isActive()) return;
            if (isOpen) {
                const effectiveRoot = this._getEffectiveNodes(this._rootNodeId, this._currentChildren);
                const isLazyEmpty = isLazyMenuSource(this._sourceKind) && effectiveRoot.length === 0;
                if (
                    this._isRootDirty ||
                    this._openColumns.length === 0 ||
                    hasDynamicMenuNodes(effectiveRoot, isDynamicWindowAction) ||
                    isLazyEmpty
                ) {
                    this._rebuildRootColumn();
                } else {
                    this._theme.applyPopupMenuTheme(this._popupMenu);
                }
            } else {
                this._closeColumnsFrom(1);
            }
        });
    }

    _getEffectiveNodes(nodeId, rawChildren) {
        const cached = this._lazyCache.get(nodeId);
        if (cached && cached.length > 0) return cached;
        return rawChildren || [];
    }

    clearHoverTimer() {
        if (this._hoverTimerId !== null) {
            GLib.Source.remove(this._hoverTimerId);
            this._hoverTimerId = null;
        }
    }

    refreshTheme() {
        if (this._isDestroyed() || !this._popupMenu) return;
        this._theme.applyPopupMenuTheme(this._popupMenu);
    }

    _scheduleHover(callback) {
        this.clearHoverTimer();
        this._hoverTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_DELAY_MS, () => {
            this._hoverTimerId = null;
            if (!this._isDestroyed()) {
                callback();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _bumpFetchSeqFrom(startDepth) {
        for (const [depth, seq] of this._fetchSeqByDepth.entries()) {
            if (depth >= startDepth) {
                this._fetchSeqByDepth.set(depth, seq + 1);
            }
        }
    }

    _closeColumnsFrom(startDepth) {
        this._bumpFetchSeqFrom(startDepth);
        while (this._openColumns.length > startDepth) {
            const col = this._openColumns.pop();
            try {
                if (col.get_parent() === this._columnsContainer) {
                    this._columnsContainer.remove_child(col);
                }
                col.destroy();
            } catch (_e) {
                // Column actor may already be tearing down
            }
        }
    }

    _appendRenderedColumn(nodes, depth) {
        const col = buildMenuColumn({
            rawNodes: nodes,
            depth,
            rootPopupMenu: this._popupMenu,
            isButtonDestroyed: this._isDestroyed,
            getUiConfig: this._getUiConfig,
            getTopNodes: this._getTopNodes,
            iconCache: this._iconCache,
            actionDispatcher: this._actions,
            onOpenSubmenu: (childNode, isStillSelected) => {
                if (this._isDestroyed() || !this._popupMenu.isOpen || !childNode.enabled) return;
                this._closeColumnsFrom(depth + 1);
                this._openOrFetchColumn({
                    depth: depth + 1,
                    nodeId: childNode.id,
                    existingNodes: this._getEffectiveNodes(childNode.id, childNode.children),
                    isStillValid: isStillSelected,
                });
            },
            onClearSubmenu: () => this._closeColumnsFrom(depth + 1),
            scheduleHover: cb => this._scheduleHover(cb),
            clearHover: () => this.clearHoverTimer(),
        });
        this._columnsContainer.add_child(col);
        this._openColumns.push(col);
    }

    _openOrFetchColumn({ depth, nodeId, existingNodes, isStillValid, onRendered = null }) {
        if (existingNodes.length === 0 && isLazyMenuSource(this._sourceKind) && nodeId > 0) {
            const fetchSeq = (this._fetchSeqByDepth.get(depth) || 0) + 1;
            this._fetchSeqByDepth.set(depth, fetchSeq);

            const loadingCol = createLoadingColumn(depth);
            this._columnsContainer.add_child(loadingCol);
            this._openColumns.push(loadingCol);

            const finishFetch = (nodes, isError = false) => {
                if (
                    this._isDestroyed() ||
                    this._fetchSeqByDepth.get(depth) !== fetchSeq ||
                    !isStillValid()
                ) {
                    return;
                }
                const renderNodes = nodes.length > 0
                    ? nodes
                    : createPlaceholderNodes(isError ? 'Unavailable' : 'Empty');
                if (nodes.length > 0) {
                    this._lazyCache.set(nodeId, nodes);
                    onRendered?.();
                }
                this._closeColumnsFrom(depth);
                this._appendRenderedColumn(renderNodes, depth);
            };

            this._fetchSubmenu(
                nodeId,
                fetched => finishFetch(fetched || [], false),
                () => finishFetch([], true)
            );
        } else {
            this._appendRenderedColumn(existingNodes, depth);
            onRendered?.();
        }
    }

    _rebuildRootColumn() {
        if (this._isDestroyed() || !this._isActive()) return;
        this._theme.applyPopupMenuTheme(this._popupMenu);
        this._closeColumnsFrom(0);

        const effectiveNodes = this._getEffectiveNodes(this._rootNodeId, this._currentChildren);
        this._openOrFetchColumn({
            depth: 0,
            nodeId: this._rootNodeId,
            existingNodes: effectiveNodes,
            isStillValid: () => !this._isDestroyed() && this._popupMenu.isOpen,
            onRendered: () => {
                this._isRootDirty = false;
            },
        });
    }

    updateRoot({ nodeId, sourceKind, children, revision }) {
        const nextChildren = children || [];
        if (
            this._lastRevision === revision &&
            this._rootNodeId === nodeId &&
            this._sourceKind === sourceKind &&
            this._currentChildren === nextChildren
        ) {
            return;
        }

        this._lastRevision = revision;
        this._rootNodeId = nodeId;
        this._sourceKind = sourceKind;
        this._currentChildren = nextChildren;
        this._lazyCache.clear();
        this._isRootDirty = true;

        if (this._popupMenu.isOpen && this._openColumns.length <= 1) {
            this._rebuildRootColumn();
        }
    }

    destroy() {
        this.clearHoverTimer();
        if (this._openStateSignalId && this._popupMenu) {
            try {
                this._popupMenu.disconnect(this._openStateSignalId);
            } catch (_e) {
                // Ignore disposed menu
            }
            this._openStateSignalId = null;
        }
        this._lazyCache.clear();
        this._fetchSeqByDepth.clear();
        this._openColumns = [];
        this._popupMenu = null;
        this._theme = null;
        this._actions = null;
        this._iconCache = null;
    }
}
