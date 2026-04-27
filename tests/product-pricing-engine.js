#!/usr/bin/env node

'use strict';

const assert = require('assert');

const {
    round2,
    computeProductPricing
} = require('../lib/product-pricing');

function expectThrows(fn, messagePattern, label) {
    let thrownError = null;

    try {
        fn();
    } catch (error) {
        thrownError = error;
    }

    assert(thrownError, `${label} should throw`);
    assert(
        messagePattern.test(String(thrownError.message || thrownError)),
        `${label} should match ${messagePattern}, received "${thrownError && thrownError.message}"`
    );
}

function runCompositeExample() {
    const compositeProduct = {
        productId: 'SET-5GS',
        productName: '5GS Set',
        isComposite: true,
        regularPrice: 2850,
        discountedPrice: 2700
    };

    const components = [
        {
            componentId: 'COMP-5GS',
            componentName: '5GS',
            qtyPerSet: 1,
            originalUnitCost: 2600,
            stockOnHand: 20
        },
        {
            componentId: 'COMP-BUTTERFLY',
            componentName: 'Butterfly',
            qtyPerSet: 10,
            originalUnitCost: 5,
            stockOnHand: 150
        },
        {
            componentId: 'COMP-SYRINGE',
            componentName: '10cc Syringe',
            qtyPerSet: 10,
            originalUnitCost: 5,
            stockOnHand: 300
        },
        {
            componentId: 'COMP-WATER',
            componentName: '10ml Sterile Water',
            qtyPerSet: 10,
            originalUnitCost: 15,
            stockOnHand: 220
        }
    ];

    const result = computeProductPricing(compositeProduct, components, 1);
    const adjustedTotal = round2(result.components.reduce((sum, item) => sum + item.adjustedLineTotal, 0));

    assert.strictEqual(result.productId, 'SET-5GS', 'composite product id should be returned');
    assert.strictEqual(result.productName, '5GS Set', 'composite product name should be returned');
    assert.strictEqual(result.orderQty, 1, 'composite order quantity should be preserved');
    assert.strictEqual(result.isComposite, true, 'composite flag should be true');
    assert.strictEqual(result.originalCostPerSet, 2850, 'original composite cost per set should be correct');
    assert.strictEqual(result.sellingPricePerSet, 2700, 'discounted selling price per set should be used');
    assert.strictEqual(result.originalTotalCost, 2850, 'original order total cost should be correct');
    assert.strictEqual(result.sellingPrice, 2700, 'selling price should match the discounted set price');
    assert.strictEqual(result.discountAmount, 150, 'discount amount should be preserved');
    assert.strictEqual(result.profitOrLoss, -150, 'profit/loss should compare selling price to original component total');
    assert.strictEqual(result.originalCostPerUnit, 2850, 'composite unit cost should match one parent set cost');
    assert.strictEqual(result.sellingPricePerUnit, 2700, 'composite sold price per unit should match one parent set price');
    assert.strictEqual(result.discountPerUnit, 150, 'composite discount per unit should be exposed');
    assert.strictEqual(result.profitOrLossPerUnit, -150, 'composite profit/loss per unit should be exposed');
    assert.strictEqual(result.productCosting.originalCostPerUnit, 2850, 'composite costing summary should expose unit cost');
    assert.strictEqual(result.productCosting.sellingPricePerUnit, 2700, 'composite costing summary should expose unit selling price');
    assert.strictEqual(result.productCosting.totalSellingPrice, 2700, 'composite costing summary should expose total selling price');
    assert.strictEqual(result.components.length, 4, 'all components should be returned');
    assert.strictEqual(adjustedTotal, 2700, 'allocated adjusted totals should reconcile to the selling price');
    assert.strictEqual(result.movementInsight.status, 'COMPLETE_READY_TO_SELL', 'ready composite stock should be sellable');
    assert.strictEqual(result.movementInsight.isSellable, true, 'movement insight should mark the product as sellable');
    assert.strictEqual(result.movementInsight.maxBuildableQty, 15, 'movement insight should use the lowest buildable component');
}

