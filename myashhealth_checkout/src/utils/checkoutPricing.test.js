import {
  buildCouponState,
  computeCheckoutTotals,
  extractEligibleProductIds,
  formatMoney,
  normalizeCouponFromResponse,
  parseMoney,
  roundMoney,
  sumProductPrices,
} from "./checkoutPricing";

const products = (items) =>
  items.map(([id, price, quantity = 1]) => ({
    product_id: id,
    product_price: price,
    quantity,
  }));

describe("checkoutPricing", () => {
  describe("money helpers", () => {
    it("rounds and formats consistently", () => {
      expect(roundMoney(10.005)).toBe(10.01);
      expect(formatMoney(10)).toBe("10.00");
      expect(parseMoney("1,234.50")).toBe(1234.5);
    });
  });

  describe("single product without coupon", () => {
    it("returns full price totals", () => {
      const totals = computeCheckoutTotals(products([["92", 189.95]]));
      expect(totals.subtotal).toBe(189.95);
      expect(totals.totalDiscount).toBe(0);
      expect(totals.grandTotal).toBe(189.95);
      expect(totals.lineItems[0].lineTotal).toBe(189.95);
    });
  });

  describe("single product with coupon", () => {
    it("applies percentage coupon", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
      });
      const totals = computeCheckoutTotals(products([["92", 200]]), coupon);
      expect(totals.subtotal).toBe(200);
      expect(totals.totalDiscount).toBe(20);
      expect(totals.grandTotal).toBe(180);
      expect(totals.lineItems[0].discount).toBe(20);
    });

    it("applies fixed coupon", () => {
      const coupon = buildCouponState({
        code: "FLAT25",
        discountPercent: 0,
        discountAmount: 25,
      });
      const totals = computeCheckoutTotals(products([["92", 200]]), coupon);
      expect(totals.totalDiscount).toBe(25);
      expect(totals.grandTotal).toBe(175);
      expect(totals.lineItems[0].lineTotal).toBe(175);
    });
  });

  describe("multiple products without coupon", () => {
    it("sums all line totals into subtotal and grand total", () => {
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
          ["94", 50.5],
        ])
      );
      expect(totals.subtotal).toBe(350.5);
      expect(totals.grandTotal).toBe(350.5);
      expect(
        roundMoney(totals.lineItems.reduce((s, l) => s + l.lineTotal, 0))
      ).toBe(totals.subtotal);
    });
  });

  describe("multiple products with coupon", () => {
    it("applies percentage to every eligible product once", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
        eligibleProductIds: null,
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
        ]),
        coupon
      );
      expect(totals.subtotal).toBe(300);
      expect(totals.totalDiscount).toBe(30);
      expect(totals.grandTotal).toBe(270);
      expect(totals.lineItems[0].discount).toBe(10);
      expect(totals.lineItems[1].discount).toBe(20);
    });

    it("applies fixed discount once across eligible products", () => {
      const coupon = buildCouponState({
        code: "FLAT30",
        discountAmount: 30,
        eligibleProductIds: null,
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
        ]),
        coupon
      );
      expect(totals.totalDiscount).toBe(30);
      expect(totals.grandTotal).toBe(270);
      expect(
        roundMoney(totals.lineItems.reduce((s, l) => s + l.discount, 0))
      ).toBe(30);
      // Do not apply 30 twice
      expect(totals.lineItems.every((l) => l.discount < 30 || totals.lineItems.length === 1)).toBe(
        true
      );
      expect(totals.lineItems[0].discount + totals.lineItems[1].discount).toBe(30);
    });
  });

  describe("different quantities", () => {
    it("multiplies unit price by quantity before discount", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
      });
      const totals = computeCheckoutTotals(
        products([["92", 100, 3]]),
        coupon
      );
      expect(totals.subtotal).toBe(300);
      expect(totals.totalDiscount).toBe(30);
      expect(totals.grandTotal).toBe(270);
      expect(totals.lineItems[0].quantity).toBe(3);
    });
  });

  describe("mixed eligible and non-eligible products", () => {
    it("only discounts eligible products for percentage coupons", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
        eligibleProductIds: ["92"],
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
        ]),
        coupon
      );
      expect(totals.lineItems[0].discount).toBe(10);
      expect(totals.lineItems[1].discount).toBe(0);
      expect(totals.totalDiscount).toBe(10);
      expect(totals.grandTotal).toBe(290);
    });

    it("only discounts eligible products for fixed coupons", () => {
      const coupon = buildCouponState({
        code: "FLAT40",
        discountAmount: 40,
        eligibleProductIds: ["93"],
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
        ]),
        coupon
      );
      expect(totals.lineItems[0].discount).toBe(0);
      expect(totals.lineItems[1].discount).toBe(40);
      expect(totals.totalDiscount).toBe(40);
      expect(totals.grandTotal).toBe(260);
    });

    it("caps fixed discount at eligible subtotal", () => {
      const coupon = buildCouponState({
        code: "HUGE",
        discountAmount: 999,
        eligibleProductIds: ["92"],
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 50],
          ["93", 200],
        ]),
        coupon
      );
      expect(totals.totalDiscount).toBe(50);
      expect(totals.grandTotal).toBe(200);
    });

    it("returns zero discount when no products are eligible", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
        eligibleProductIds: ["999"],
      });
      const totals = computeCheckoutTotals(products([["92", 100]]), coupon);
      expect(totals.totalDiscount).toBe(0);
      expect(totals.grandTotal).toBe(100);
      expect(totals.error).toBeTruthy();
    });
  });

  describe("validation helpers", () => {
    it("extracts eligible product ids from API payloads", () => {
      expect(
        extractEligibleProductIds({ eligible_product_ids: [92, "93"] })
      ).toEqual(["92", "93"]);
      expect(
        extractEligibleProductIds({ data: { product_ids: "10,11" } })
      ).toEqual(["10", "11"]);
      expect(extractEligibleProductIds({})).toBeNull();
    });

    it("normalizes coupon API responses and rejects empty discounts", () => {
      expect(
        normalizeCouponFromResponse(
          { status: 1, discount_percent: "15.00", data: { code: "PCT15" } },
          "FALLBACK"
        )
      ).toEqual({
        code: "PCT15",
        discountPercent: 15,
        discountAmount: 0,
        eligibleProductIds: null,
      });

      expect(
        normalizeCouponFromResponse({ discount_percent: 0, discount_amount: 0 })
      ).toBeNull();
    });

    it("sumProductPrices matches subtotal without coupon", () => {
      const cart = products([
        ["92", 10],
        ["93", 20.5],
      ]);
      expect(sumProductPrices(cart)).toBe(30.5);
      expect(computeCheckoutTotals(cart).subtotal).toBe(30.5);
    });
  });

  describe("tax and shipping", () => {
    it("adds tax and shipping after discount", () => {
      const coupon = buildCouponState({
        code: "SAVE10",
        discountPercent: 10,
      });
      const totals = computeCheckoutTotals(products([["92", 100]]), coupon, {
        tax: 5,
        shipping: 0,
      });
      expect(totals.grandTotal).toBe(95);
    });

    it("uses Grand Total = Subtotal - Discount + Tax + Shipping", () => {
      const coupon = buildCouponState({
        code: "FLAT30",
        discountAmount: 30,
      });
      const totals = computeCheckoutTotals(
        products([
          ["92", 100],
          ["93", 200],
        ]),
        coupon,
        { tax: 2.5, shipping: 0 }
      );

      expect(totals.subtotal).toBe(300);
      expect(totals.totalDiscount).toBe(30);
      expect(totals.grandTotal).toBe(
        roundMoney(totals.subtotal - totals.totalDiscount + totals.tax + totals.shipping)
      );
      expect(totals.grandTotal).toBe(272.5);
      // Discount applied once — line discounts sum to totalDiscount, not 30 each
      expect(
        roundMoney(totals.lineItems.reduce((sum, line) => sum + line.discount, 0))
      ).toBe(totals.totalDiscount);
    });
  });
});
