// Combines a receiving bank's own (real, bank-sourced) cost with an optional
// sender-side add-on (lib/sampleSenderModel.ts) so the UI can rank "sender +
// receiver" routes the way the ported landing design expects. When the
// add-on is zero (the direct-bank-wire sender), this reduces exactly to the
// receiver's own numbers from lib/costEngine.ts — nothing invented is added.

export interface ReceiverCost {
  effectiveRate: number;
  feeFromCurrency: number;
}

export interface SenderAddOnInput {
  feeFromCurrency: number;
  markupBps: number;
}

export interface CombinedRoute {
  feeFromCurrency: number;
  effectiveRate: number;
  amountReceived: number;
}

export function computeCombinedRoute(
  amountFromCurrency: number,
  benchmarkRate: number,
  receiver: ReceiverCost,
  senderAddOn: SenderAddOnInput
): CombinedRoute {
  const receiverFractionOff = 1 - receiver.effectiveRate / benchmarkRate;
  const combinedFractionOff = receiverFractionOff + senderAddOn.markupBps / 10000;
  const effectiveRate = benchmarkRate * (1 - combinedFractionOff);

  const feeFromCurrency = receiver.feeFromCurrency + senderAddOn.feeFromCurrency;
  const netSend = amountFromCurrency - feeFromCurrency;
  const amountReceived = netSend * effectiveRate;

  return { feeFromCurrency, effectiveRate, amountReceived };
}
