import { computeCombinedRoute } from "../lib/routeRanking";

describe("computeCombinedRoute", () => {
  const benchmarkRate = 90;
  // Mirrors tests/costEngine.test.ts's baseQuote at amount=1000: fee=7,
  // fx_spread_bps=100 (1%), so effective_rate = 90 * 0.99 = 89.1.
  const receiver = { effectiveRate: 89.1, feeFromCurrency: 7 };

  it("adds nothing on top of the receiver's own numbers for the direct sender (zero add-on)", () => {
    const result = computeCombinedRoute(1000, benchmarkRate, receiver, { feeFromCurrency: 0, markupBps: 0 });
    expect(result.feeFromCurrency).toBeCloseTo(7, 5);
    expect(result.effectiveRate).toBeCloseTo(89.1, 5);
    expect(result.amountReceived).toBeCloseTo(88476.3, 5);
  });

  it("layers a sample sender's flat fee and bps markup on top of the receiver's own cost", () => {
    // Wise-like sender: fee = 1000 * 0.45% = 4.5, bps = 0
    const result = computeCombinedRoute(1000, benchmarkRate, receiver, { feeFromCurrency: 4.5, markupBps: 0 });
    expect(result.feeFromCurrency).toBeCloseTo(11.5, 5);
    expect(result.amountReceived).toBeCloseTo(88075.35, 5);
  });

  it("stacks a sender's extra bps markup on top of the receiver's own spread", () => {
    // Revolut-like sender: fee = 0, bps = 20 (0.2%) on top of the receiver's 1% spread
    const result = computeCombinedRoute(1000, benchmarkRate, receiver, { feeFromCurrency: 0, markupBps: 20 });
    // combined fraction-off = 1% + 0.2% = 1.2% -> effective rate = 90 * 0.988 = 88.92
    expect(result.effectiveRate).toBeCloseTo(88.92, 5);
    expect(result.amountReceived).toBeCloseTo(993 * 88.92, 5);
  });
});
