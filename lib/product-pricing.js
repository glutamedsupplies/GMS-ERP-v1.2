'use strict';

/**
 * Round money values to 2 decimal places.
 * Invalid inputs safely fall back to 0.
 *
 * @param {number|string} value
 * @returns {number}
 */
function round2(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }
    return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }
    return Math.round((numericValue + Number.EPSILON) * 1000000) / 1000000;
}

function roundRatio(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }
    return Number(numericValue.toFixed(6));
}

function hasValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'string') {
        return value.trim() !== '';
    }
    return true;
}

function normalizeString(value) {
    return String(value || '').trim();
}

function toFiniteNumber(value, fallbackValue = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}

function getFirstValue(record, keys) {
    if (!record || typeof record !== 'object') {
        return undefined;
    }

    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key) && hasValue(record[key])) {
            return record[key];
        }
    }

    return undefined;
}

function parseBooleanLike(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value === 1;
    }

    const normalizedValue = normalizeString(value).toLowerCase();
    return normalizedValue === 'true'
        || normalizedValue === '1'
        || normalizedValue === 'yes'
        || normalizedValue === 'y'
        || normalizedValue === 'composite';
}

function resolveProductId(product) {
    return normalizeString(getFirstValue(product, [
        'productId',
        'product_id',
        'id',
        'inventoryId',
        'inventory_id'
    ]));
}

function resolveProductName(product) {
    return normalizeString(getFirstValue(product, [
        'productName',
        'product_name',
        'name',
        'itemName',
        'item_name',
        'title'
    ]));
}

function resolveProductCode(product) {
    return normalizeString(getFirstValue(product, [
        'itemCode',
        'item_code',
        'code',
        'sku',
        'productCode',
        'product_code'
    ]));
}

function resolveProductSet(product) {
    return normalizeString(getFirstValue(product, [
        'itemSet',
        'item_set',
        'setName',
        'set_name',
        'set'
    ]));
}

function resolveRegularPrice(product) {
    return getFirstValue(product, [
        'regularPrice',
        'regular_price',
        'price',
        'unitPrice',
        'unit_price',
        'sellingPrice',
        'selling_price',
        'srp'
    ]);
}

function resolveDiscountedPrice(product) {
    return getFirstValue(product, [
        'discountedPrice',
        'discounted_price',
        'discountPrice',
        'discount_price',
        'promoPrice',
        'promo_price'
    ]);
}

function resolveProductCost(product) {
    return getFirstValue(product, [
        'originalUnitCost',
        'original_unit_cost',
        'costPrice',
        'cost_price',
        'unitCostPrice',
        'unit_cost_price',
        'unitCost',
        'unit_cost'
    ]);
}

function resolveProductStock(product) {
    return getFirstValue(product, [
        'stockOnHand',
        'stock_on_hand',
        'availableStock',
        'available_stock',
        'quantityOnHand',
        'quantity_on_hand',
        'quantity',
        'qty'
    ]);
}

function resolveCompositeFlag(product) {
    const explicitCompositeValue = getFirstValue(product, [
        'isComposite',
        'is_composite',
        'composite',
        'isBundle',
        'is_bundle'
    ]);

    if (hasValue(explicitCompositeValue)) {
        return parseBooleanLike(explicitCompositeValue);
    }

    const typeValue = normalizeString(getFirstValue(product, [
        'type',
        'itemType',
        'item_type',
        'productType',
        'product_type'
    ])).toLowerCase();

    return typeValue === 'composite' || typeValue === 'bundle';
}

function resolveComponentId(component) {
    return normalizeString(getFirstValue(component, [
        'componentId',
        'component_id',
        'inventoryId',
        'inventory_id',
        'id'
    ]));
}

function resolveComponentName(component) {
    return normalizeString(getFirstValue(component, [
        'componentName',
        'component_name',
        'name',
        'itemName',
        'item_name'
    ]));
}

function resolveComponentQtyPerSet(component) {
    return getFirstValue(component, [
        'qtyPerSet',
        'qty_per_set',
        'quantity',
        'qty',
        'componentQuantity',
        'component_quantity'
    ]);
}

function resolveComponentUnitCost(component) {
    return getFirstValue(component, [
        'originalUnitCost',
        'original_unit_cost',
        'unitCost',
        'unit_cost',
        'costPrice',
        'cost_price',
        'unitCostPrice',
        'unit_cost_price'
    ]);
}

function resolveComponentStock(component) {
    return getFirstValue(component, [
        'stockOnHand',
        'stock_on_hand',
        'availableStock',
        'available_stock',
        'quantityOnHand',
        'quantity_on_hand',
        'quantity',
        'qty'
    ]);
}

