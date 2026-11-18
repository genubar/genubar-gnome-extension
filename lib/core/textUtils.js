/**
 * Removes GTK/Qt mnemonic underscores while preserving escaped doubled underscores (`__` -> `_`).
 * @param {string | null | undefined} label
 * @param {string} [fallback='']
 * @returns {string}
 */
export function cleanMnemonicLabel(label, fallback = '') {
    if (!label) return fallback;
    const cleaned = String(label)
        .replace(/__/g, '\u0000')
        .replace(/_/g, '')
        .replace(/\u0000/g, '_')
        .trim();
    return cleaned || fallback;
}

/**
 * Parses a SemVer string (`"v1.2.3-beta"` -> `[1, 2, 3]`).
 * @param {string | null | undefined} versionStr
 * @returns {number[]}
 */
export function parseSemver(versionStr) {
    return String(versionStr || '0')
        .trim()
        .replace(/^v/i, '')
        .split('-')[0]
        .split('.')
        .map(part => {
            const match = part.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        });
}

/**
 * Returns true when `current` is >= `required` under numeric SemVer comparison.
 * @param {string} current
 * @param {string} required
 * @returns {boolean}
 */
export function isVersionAtLeast(current, required) {
    const curParts = parseSemver(current);
    const reqParts = parseSemver(required);
    const maxLen = Math.max(curParts.length, reqParts.length);

    for (let i = 0; i < maxLen; i++) {
        const curVal = curParts[i] ?? 0;
        const reqVal = reqParts[i] ?? 0;
        if (curVal > reqVal) return true;
        if (curVal < reqVal) return false;
    }
    return true;
}

/**
 * Truncates long strings in the middle while preserving leading and trailing context.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateMiddle(text, maxLen) {
    if (!maxLen || maxLen < 10 || !text || text.length <= maxLen) {
        return text || '';
    }
    const headLen = Math.ceil((maxLen - 3) * 0.55);
    const tailLen = maxLen - 3 - headLen;
    return `${text.slice(0, headLen).trimEnd()} … ${text.slice(text.length - tailLen).trimStart()}`;
}
