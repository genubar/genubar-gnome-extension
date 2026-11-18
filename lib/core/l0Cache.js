const DEFAULT_MAX_ENTRIES = 64;

function lruGet(map, key) {
    if (!map.has(key)) return null;
    const entry = map.get(key);
    map.delete(key);
    map.set(key, entry);
    return entry;
}

function lruSet(map, key, value, maxEntries) {
    if (map.has(key)) {
        map.delete(key);
    } else if (map.size >= maxEntries) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
    map.set(key, value);
}

/**
 * Bounded LRU in-memory L0 cache storing `{ rawJson, payload }` pairs by PID, AppID, and Desktop.
 */
export class L0MenuCache {
    constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
        this._maxEntries = Math.max(1, maxEntries);
        this._byPid = new Map();
        this._byAppId = new Map();
        this._desktopEntry = null;
    }

    getDesktop() {
        return this._desktopEntry;
    }

    getForWindow(pid, appId) {
        if (pid > 0) {
            const byPid = lruGet(this._byPid, pid);
            if (byPid) {
                const syncAppId = appId || byPid.payload?.app_id;
                if (syncAppId) {
                    lruGet(this._byAppId, syncAppId);
                }
                return byPid;
            }
        }
        if (appId) {
            return lruGet(this._byAppId, appId);
        }
        return null;
    }

    setFromPayload(payload, rawJson) {
        if (!payload || !rawJson) return;
        const entry = { rawJson, payload };
        if (payload.pid > 0) {
            lruSet(this._byPid, payload.pid, entry, this._maxEntries);
            if (payload.app_id) {
                lruSet(this._byAppId, payload.app_id, entry, this._maxEntries);
            }
        } else {
            this._desktopEntry = entry;
        }
    }

    invalidatePid(pid) {
        if (pid > 0) {
            this._byPid.delete(pid);
        }
    }

    clear() {
        this._byPid.clear();
        this._byAppId.clear();
        this._desktopEntry = null;
    }
}