function isComponentLinkedToProduct(component, productMeta) {
    const componentParentId = normalizeString(getFirstValue(component, [
        'productId',
        'product_id',
        'parentProductId',
        'parent_product_id'
    ]));
    if (componentParentId && productMeta.productId) {
        return componentParentId === productMeta.productId;
    }

    const componentProductCode = normalizeString(getFirstValue(component, [
        'itemCode',
        'item_code',
        'productCode',
        'product_code'
    ]));
    const componentProductSet = normalizeString(getFirstValue(component, [
        'itemSet',
        'item_set',
        'setName',
        'set_name',
        'set'
    ]));
    const componentProductName = normalizeString(getFirstValue(component, [
        'productName',
        'product_name',
        'parentProductName',
        'parent_product_name'
    ]));

    if (componentProductCode && productMeta.productCode && componentProductCode !== productMeta.productCode) {
        return false;
    }
    if (componentProductSet && productMeta.productSet && componentProductSet !== productMeta.productSet) {
        return false;
    }
    if (componentProductName && productMeta.productName) {
        return componentProductName.toLowerCase() === productMeta.productName.toLowerCase();
    }

    return Boolean(componentProductCode || componentProductSet || componentProductName)
        ? true
        : false;
}

function normalizeCompositeComponents(product, components, orderQty) {
    const productMeta = {
        productId: resolveProductId(product),
        productName: resolveProductName(product),
        productCode: resolveProductCode(product),
        productSet: resolveProductSet(product)
    };
    const componentList = Array.isArray(components) ? components.slice() : [];
    const linkedComponents = componentList.filter((component) => isComponentLinkedToProduct(component, productMeta));
    const sourceRows = linkedComponents.length ? linkedComponents : componentList;

    return sourceRows
        .map((component) => {
            const qtyPerSet = roundQuantity(toFiniteNumber(resolveComponentQtyPerSet(component), 0));
            if (!(qtyPerSet > 0)) {
                return null;
            }

            const totalQty = roundQuantity(qtyPerSet * orderQty);
            const originalUnitCost = round2(resolveComponentUnitCost(component));
            const originalLineTotal = round2(totalQty * originalUnitCost);

            return {
                componentId: resolveComponentId(component),
                componentName: resolveComponentName(component),
                qtyPerSet,
                totalQty,
                originalUnitCost,
                originalLineTotal,
                stockOnHand: roundQuantity(toFiniteNumber(resolveComponentStock(component), 0)),
                inventoryDeductQty: totalQty
            };
        })
        .filter(Boolean);
}

function buildCompositeMovementInsight(normalizedComponents, orderQty) {
    const missingComponents = [];
    let maxBuildableQty = Number.POSITIVE_INFINITY;

    normalizedComponents.forEach((component) => {
        const requiredQty = roundQuantity(component.totalQty);
        const availableStock = roundQuantity(component.stockOnHand);
        const shortage = roundQuantity(Math.max(0, requiredQty - availableStock));
        const buildableQty = component.qtyPerSet > 0
            ? Math.floor((availableStock + Number.EPSILON) / component.qtyPerSet)
            : 0;

        maxBuildableQty = Math.min(maxBuildableQty, buildableQty);

        if (shortage > 0) {
            missingComponents.push({
                componentId: component.componentId,
                componentName: component.componentName,
                requiredQty,
                availableStock,
                shortage
            });
        }
    });

    if (!Number.isFinite(maxBuildableQty)) {
        maxBuildableQty = 0;
    }

    const isSellable = missingComponents.length === 0;
    let message = maxBuildableQty > 0
        ? 'Product has complete components and can be sold.'
        : 'Product cannot be sold yet because some components are incomplete.';

    if (!isSellable && maxBuildableQty > 0) {
        message += ' Requested quantity is higher than the currently buildable quantity.';
    }

    return {
        status: isSellable ? 'COMPLETE_READY_TO_SELL' : 'INCOMPLETE_COMPONENTS',
        message,
        isSellable,
        requestedQty: orderQty,
        maxBuildableQty,
        missingComponents
    };
}

function buildNonCompositeMovementInsight(product, orderQty) {
    const productId = resolveProductId(product);
    const productName = resolveProductName(product);
    const availableStock = roundQuantity(toFiniteNumber(resolveProductStock(product), 0));
    const shortageValue = roundQuantity(Math.max(0, orderQty - availableStock));
    const isSellable = shortageValue <= 0;

    return {
        status: isSellable ? 'AVAILABLE_READY_TO_SELL' : 'INSUFFICIENT_STOCK',
        message: isSellable
            ? 'Product stock is available and ready to sell.'
            : 'Product stock is insufficient for the requested quantity.',
        isSellable,
        requestedQty: orderQty,
        maxBuildableQty: Math.floor(Math.max(0, availableStock)),
        missingComponents: [],
        shortage: isSellable ? null : {
            componentId: productId,
            componentName: productName,
            requiredQty: orderQty,
            availableStock,
            shortage: shortageValue
        }
    };
}

