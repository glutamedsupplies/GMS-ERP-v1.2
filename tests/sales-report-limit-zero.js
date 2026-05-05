#!/usr/bin/env node

'use strict';

const assert = require('assert');

const { normalizeListQueryLimit } = require('../lib/http-server');

assert.strictEqual(
    normalizeListQueryLimit(undefined, { allowUnlimited: true }),
    500,
    'missing query limit should keep the default page size'
);

assert.strictEqual(
    normalizeListQueryLimit('0', { allowUnlimited: true }),
    0,
    'limit=0 should stay unlimited for report-style routes'
);

assert.strictEqual(
    normalizeListQueryLimit(0, { allowUnlimited: false }),
    500,
    'limit=0 should still fall back to the default when unlimited mode is disabled'
);

assert.strictEqual(
    normalizeListQueryLimit('25', { allowUnlimited: true }),
    25,
    'positive limits should pass through unchanged'
);

assert.strictEqual(
    normalizeListQueryLimit(99999, { allowUnlimited: true }),
    2500,
    'positive limits should still respect the hard server cap'
);

console.log('sales-report-limit-zero: all checks passed');
