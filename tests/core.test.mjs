import {
    cleanMnemonicLabel,
    isVersionAtLeast,
    parseSemver,
    truncateMiddle,
} from '../lib/core/textUtils.js';
import {
    collectSearchableLeaves,
    hasDynamicMenuNodes,
    isLazyMenuSource,
    isSearchBarNode,
    isSubmenuNode,
    isWindowListNode,
    sanitizeMenuSeparators,
} from '../lib/core/menuModel.js';
import {
    computeColumnSlotReservation,
    resolveCheckRadioState,
} from '../lib/core/slotLayout.js';
import { L0MenuCache } from '../lib/core/l0Cache.js';
import { MenuStore } from '../lib/core/menuStore.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// 1. textUtils
assert(cleanMnemonicLabel('Show _Hidden Files') === 'Show Hidden Files', 'cleanMnemonicLabel strips mnemonic _');
assert(cleanMnemonicLabel('A__B_C') === 'A_BC', 'cleanMnemonicLabel preserves escaped __');
assert(cleanMnemonicLabel('', 'Menu') === 'Menu', 'cleanMnemonicLabel uses fallback');
assert(JSON.stringify(parseSemver('v1.2.3-rc1')) === '[1,2,3]', 'parseSemver handles v prefix & prerelease');
assert(isVersionAtLeast('0.2.0', '0.1.9') === true, 'isVersionAtLeast gt');
assert(isVersionAtLeast('0.1.0', '0.1.0') === true, 'isVersionAtLeast eq');
assert(isVersionAtLeast('0.0.9', '0.1.0') === false, 'isVersionAtLeast lt');
assert(truncateMiddle('Short', 20) === 'Short', 'truncateMiddle leaves short titles intact');
assert(truncateMiddle('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 14).includes(' … '), 'truncateMiddle shortens long titles');

// 2. menuModel & slotLayout
assert(isLazyMenuSource('Canonical-DBusMenu') && isLazyMenuSource('AT-SPI2'), 'lazy sources');
assert(!isLazyMenuSource('GTK4-Hook'), 'non-lazy source');
assert(isSubmenuNode({ item_type: 'Submenu' }), 'isSubmenuNode explicit');
assert(isSubmenuNode({ item_type: 'Standard', children: [{}] }), 'isSubmenuNode non-empty children');
assert(isWindowListNode({ item_type: { WindowList: { min_windows_to_show: 1 } } }), 'isWindowListNode');
assert(isSearchBarNode({ item_type: 'SearchBar' }), 'isSearchBarNode');

assert(
    hasDynamicMenuNodes([{ action: 'sys:always_on_top' }], act => act === 'sys:always_on_top') === true,
    'hasDynamicMenuNodes honors dynamic action callback'
);

const sanitized = sanitizeMenuSeparators([
    { visible: true, item_type: 'Separator' },
    { visible: false, item_type: 'Standard' },
    { visible: true, item_type: 'Standard', label: 'One' },
    { visible: true, item_type: 'Separator' },
    { visible: true, item_type: 'Separator' },
    { visible: true, item_type: 'Standard', label: 'Two' },
    { visible: true, item_type: 'Separator' },
]);
assert(sanitized.length === 3 && sanitized[1].item_type === 'Separator', 'sanitizeMenuSeparators');

const matches = collectSearchableLeaves(
    [
        {
            visible: true,
            enabled: true,
            label: '_View',
            item_type: 'Submenu',
            children: [
                { visible: true, enabled: true, label: 'Show _Hidden Files', item_type: { Check: true } },
                { visible: true, enabled: false, label: 'Disabled Action', item_type: 'Standard' },
            ],
        },
    ],
    'hidden',
    10
);
assert(matches.length === 1 && matches[0].fullLabel === 'View ▸ Show Hidden Files', 'collectSearchableLeaves');

const dynamicOverride = resolveCheckRadioState(
    { action: 'sys:always_on_top', item_type: { Check: false }, children: [] },
    () => true
);
assert(dynamicOverride.checkKind === 'check' && dynamicOverride.isChecked === true, 'resolveCheckRadioState override');

const resAuto = computeColumnSlotReservation(
    [{ visible: true, item_type: { Check: true }, icon: null }],
    { show_menu_icons: true, icon_column_policy: 'auto', check_column_policy: 'auto' }
);
assert(resAuto.reserveCheckCol === true && resAuto.reserveIconCol === false, 'computeColumnSlotReservation');

// 3. L0MenuCache LRU eviction & invalidation
const l0 = new L0MenuCache(2);
l0.setFromPayload({ pid: 10, app_id: 'a' }, '{"pid":10}');
l0.setFromPayload({ pid: 20, app_id: 'b' }, '{"pid":20}');
assert(l0.getForWindow(10, '')?.rawJson === '{"pid":10}', 'L0 LRU touch promotes pid 10');
l0.setFromPayload({ pid: 30, app_id: 'c' }, '{"pid":30}');
assert(l0.getForWindow(20, '') === null, 'L0 LRU evicts least recently used pid 20');
assert(l0.getForWindow(10, '')?.rawJson === '{"pid":10}', 'L0 retains promoted pid 10');
l0.invalidatePid(10);
assert(l0.getForWindow(10, 'a')?.rawJson === '{"pid":10}', 'L0 falls back to app_id after pid invalidation');
l0.clear();
assert(l0.getDesktop() === null && l0.getForWindow(30, 'c') === null, 'L0 clear');

// 4. MenuStore focusSeq race guard & subscriptions
const store = new MenuStore();
let seenSnapshots = 0;
const unsub = store.subscribe(() => {
    seenSnapshots += 1;
});

const seq1 = store.bumpFocusSeq();
const seq2 = store.bumpFocusSeq();
assert(
    store.apply({ rawJson: '{"root":{"children":[]}}', expectedSeq: seq1, fromLiveDaemon: true }) === null,
    'MenuStore drops stale D-Bus reply from old focusSeq'
);
assert(!store.hasLiveSync(), 'dropped stale reply does not mark live sync');

const validJson = JSON.stringify({
    source: 'GTK4-Hook',
    ui_config: { theme_mode: 'dark', css_revision: 42 },
    root: { children: [{ id: 1, label: 'Files', visible: true, children: [] }] },
});
const cachedJson = JSON.stringify({
    source: 'GTK4-Hook',
    ui_config: { theme_mode: 'dark', css_revision: 1 },
    root: { children: [{ id: 1, label: 'Cached Files', visible: true, children: [] }] },
});
assert(store.apply({ rawJson: cachedJson, expectedSeq: seq2, fromLiveDaemon: false }) !== null, 'MenuStore applies L0 cache payload');
assert(store.getSnapshot().fromLiveDaemon === false, 'L0 cache paint marks fromLiveDaemon=false');
assert(!store.hasLiveSync(), 'L0 cache paint does not mark live sync');

assert(store.apply({ rawJson: validJson, expectedSeq: seq2, fromLiveDaemon: true }) !== null, 'MenuStore applies matching focusSeq');
assert(store.getSnapshot().fromLiveDaemon === true, 'live daemon reply marks fromLiveDaemon=true');
assert(store.hasLiveSync(), 'applied daemon reply marks live sync');
assert(seenSnapshots === 2, 'MenuStore notifies subscriber on cache and live updates');
assert(store.apply({ rawJson: validJson, expectedSeq: seq2, fromLiveDaemon: true }) === null, 'MenuStore deduplicates identical JSON');
assert(seenSnapshots === 2, 'duplicate JSON does not re-notify');

store.clear();
assert(
    seenSnapshots === 3 &&
        store.getTopNodes().length === 0 &&
        !store.hasLiveSync() &&
        store.getSnapshot().fromLiveDaemon === false,
    'MenuStore clear resets state'
);
unsub();

const modDbus = await import('../lib/ipc/dbusClient.js');
const client = new modDbus.TrackerDbusClient(() => false);
client.destroy();
const modWin = await import('../lib/platform/windowActions.js');
assert(modWin.isDynamicWindowAction('sys:always_on_top') === true, 'WINDOW_ACTIONS dynamic flag');
assert(modWin.executeWindowAction('nonexistent:cmd') === false, 'unknown action false');
const modWl = await import('../lib/ui/windowListExpander.js');
assert(modWl.expandWindowListNodes([], null).length === 0, 'windowListExpander empty');

print('All core GJS unit tests passed.');
