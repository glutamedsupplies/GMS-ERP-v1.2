const assert = require('assert');
const { canAccessWorkspaceConfig } = require('../lib/http-server');

assert.strictEqual(canAccessWorkspaceConfig({ role: 'head_admin' }), true, 'head admins should be allowed');
assert.strictEqual(
    canAccessWorkspaceConfig({ role: 'employee', user: { feature_access: { order_form: true } } }),
    true,
    'employees with order form access should be allowed'
);
assert.strictEqual(
    canAccessWorkspaceConfig({ role: 'employee', user: { feature_access: { order_form: false } } }),
    false,
    'employees without order form access should be denied'
);
assert.strictEqual(
    canAccessWorkspaceConfig({ role: 'employee', permissions: ['customize_order_form'] }),
    true,
    'explicit customize permission should be allowed'
);

console.log('order-form setup permission tests passed');