function buildProductCostingSummary({
    originalCostPerUnit,
    sellingPricePerUnit,
    orderQty,
    originalTotalCost,
    sellingPrice,
    discountAmount,
    profitOrLoss
}) {
    const normalizedOrderQty = roundQuantity(toFiniteNumber(orderQty, 0));
    const totalDiscountAmount = round2(discountAmount);
    const totalProfitOrLoss = round2(profitOrLoss);

    return {
        originalCostPerUnit: round2(originalCostPerUnit),
        sellingPricePerUnit: round2(sellingPricePerUnit),
        discountPerUnit: normalizedOrderQty > 0
            ? round2(totalDiscountAmount / normalizedOrderQty)
            : 0,
        profitOrLossPerUnit: normalizedOrderQty > 0
            ? round2(totalProfitOrLoss / normalizedOrderQty)
            : 0,
        orderQty: normalizedOrderQty,
        originalTotalCost: round2(originalTotalCost),
        totalSellingPrice: round2(sellingPrice),
        totalDiscountAmount,
        totalProfitOrLoss
    };
}

/**
 * Compute pricing for normal and composite products without mutating source costs.
 *
 * Product aliases supported:
 * - `productId`, `product_id`, `id`
 * - `productName`, `product_name`, `name`
 * - `regularPrice`, `regular_price`, `price`
 * - `discountedPrice`, `discounted_price`
 * - `costPrice`, `cost_price`, `originalUnitCost`
 * - `stockOnHand`, `stock_on_hand`
 * - `isComposite`, `is_composite`
 *
 * Component aliases supported:
 * - `componentId`, `component_id`, `id`
 * - `componentName`, `component_name`, `name`
 * - `qtyPerSet`, `component_quantity`, `quantity`
 * - `originalUnitCost`, `cost_price`, `unit_cost`
 * - `stockOnHand`, `stock_on_hand`
 *
 * @param {object} product
 * @param {Array<object>} components
 * @param {number|string} orderQty
 * @returns {object}
 *
 * @example
 * const result = computeProductPricing(
 *   {
 *     productId: 'SET-5GS',
 *     productName: '5GS Set',
 *     isComposite: true,
 *     regularPrice: 2850,
 *     discountedPrice: 2700
 *   },
 *   [
 *     { componentId: '5GS', componentName: '5GS', qtyPerSet: 1, originalUnitCost: 2600, stockOnHand: 20 },
 *     { componentId: 'BF', componentName: 'Butterfly', qtyPerSet: 10, originalUnitCost: 5, stockOnHand: 500 },
 *     { componentId: 'S10', componentName: '10cc Syringe', qtyPerSet: 10, originalUnitCost: 5, stockOnHand: 500 },
 *     { componentId: 'SW10', componentName: '10ml Sterile Water', qtyPerSet: 10, originalUnitCost: 15, stockOnHand: 300 }
 *   ],
 *   1
 * );
 *
 * @example
 * const normalResult = computeProductPricing(
 *   {
 *     productId: 'VC-01',
 *     productName: 'Vitamin C Drip',
 *     regularPrice: 1200,
 *     discountedPrice: 1100,
 *     costPrice: 700,
 *     stockOnHand: 3
 *   },
 *   [],
 *   2
 * );
 *
 * Top-level pricing fields preserve the original requested structure, while
 * `productCosting` adds a cleaner per-unit summary for "magkano ang benta kada isa".
 */
