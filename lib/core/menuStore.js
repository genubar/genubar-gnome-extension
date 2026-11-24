/**
 * Reactive state store for the currently rendered menu bar, guarding async D-Bus focus races via `focusSeq`.
 */
export class MenuStore {
    constructor() {
        this._focusSeq = 0;
        this._revision = 0;
        this._rawJson = '';
        this._payload = null;
        this._uiConfig = {};
        this._topItems = [];
        this._topNodes = [];
        this._source = '';
        this._hasLiveSync = false;
        this._lastFromLiveDaemon = false;
        this._subscribers = new Set();
    }

    currentFocusSeq() {
        return this._focusSeq;
    }

    bumpFocusSeq() {
        this._focusSeq += 1;
        return this._focusSeq;
    }

    hasLiveSync() {
        return this._hasLiveSync;
    }

    markDaemonLost() {
        this._hasLiveSync = false;
    }

    getSnapshot() {
        return {
            revision: this._revision,
            rawJson: this._rawJson,
            payload: this._payload,
            uiConfig: this._uiConfig,
            topItems: this._topItems,
            topNodes: this._topNodes,
            source: this._source,
            fromLiveDaemon: this._lastFromLiveDaemon,
        };
    }

    getUiConfig() {
        return this._uiConfig;
    }

    getTopNodes() {
        return this._topNodes;
    }

    subscribe(listener) {
        this._subscribers.add(listener);
        return () => this._subscribers.delete(listener);
    }

    _notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this._subscribers) {
            listener(snapshot);
        }
    }

    /**
     * Parses or applies `{ rawJson, payload, expectedSeq, fromLiveDaemon }`.
     * Drops stale D-Bus replies (`expectedSeq !== this._focusSeq`) and duplicate payloads.
     * @returns {object | null} Parsed payload if applied, else null
     */
    apply({ rawJson, payload = null, expectedSeq = null, fromLiveDaemon = false }) {
        if (expectedSeq !== null && expectedSeq !== this._focusSeq) {
            return null;
        }
        if (fromLiveDaemon) {
            this._hasLiveSync = true;
        }
        if (!rawJson) return null;
        if (rawJson === this._rawJson && this._payload !== null) {
            return null;
        }

        let parsed = payload;
        if (!parsed) {
            try {
                parsed = JSON.parse(rawJson);
            } catch (_e) {
                return null;
            }
        }

        const topNodes = (parsed.root?.children || []).filter(node => node.visible);
        const topItems = topNodes.map((node, idx) => ({
            role: node.role || (idx === 0 ? 'app' : 'menu'),
            node,
        }));

        this._revision += 1;
        this._rawJson = rawJson;
        this._payload = parsed;
        this._uiConfig = parsed.ui_config || {};
        this._topNodes = topNodes;
        this._topItems = topItems;
        this._source = parsed.source || '';
        this._lastFromLiveDaemon = Boolean(fromLiveDaemon);

        this._notify();
        return parsed;
    }

    clear() {
        this._revision += 1;
        this._rawJson = '';
        this._payload = null;
        this._topNodes = [];
        this._topItems = [];
        this._source = '';
        this._hasLiveSync = false;
        this._lastFromLiveDaemon = false;
        this._notify();
    }
}
