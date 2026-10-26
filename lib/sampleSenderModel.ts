// Illustrative "sending from" options ported from the contributor's design
// mockup (Design/Landing v2-html/). None of these are sourced from a bank or
// provider's own published rates — they exist only so the UI pattern from the
// design can be shown end to end. Every one is tagged "sample" and must stay
// visibly marked as such wherever it's rendered.
//
// DIRECT_SENDER is the one entry that reflects reality: sending straight from
// your own bank adds no fee or rate markup beyond what the receiving bank's
// own quote (lib/costEngine.ts, built from its published PDF rate card)
// already prices in. It's tagged "live" and is the default selection.

export interface SampleSender {
  id: string;
  name: string;
  kind: string;
  tag: "live" | "sample";
}

export const DIRECT_SENDER: SampleSender = {
  id: "direct",
  name: "Direct bank wire",
  kind: "Your own bank",
  tag: "live",
};

export const SAMPLE_SENDERS: SampleSender[] = [
  { id: "wise", name: "Wise", kind: "App", tag: "sample" },
  { id: "revolut", name: "Revolut", kind: "App", tag: "sample" },
  { id: "german-bank-a", name: "German bank A", kind: "Bank wire", tag: "sample" },
  { id: "german-bank-b", name: "German bank B", kind: "Bank wire", tag: "sample" },
  { id: "german-bank-c", name: "German bank C", kind: "Bank wire", tag: "sample" },
];

interface SenderFeeFn {
  (amountFromCurrency: number): number;
}

// bps applied on top of the receiving bank's own spread — 0 for DIRECT_SENDER
// since its cost is already fully captured by the receiver's own quote.
const SAMPLE_FEE_FNS: Record<string, { fee: SenderFeeFn; bps: number }> = {
  wise: { fee: (a) => a * 0.0045, bps: 0 },
  revolut: { fee: () => 0, bps: 20 },
  "german-bank-a": { fee: () => 25, bps: 0 },
  "german-bank-b": { fee: () => 35, bps: 0 },
  "german-bank-c": { fee: () => 45, bps: 0 },
};

export function getAllSenders(): SampleSender[] {
  return [DIRECT_SENDER, ...SAMPLE_SENDERS];
}

export interface SenderAddOn {
  feeFromCurrency: number;
  markupBps: number;
}

export function computeSenderAddOn(senderId: string, amountFromCurrency: number): SenderAddOn {
  if (senderId === DIRECT_SENDER.id) {
    return { feeFromCurrency: 0, markupBps: 0 };
  }

  const entry = SAMPLE_FEE_FNS[senderId];
  if (!entry) {
    throw new Error(`unknown sender id: ${senderId}`);
  }

  return { feeFromCurrency: entry.fee(amountFromCurrency), markupBps: entry.bps };
}