function runCompositeRoundingExample() {
    const product = {
        productId: 'ROUND-SET',
        productName: 'Rounded Set',
        isComposite: true,
        discountedPrice: 95
    };

    const components = [
        { componentId: 'A', componentName: 'Part A', qtyPerSet: 1, originalUnitCost: 33.33, stockOnHand: 10 },
        { componentId: 'B', componentName: 'Part B', qtyPerSet: 1, originalUnitCost: 33.33, stockOnHand: 10 },
        { componentId: 'C', componentName: 'Part C', qtyPerSet: 1, originalUnitCost: 33.34, stockOnHand: 10 }
    ];

    const result = computeProductPricing(product, components, 1);
    const adjustedTotal = round2(result.components.reduce((sum, item) => sum + item.adjustedLineTotal, 0));

    assert.strictEqual(result.originalCostPerSet, 100, 'rounding example should compute original component total');
    assert.strictEqual(result.sellingPrice, 95, 'rounding example should use discounted selling price');
    assert.strictEqual(adjustedTotal, 95, 'rounding example should reconcile component allocations exactly');
}

function runNonCompositeExample() {
    const normalProduct = {
        productId: 'VC-01',
        productName: 'Vitamin C Drip',
        regularPrice: 1200,
        discountedPrice: 1100,
        costPrice: 700,
        stockOnHand: 3
    };

    const result = computeProductPricing(normalProduct, [], 2);

    assert.strictEqual(result.productId, 'VC-01', 'normal product id should be returned');
    assert.strictEqual(result.productName, 'Vitamin C Drip', 'normal product name should be returned');
    assert.strictEqual(result.orderQty, 2, 'normal order quantity should be preserved');
    assert.strictEqual(result.isComposite, false, 'normal product should not be composite');
    assert.strictEqual(result.originalCostPerSet, 700, 'normal product cost should come from the product cost');
    assert.strictEqual(result.sellingPricePerSet, 1100, 'normal product should use discounted selling price');
    assert.strictEqual(result.originalTotalCost, 1400, 'normal product total cost should scale by order quantity');
    assert.strictEqual(result.sellingPrice, 2200, 'normal product selling price should scale by order quantity');
    assert.strictEqual(result.discountAmount, 200, 'normal product discount should compare regular and discounted price');
    assert.strictEqual(result.profitOrLoss, 800, 'normal product profit should use true cost');
    assert.strictEqual(result.originalCostPerUnit, 700, 'normal product should expose per-unit cost');
    assert.strictEqual(result.sellingPricePerUnit, 1100, 'normal product should expose per-unit selling price');
    assert.strictEqual(result.discountPerUnit, 100, 'normal product should expose per-unit discount');
    assert.strictEqual(result.profitOrLossPerUnit, 400, 'normal product should expose per-unit profit');
    assert.strictEqual(result.productCosting.originalTotalCost, 1400, 'normal costing summary should expose total cost');
    assert.strictEqual(result.productCosting.totalProfitOrLoss, 800, 'normal costing summary should expose total profit');
    assert.deepStrictEqual(result.components, [], 'normal products should not return component rows');
    assert.strictEqual(result.movementInsight.status, 'AVAILABLE_READY_TO_SELL', 'stock should be available for the requested quantity');
    assert.strictEqual(result.movementInsight.isSellable, true, 'normal product should be sellable');
    assert.strictEqual(result.movementInsight.maxBuildableQty, 3, 'normal product max buildable qty should follow stock on hand');
}

function runErrorChecks() {
    expectThrows(
        () => computeProductPricing(null, [], 1),
        /product object is required/i,
        'missing product'
    );

    expectThrows(
        () => computeProductPricing({ productId: 'X', productName: 'Bad Qty' }, [], 0),
        /quantity must be greater than zero/i,
        'invalid order quantity'
    );

    expectThrows(
        () => computeProductPricing(
            {
                productId: 'EMPTY-COMP',
                productName: 'Empty Composite',
                isComposite: true
            },
            [],
            1
        ),
        /at least one component/i,
        'empty composite components'
    );

    expectThrows(
        () => computeProductPricing(
            {
                productId: 'ZERO-COST',
                productName: 'Zero Cost Composite',
                isComposite: true
            },
            [
                {
                    componentId: 'ZERO-1',
                    componentName: 'Zero Part',
                    qtyPerSet: 1,
                    originalUnitCost: 0,
                    stockOnHand: 10
                }
            ],
            1
        ),
        /original component total must be greater than zero/i,
        'zero original component total'
    );
}

function run() {
    runCompositeExample();
    runCompositeRoundingExample();
    runNonCompositeExample();
    runErrorChecks();
    console.log('product-pricing-engine: all checks passed');
}

run();
