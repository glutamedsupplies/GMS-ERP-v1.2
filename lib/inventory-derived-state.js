const stateByDb = new WeakMap();

function getInventoryDerivedState(db) {
    if (!db || (typeof db !== 'object' && typeof db !== 'function')) {
        return {
            dirty: true,
            branchSignature: ''
        };
    }

    const existing = stateByDb.get(db);
    if (existing) {
        return existing;
    }

    const initialState = {
        dirty: true,
        branchSignature: ''
    };
    stateByDb.set(db, initialState);
    return initialState;
}

function markInventoryDerivedDataDirty(db) {
    const state = getInventoryDerivedState(db);
    state.dirty = true;
    state.branchSignature = '';
}

module.exports = {
    getInventoryDerivedState,
    markInventoryDerivedDataDirty
};
