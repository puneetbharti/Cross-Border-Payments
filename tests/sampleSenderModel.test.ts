import { DIRECT_SENDER, SAMPLE_SENDERS, computeSenderAddOn, getAllSenders } from "../lib/sampleSenderModel";

describe("sampleSenderModel", () => {
  it("DIRECT_SENDER is tagged live, not sample", () => {
    expect(DIRECT_SENDER.tag).toBe("live");
  });

  it("every entry in SAMPLE_SENDERS is tagged sample", () => {
    expect(SAMPLE_SENDERS.length).toBeGreaterThan(0);
    expect(SAMPLE_SENDERS.every((s) => s.tag === "sample")).toBe(true);
  });

  it("getAllSenders puts DIRECT_SENDER first, followed by all sample senders", () => {
    const all = getAllSenders();
    expect(all[0]).toBe(DIRECT_SENDER);
    expect(all.slice(1)).toEqual(SAMPLE_SENDERS);
  });

  it("computeSenderAddOn returns zero fee and zero bps for the direct sender", () => {
    const addOn = computeSenderAddOn(DIRECT_SENDER.id, 1000);
    expect(addOn.feeFromCurrency).toBe(0);
    expect(addOn.markupBps).toBe(0);
  });

  it("computeSenderAddOn returns a non-zero fee for a flat-fee sample sender", () => {
    const flatFeeSender = SAMPLE_SENDERS.find((s) => s.id === "german-bank-a");
    expect(flatFeeSender).toBeDefined();
    const addOn = computeSenderAddOn("german-bank-a", 1000);
    expect(addOn.feeFromCurrency).toBeCloseTo(25, 5);
  });

  it("computeSenderAddOn returns a percentage-based fee for a percentage sample sender", () => {
    const addOn = computeSenderAddOn("wise", 1000);
    // ported from the mockup: Wise's fee(a) = a * 0.0045
    expect(addOn.feeFromCurrency).toBeCloseTo(4.5, 5);
  });

  it("throws for an unknown sender id", () => {
    expect(() => computeSenderAddOn("not-a-real-sender", 1000)).toThrow();
  });
});
