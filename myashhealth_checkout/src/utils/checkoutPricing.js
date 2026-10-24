/**
 * Centralized checkout pricing calculations.
 * All money math for subtotal, discounts, tax, and grand total should go through here
 * so the UI, analytics, and order payload stay consistent.
 */

/** Round to nearest cent (half-up via EPSILON). */
export const roundMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const formatMoney = (value) => roundMoney(value).toFixed(2);

export const parseMoney = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const n =
    typeof value === "string"
      ? parseFloat(value.replace(/,/g, ""))
      : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const hasPercentDiscount = (discountPercent) => {
  const p = parseMoney(discountPercent);
  return p > 0;
};

export const hasFixedDiscount = (discountAmount) => {
  const a = parseMoney(discountAmount);
  return a > 0;
};

/**
 * Extract eligible product ID list from a coupon API payload, if present.
 * Returns null when the API does not declare restrictions (treat as all cart products
 * that individually validated).
 */
export const extractEligibleProductIds = (payload = {}) => {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const candidates = [
    payload.eligible_product_ids,
    payload.product_ids,
    payload.applicable_product_ids,
    payload.allowed_product_ids,
    data.eligible_product_ids,
    data.product_ids,
    data.applicable_product_ids,
    data.allowed_product_ids,
  ];

  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) {
      return [...new Set(list.map((id) => String(id)))];
    }
    if (typeof list === "string" && list.trim() !== "") {
      return [
        ...new Set(
          list
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        ),
      ];
    }
  }

  return null;
};

/**
 * Normalize coupon fields from check_coupons_v3 (or similar) into a stable shape.
 */
export const normalizeCouponFromResponse = (payload = {}, fallbackCode = "") => {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const discountPercent = parseMoney(
    payload.discount_percent ?? data.discount_percent ?? 0
  );
  const discountAmount = parseMoney(
    payload.discount_amount ?? data.discount_amount ?? 0
  );
  const code = String(payload.code || data.code || fallbackCode || "").trim();

  if (!code) {
    return null;
  }

  if (!hasPercentDiscount(discountPercent) && !hasFixedDiscount(discountAmount)) {
    return null;
  }

  return {
    code,
    discountPercent: hasPercentDiscount(discountPercent) ? discountPercent : 0,
    discountAmount:
      !hasPercentDiscount(discountPercent) && hasFixedDiscount(discountAmount)
        ? discountAmount
        : 0,
    eligibleProductIds: extractEligibleProductIds(payload),
  };
};

const isProductEligible = (productId, eligibleProductIds) => {
  if (!eligibleProductIds || eligibleProductIds.length === 0) {
    return true;
  }
  return eligibleProductIds.map(String).includes(String(productId));
};

/**
 * Build line items and cart totals for the checkout.
 *
 * Coupon rules:
 * - Percentage: applied once per eligible line (unitPrice * qty * percent / 100).
 * - Fixed amount: applied once across all eligible lines (proportional share), never
 *   stacked per unit beyond the fixed cart amount.
 * - Products not in eligibleProductIds receive $0 discount.
 * - Discount never exceeds a line's (or the eligible cart's) total.
 *
 * @param {Array<{product_id?: string|number, product_price?: string|number, quantity?: number}>} products
 * @param {{code?: string, discountPercent?: number|string, discountAmount?: number|string, eligibleProductIds?: string[]|null}|null} coupon
 * @param {{tax?: number|string, shipping?: number|string}} [options]
 */