function computeProductPricing(product, components, orderQty) {
    if (!product || typeof product !== 'object') {
        throw new Error('A valid product object is required.');
    }

    const normalizedOrderQty = roundQuantity(toFiniteNumber(orderQty, 0));
    if (!(normalizedOrderQty > 0)) {
        throw new Error('Order quantity must be greater than zero.');
    }

    const productId = resolveProductId(product);
    const productName = resolveProductName(product);
    const isComposite = resolveCompositeFlag(product);
    const regularPriceValue = resolveRegularPrice(product);
    const discountedPriceValue = resolveDiscountedPrice(product);
    const hasRegularPrice = hasValue(regularPriceValue);
    const hasDiscountedPrice = hasValue(discountedPriceValue);
    const regularPricePerSet = round2(regularPriceValue);
    const discountedPricePerSet = round2(discountedPriceValue);

    if (isComposite) {
        const normalizedComponents = normalizeCompositeComponents(product, components, normalizedOrderQty);
        if (!normalizedComponents.length) {
            throw new Error('Composite products require at least one component.');
        }

        const originalCostPerSet = round2(normalizedComponents.reduce((sum, component) => {
            return sum + round2(component.qtyPerSet * component.originalUnitCost);
        }, 0));

        if (!(originalCostPerSet > 0)) {
            throw new Error('Original component total must be greater than zero.');
        }

        const sellingPricePerSet = hasDiscountedPrice
            ? discountedPricePerSet
            : (hasRegularPrice ? regularPricePerSet : originalCostPerSet);
        const sellingPrice = round2(sellingPricePerSet * normalizedOrderQty);
        const exactRatio = sellingPricePerSet / originalCostPerSet;
        const ratio = roundRatio(exactRatio);
        let allocatedAdjustedTotal = 0;

        const pricedComponents = normalizedComponents.map((component, index) => {
            const isLastComponent = index === normalizedComponents.length - 1;
            const adjustedUnitPrice = round2(component.originalUnitCost * exactRatio);
            let adjustedLineTotal = round2(component.originalLineTotal * exactRatio);

            // The final component absorbs any cent gap so component totals match the parent selling price exactly.
            if (isLastComponent) {
                adjustedLineTotal = round2(sellingPrice - allocatedAdjustedTotal);
            } else {
                allocatedAdjustedTotal = round2(allocatedAdjustedTotal + adjustedLineTotal);
            }

            return {
                componentId: component.componentId,
                componentName: component.componentName,
                qtyPerSet: component.qtyPerSet,
                totalQty: component.totalQty,
                originalUnitCost: component.originalUnitCost,
                originalLineTotal: component.originalLineTotal,
                adjustedUnitPrice: isLastComponent && component.totalQty > 0
                    ? round2(adjustedLineTotal / component.totalQty)
                    : adjustedUnitPrice,
                adjustedLineTotal,
                inventoryDeductQty: component.inventoryDeductQty
            };
        });

        const originalTotalCost = round2(pricedComponents.reduce((sum, component) => sum + component.originalLineTotal, 0));
        const profitOrLoss = round2(sellingPrice - originalTotalCost);
        const discountReferencePerSet = hasRegularPrice ? regularPricePerSet : originalCostPerSet;
        const discountAmount = hasDiscountedPrice
            ? round2(Math.max(0, (discountReferencePerSet - sellingPricePerSet) * normalizedOrderQty))
            : 0;
        const productCosting = buildProductCostingSummary({
            originalCostPerUnit: originalCostPerSet,
            sellingPricePerUnit: sellingPricePerSet,
            orderQty: normalizedOrderQty,
            originalTotalCost,
            sellingPrice,
            discountAmount,
            profitOrLoss
        });

        return {
            productId,
            productName,
            orderQty: normalizedOrderQty,
            isComposite: true,
            originalCostPerSet,
            sellingPricePerSet,
            originalTotalCost,
            sellingPrice,
            discountAmount,
            profitOrLoss,
            originalCostPerUnit: productCosting.originalCostPerUnit,
            sellingPricePerUnit: productCosting.sellingPricePerUnit,
            discountPerUnit: productCosting.discountPerUnit,
            profitOrLossPerUnit: productCosting.profitOrLossPerUnit,
            ratio,
            components: pricedComponents,
            productCosting,
            movementInsight: buildCompositeMovementInsight(normalizedComponents, normalizedOrderQty)
        };
    }

    const originalCostPerSet = round2(resolveProductCost(product));
    const sellingPricePerSet = hasDiscountedPrice
        ? discountedPricePerSet
        : (hasRegularPrice ? regularPricePerSet : originalCostPerSet);
    const originalTotalCost = round2(originalCostPerSet * normalizedOrderQty);
    const sellingPrice = round2(sellingPricePerSet * normalizedOrderQty);
    const profitOrLoss = round2(sellingPrice - originalTotalCost);
    const discountAmount = hasDiscountedPrice && hasRegularPrice
        ? round2(Math.max(0, (regularPricePerSet - sellingPricePerSet) * normalizedOrderQty))
        : 0;
    const productCosting = buildProductCostingSummary({
        originalCostPerUnit: originalCostPerSet,
        sellingPricePerUnit: sellingPricePerSet,
        orderQty: normalizedOrderQty,
        originalTotalCost,
        sellingPrice,
        discountAmount,
        profitOrLoss
    });

    return {
        productId,
        productName,
        orderQty: normalizedOrderQty,
        isComposite: false,
        originalCostPerSet,
        sellingPricePerSet,
        originalTotalCost,
        sellingPrice,
        discountAmount,
        profitOrLoss,
        originalCostPerUnit: productCosting.originalCostPerUnit,
        sellingPricePerUnit: productCosting.sellingPricePerUnit,
        discountPerUnit: productCosting.discountPerUnit,
        profitOrLossPerUnit: productCosting.profitOrLossPerUnit,
        ratio: 1,
        components: [],
        productCosting,
        movementInsight: buildNonCompositeMovementInsight(product, normalizedOrderQty)
    };
}

const exported = {
    round2,
    computeProductPricing
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}

if (typeof window !== 'undefined') {
    window.ProductPricingEngine = exported;
}