export const computeCheckoutTotals = (products = [], coupon = null, options = {}) => {
  const tax = Math.max(0, roundMoney(parseMoney(options.tax)));
  const shipping = Math.max(0, roundMoney(parseMoney(options.shipping)));

  const rawLines = (Array.isArray(products) ? products : [])
    .filter(Boolean)
    .map((product, index) => {
      const quantity = Math.max(1, parseInt(product.quantity, 10) || 1);
      const unitPrice = Math.max(0, parseMoney(product.product_price));
      const lineSubtotal = roundMoney(unitPrice * quantity);
      const productId = product.product_id ?? `line_${index}`;

      return {
        productId: String(productId),
        product,
        quantity,
        unitPrice,
        lineSubtotal,
        eligible: coupon
          ? isProductEligible(productId, coupon.eligibleProductIds)
          : false,
        discount: 0,
        lineTotal: lineSubtotal,
      };
    });

  const subtotal = roundMoney(
    rawLines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  );

  if (!coupon) {
    const grandTotal = Math.max(0, roundMoney(subtotal + tax + shipping));
    return {
      lineItems: rawLines,
      subtotal,
      totalDiscount: 0,
      tax,
      shipping,
      grandTotal,
      discountLabel: "",
      discountPercent: 0,
      discountAmount: 0,
      isDiscountApplied: false,
      couponCode: "",
      eligibleProductIds: [],
    };
  }

  const discountPercent = hasPercentDiscount(coupon.discountPercent)
    ? parseMoney(coupon.discountPercent)
    : 0;
  const fixedAmount = !discountPercent
    ? Math.max(0, parseMoney(coupon.discountAmount))
    : 0;

  const eligibleLines = rawLines.filter((line) => line.eligible);
  const eligibleSubtotal = roundMoney(
    eligibleLines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  );

  if (eligibleLines.length === 0 || eligibleSubtotal <= 0) {
    const grandTotal = Math.max(0, roundMoney(subtotal + tax + shipping));
    return {
      lineItems: rawLines,
      subtotal,
      totalDiscount: 0,
      tax,
      shipping,
      grandTotal,
      discountLabel: "",
      discountPercent: 0,
      discountAmount: 0,
      isDiscountApplied: false,
      couponCode: coupon.code || "",
      eligibleProductIds: [],
      error: "Coupon does not apply to any products in the cart.",
    };
  }

  if (discountPercent > 0) {
    rawLines.forEach((line) => {
      if (!line.eligible) return;
      const discount = roundMoney((line.lineSubtotal * discountPercent) / 100);
      line.discount = Math.min(discount, line.lineSubtotal);
      line.lineTotal = roundMoney(line.lineSubtotal - line.discount);
    });
  } else if (fixedAmount > 0) {
    const discountBudget = Math.min(fixedAmount, eligibleSubtotal);
    let remaining = discountBudget;

    eligibleLines.forEach((line, index) => {
      const isLast = index === eligibleLines.length - 1;
      let share;
      if (isLast) {
        share = remaining;
      } else {
        share = roundMoney((line.lineSubtotal / eligibleSubtotal) * discountBudget);
        share = Math.min(share, remaining, line.lineSubtotal);
        remaining = roundMoney(remaining - share);
      }
      share = Math.min(Math.max(0, share), line.lineSubtotal);
      line.discount = share;
      line.lineTotal = roundMoney(line.lineSubtotal - share);
    });
  }

  const totalDiscount = roundMoney(
    rawLines.reduce((sum, line) => sum + line.discount, 0)
  );
  // Grand Total = Original Subtotal - Total Coupon Discount + Tax + Shipping
  const grandTotal = Math.max(
    0,
    roundMoney(subtotal - totalDiscount + tax + shipping)
  );

  let discountLabel = "";
  if (discountPercent > 0) {
    discountLabel = `${Math.trunc(discountPercent)}%`;
  } else if (totalDiscount > 0) {
    discountLabel = `$${formatMoney(totalDiscount)}`;
  }

  return {
    lineItems: rawLines,
    subtotal,
    totalDiscount,
    tax,
    shipping,
    grandTotal,
    discountLabel,
    discountPercent,
    discountAmount: fixedAmount > 0 ? roundMoney(Math.min(fixedAmount, eligibleSubtotal)) : 0,
    isDiscountApplied: totalDiscount > 0,
    couponCode: coupon.code || "",
    eligibleProductIds: eligibleLines.map((line) => line.productId),
  };
};

/**
 * Sum product prices into a cart subtotal (no discounts).
 */
export const sumProductPrices = (products = []) => {
  return roundMoney(
    (Array.isArray(products) ? products : []).reduce((sum, product) => {
      const qty = Math.max(1, parseInt(product?.quantity, 10) || 1);
      return sum + parseMoney(product?.product_price) * qty;
    }, 0)
  );
};

/**
 * Build a coupon object from existing Checkout2 state fields.
 */
export const buildCouponState = ({
  code,
  discountPercent,
  discountAmount,
  eligibleProductIds = null,
} = {}) => {
  if (!code) return null;

  const percent = parseMoney(discountPercent);
  const amount = parseMoney(discountAmount);

  if (!hasPercentDiscount(percent) && !hasFixedDiscount(amount)) {
    return null;
  }

  return {
    code: String(code).trim(),
    discountPercent: hasPercentDiscount(percent) ? percent : 0,
    discountAmount:
      !hasPercentDiscount(percent) && hasFixedDiscount(amount) ? amount : 0,
    eligibleProductIds:
      Array.isArray(eligibleProductIds) && eligibleProductIds.length > 0
        ? eligibleProductIds.map(String)
        : null,
  };
};
