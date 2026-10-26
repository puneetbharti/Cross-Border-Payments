"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DIRECT_SENDER, computeSenderAddOn, getAllSenders } from "@/lib/sampleSenderModel";
import { computeCombinedRoute } from "@/lib/routeRanking";

interface CompareResult {
  provider_id: string;
  provenance: string;
  fetched_at: string;
  stale: boolean;
  excluded_reason: string | null;
  amount_received: string | null;
  effective_rate: number | null;
  fee_from_currency: string | null;
  rate_markup_to_currency: string | null;
}

interface CompareFailure {
  bankId: string;
  error: string;
}

interface CompareResponse {
  benchmark: { rate: number; asOf: string; stale: boolean };
  amount: number;
  results: CompareResult[];
  failures: CompareFailure[];
}

interface CompareErrorResponse {
  error: string;
}

interface Route {
  providerId: string;
  excluded: false;
  stale: boolean;
  feeFromCurrency: number;
  effectiveRate: number;
  amountReceived: number;
}

interface ExcludedRoute {
  providerId: string;
  excluded: true;
  reason: string;
}

type RouteOrExcluded = Route | ExcludedRoute;

const AMOUNT_CHIPS = [1000, 2500, 5000, 10000, 25000];

const eur0 = (n: number) => "€" + Math.round(n).toLocaleString("en-US");
const eur2 = (n: number) => "€" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (n: number) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

function heat(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [181, 72, 58],
    [217, 164, 65],
    [63, 163, 127],
  ];
  const k = t < 0.5 ? 0 : 1;
  const u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[k];
  const b = stops[k + 1];
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * u)) as [number, number, number];
}

function tileStyle(on: boolean): CSSProperties {
  return {
    flex: "1 1 220px",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textAlign: "left",
    cursor: "pointer",
    color: "#0A1218",
    padding: "14px 18px",
    borderRadius: 12,
    background: on ? "#FFFFFF" : "transparent",
    border: on ? "2px solid #0A1218" : "2px solid #8F8A7B",
  };
}

function chipStyle(on: boolean): CSSProperties {
  return {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 500,
    background: on ? "#0A1218" : "transparent",
    color: on ? "#EDE8DC" : "#0A1218",
    border: on ? "1px solid #0A1218" : "1px solid #8F8A7B",
  };
}

function providerName(providerId: string): string {
  return providerId.toUpperCase();
}

export default function Page() {
  const [amount, setAmount] = useState(1000);
  const [amountText, setAmountText] = useState("1,000");
  const [active, setActive] = useState<"amount" | "from" | "to">("amount");
  const [senderId, setSenderId] = useState(DIRECT_SENDER.id);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCompare = useCallback(async (amountValue: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare?amount=${encodeURIComponent(amountValue)}`);
      const json = (await res.json()) as CompareResponse | CompareErrorResponse;
      if (!res.ok) {
        setError("error" in json ? json.error : "Something went wrong");
      } else {
        setData(json as CompareResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      void runCompare(amount);
    }, 350);
    return () => clearTimeout(handle);
  }, [amount, runCompare]);

  const senders = useMemo(() => getAllSenders(), []);

  const routes: RouteOrExcluded[] = useMemo(() => {
    if (!data) return [];
    const senderAddOn = computeSenderAddOn(senderId, amount);
    return data.results.map((r): RouteOrExcluded => {
      if (r.excluded_reason !== null || r.effective_rate === null) {
        return { providerId: r.provider_id, excluded: true, reason: r.excluded_reason ?? "unavailable" };
      }
      const combined = computeCombinedRoute(
        amount,
        data.benchmark.rate,
        { effectiveRate: r.effective_rate, feeFromCurrency: parseFloat(r.fee_from_currency ?? "0") },
        senderAddOn
      );
      return { providerId: r.provider_id, excluded: false, stale: r.stale, ...combined };
    });
  }, [data, senderId, amount]);

  const validRoutes = useMemo(
    () => routes.filter((r): r is Route => !r.excluded).sort((a, b) => b.amountReceived - a.amountReceived),
    [routes]
  );

  const excludedRoutes = useMemo(() => routes.filter((r): r is ExcludedRoute => r.excluded), [routes]);

  const effectiveReceiverId = receiverId ?? validRoutes[0]?.providerId ?? null;
  const pick = validRoutes.find((r) => r.providerId === effectiveReceiverId) ?? null;
  const bestRoute = validRoutes[0] ?? null;
  const worstRoute = validRoutes[validRoutes.length - 1] ?? null;
  const span = bestRoute && worstRoute ? bestRoute.amountReceived - worstRoute.amountReceived : 0;

  const benchmarkRate = data?.benchmark.rate ?? null;
  const benchmarkAmount = benchmarkRate !== null ? amount * benchmarkRate : null;

  const sender = senders.find((s) => s.id === senderId) ?? DIRECT_SENDER;
  const onlySender3 = senders.slice(0, 3);
  const moreSenders = senders.slice(3);

  const onAmountInput = (raw: string) => {
    setAmountText(raw);
    const v = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (v > 0) setAmount(v);
  };

  return (
    <div
      style={{
        background: "#0A1218",
        color: "#EDE8DC",
        fontFamily: "var(--font-sans)",
        fontSize: 16,
        lineHeight: 1.5,
        minWidth: 0,
      }}
    >
      {/* ============ HERO ============ */}
      <section style={{ background: "linear-gradient(180deg,#0A1218 0%,#102632 40%,#2F5560 66%,#D9935B 100%)" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
          <nav
            className="nav"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px 32px",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "26px 0",
            }}
          >
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, color: "#FFFFFF" }}>
              [Brand name]
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", fontSize: 15 }}>
              <a href="#compare">Compare all</a>
              <a href="#how">How it works</a>
              <a href="#contact">Contact us</a>
            </span>
          </nav>

          <div style={{ textAlign: "center", padding: "44px 0 8px" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-serif)",
                fontWeight: 500,
                fontSize: "clamp(36px,5.4vw,66px)",
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                color: "#FFFFFF",
              }}
            >
              Send money to India.
              <br />
              Keep more of it.
            </h1>
            <p style={{ margin: "18px auto 0", maxWidth: "40ch", fontSize: 18, color: "#E6DFCF" }}>
              Compare what actually arrives, after fees and rate markup.
            </p>
          </div>
        </div>

        <EuropeToIndiaSkyline />
      </section>

      {/* ============ CALCULATOR CARD ============ */}
      <section style={{ position: "relative", zIndex: 2, marginTop: -56 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
          <div
            id="calc"
            style={{
              background: "#EDE8DC",
              color: "#0A1218",
              borderRadius: 14,
              padding: "clamp(18px,3vw,32px)",
              boxSizing: "border-box",
              boxShadow: "0 36px 90px rgba(0,0,0,0.5)",
            }}
          >
            {/* three choices */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                className="tile"
                aria-pressed={active === "amount"}
                style={tileStyle(active === "amount")}
                onClick={() => setActive("amount")}
              >
                <span style={{ display: "block", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4A5660" }}>You send</span>
                  <span style={{ display: "block", fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, lineHeight: 1.2, marginTop: 2 }}>
                    {eur0(amount)}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#4A5660", marginTop: 2 }}>Euros</span>
                </span>
                <ChevronDown />
              </button>
              <button
                className="tile"
                aria-pressed={active === "from"}
                style={tileStyle(active === "from")}
                onClick={() => setActive("from")}
              >
                <span style={{ display: "block", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4A5660" }}>Sending from</span>
                  <span style={{ display: "block", fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, lineHeight: 1.2, marginTop: 2 }}>
                    {sender.name}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#4A5660", marginTop: 2 }}>
                    {sender.tag === "sample" ? "sample — not yet verified" : sender.kind}
                  </span>
                </span>
                <ChevronDown />
              </button>
              <button
                className="tile"
                aria-pressed={active === "to"}
                style={tileStyle(active === "to")}
                onClick={() => setActive("to")}
              >
                <span style={{ display: "block", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4A5660" }}>Arriving at</span>
                  <span style={{ display: "block", fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, lineHeight: 1.2, marginTop: 2 }}>
                    {effectiveReceiverId ? providerName(effectiveReceiverId) : "—"}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#4A5660", marginTop: 2 }}>
                    Bank in India — live, bank-published rate
                  </span>
                </span>
                <ChevronDown />
              </button>
            </div>

            {/* options for the open choice */}
            <div style={{ marginTop: 12, background: "#E2DCCB", borderRadius: 10, padding: "16px 18px" }}>
              {active === "amount" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#FFFFFF",
                      border: "1px solid #A8A18E",
                      borderRadius: 10,
                      padding: "0 16px",
                      flex: "0 1 240px",
                    }}
                  >
                    <span style={{ fontSize: 24, fontWeight: 600, color: "#4A5660" }}>&euro;</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Amount to send in euros"
                      value={amountText}
                      onChange={(e) => onAmountInput(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 26,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        color: "#0A1218",
                        background: "transparent",
                        border: 0,
                        padding: "10px 0",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {AMOUNT_CHIPS.map((v) => (
                      <button
                        key={v}
                        className="chip"
                        aria-pressed={amount === v}
                        style={chipStyle(amount === v)}
                        onClick={() => {
                          setAmount(v);
                          setAmountText(v.toLocaleString("en-US"));
                        }}
                      >
                        {eur0(v)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {active === "from" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {onlySender3.map((s) => (
                    <button
                      key={s.id}
                      className="chip"
                      aria-pressed={senderId === s.id}
                      style={chipStyle(senderId === s.id)}
                      onClick={() => setSenderId(s.id)}
                    >
                      {s.name}
                      {s.tag === "sample" ? " (sample)" : ""}
                    </button>
                  ))}
                  {moreSenders.length > 0 && (
                    <select
                      aria-label="More sending options"
                      value={moreSenders.some((s) => s.id === senderId) ? senderId : ""}
                      onChange={(e) => {
                        if (e.target.value) setSenderId(e.target.value);
                      }}
                      style={{ ...chipStyle(moreSenders.some((s) => s.id === senderId)), fontFamily: "inherit" }}
                    >
                      <option value="">More senders</option>
                      {moreSenders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.tag === "sample" ? " (sample)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {active === "to" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {validRoutes.map((r) => (
                    <button
                      key={r.providerId}
                      className="chip"
                      aria-pressed={effectiveReceiverId === r.providerId}
                      style={chipStyle(effectiveReceiverId === r.providerId)}
                      onClick={() => setReceiverId(r.providerId)}
                    >
                      {providerName(r.providerId)}
                      {r.stale ? " (stale)" : ""}
                    </button>
                  ))}
                  {excludedRoutes.map((r) => (
                    <span key={r.providerId} style={{ fontSize: 13, color: "#4A5660", alignSelf: "center" }} title={r.reason}>
                      {providerName(r.providerId)}: {r.reason}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* results */}
            {loading && !data && <p style={{ marginTop: 20 }}>Fetching live rates…</p>}
            {error && <p style={{ marginTop: 20, color: "#A33A2B" }}>{error}</p>}

            {data && pick && bestRoute && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "32px 44px", alignItems: "flex-start", marginTop: 28 }}>
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "#4A5660" }}>The right route saves you</div>
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontWeight: 500,
                      fontSize: "clamp(44px,6vw,68px)",
                      lineHeight: 1.04,
                      letterSpacing: "-0.02em",
                      color: "#1B6F5A",
                    }}
                  >
                    {inr0(span)}
                  </div>
                  <div style={{ fontSize: 15, color: "#2B3944" }}>
                    on {eur0(amount)} sent to {providerName(effectiveReceiverId ?? "")}, best route against the worst.
                  </div>

                  <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #0A1218" }}>
                    <div style={{ fontWeight: 600 }}>
                      What {sender.name}
                      {sender.tag === "sample" ? " (sample)" : ""} costs you
                    </div>
                    <div style={{ fontSize: 14, color: "#2B3944", marginTop: 2 }}>
                      {bestRoute.amountReceived - pick.amountReceived < 0.5
                        ? "Best route for this amount."
                        : `The best route gives ${inr0(bestRoute.amountReceived - pick.amountReceived)} more.`}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 26px", marginTop: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#4A5660" }}>Fee</div>
                        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{eur2(pick.feeFromCurrency)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: "#4A5660" }}>Effective rate</div>
                        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          ₹{pick.effectiveRate.toFixed(4)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 26px", marginTop: 14 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#4A5660" }}>They receive</div>
                        <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: "tabular-nums", color: "#1B6F5A" }}>
                          {inr0(pick.amountReceived)}
                        </div>
                      </div>
                      {benchmarkAmount !== null && (
                        <div>
                          <div style={{ fontSize: 13, color: "#4A5660" }}>Below the interbank rate</div>
                          <div style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: "tabular-nums", color: "#A33A2B" }}>
                            −{inr0(benchmarkAmount - pick.amountReceived)} (
                            {(((benchmarkAmount - pick.amountReceived) / benchmarkAmount) * 100).toFixed(2)}%)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {benchmarkRate !== null && (
                    <div style={{ marginTop: 20, fontSize: 14, color: "#4A5660" }}>
                      Interbank reference rate today: 1 EUR = ₹{benchmarkRate.toFixed(4)}
                      {data.benchmark.stale ? " (stale — showing last known good)" : ""}
                    </div>
                  )}
                </div>

                <div style={{ flex: "1.5 1 440px", minWidth: 0 }}>
                  {benchmarkAmount !== null && (
                    <div
                      style={{
                        padding: "10px 12px",
                        border: "2px dashed #8F8A7B",
                        borderRadius: 8,
                        marginBottom: 8,
                        background: "#F4F0E4",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                        <span>
                          <span style={{ fontWeight: 600 }}>Interbank rate</span>{" "}
                          <span style={{ fontSize: 12, color: "#4A5660" }}>reference, not a quote</span>
                        </span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{inr0(benchmarkAmount)}</span>
                      </div>
                      <div style={{ marginTop: 7, height: 7, background: "#CFC8B5", borderRadius: 4 }}>
                        <div style={{ height: 7, width: "100%", borderRadius: 4, background: "#5A6670" }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#4A5660" }}>
                        The mid-market rate (frankfurter.dev). No sender offers this rate directly.
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {validRoutes.map((r, rank) => {
                      const t = span === 0 ? 1 : (r.amountReceived - (worstRoute?.amountReceived ?? 0)) / (span || 1);
                      const col = heat(t);
                      const w = (28 + 72 * t).toFixed(1);
                      const sel = r.providerId === effectiveReceiverId;
                      return (
                        <button
                          key={r.providerId}
                          className="route"
                          aria-pressed={sel}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                            color: "#0A1218",
                            fontSize: 16,
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: sel ? "#F4F0E4" : "transparent",
                            border: sel ? "2px solid #0A1218" : "2px solid transparent",
                          }}
                          onClick={() => setReceiverId(r.providerId)}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                            <span>
                              <span style={{ fontWeight: 600 }}>{providerName(r.providerId)}</span>{" "}
                              <span style={{ fontSize: 12, color: "#4A5660" }}>
                                live, bank-published{r.stale ? " · stale" : ""}
                              </span>
                              {rank === 0 && (
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#1B6F5A",
                                    color: "#FFFFFF",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    marginLeft: 4,
                                  }}
                                >
                                  Best
                                </span>
                              )}
                            </span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{inr0(r.amountReceived)}</span>
                          </span>
                          <span style={{ display: "block", marginTop: 7, height: 7, background: "#CFC8B5", borderRadius: 4 }}>
                            <span
                              style={{
                                display: "block",
                                height: 7,
                                borderRadius: 4,
                                width: `${w}%`,
                                background: `rgb(${col.join(",")})`,
                              }}
                            />
                          </span>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4, fontSize: 12, color: "#4A5660" }}>
                            <span>Direct bank-to-bank</span>
                            {benchmarkAmount !== null && (
                              <span>
                                −{inr0(benchmarkAmount - r.amountReceived)} vs interbank rate
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {excludedRoutes.map((r) => (
                      <div key={r.providerId} style={{ padding: "10px 12px", fontSize: 13, color: "#4A5660" }}>
                        {providerName(r.providerId)}: {r.reason}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {data?.failures && data.failures.length > 0 && (
              <p style={{ marginTop: 16, fontSize: 13, color: "#A33A2B" }}>
                Temporarily unavailable: {data.failures.map((f) => providerName(f.bankId)).join(", ")}
              </p>
            )}

            <div style={{ marginTop: 24, fontSize: 13, color: "#4A5660" }}>
              HDFC and SBI figures are live, pulled from each bank&apos;s own published rate-card PDF. Figures tagged
              &quot;sample&quot; on the sending side are illustrative placeholders, not sourced from any bank or provider.
            </div>
          </div>
        </div>
      </section>

      {/* ============ COMPARE ALL ============ */}
      <section id="compare" style={{ padding: "96px 0 40px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.1, letterSpacing: "-0.015em" }}>
            Every pairing at {eur0(amount)}
          </h2>
          <p style={{ margin: "10px 0 28px", color: "#C9C4B6" }}>Tap any cell to load it above.</p>
          {data && (
            <PairingGrid
              amount={amount}
              benchmarkRate={data.benchmark.rate}
              senders={senders}
              results={data.results}
              selectedSender={senderId}
              selectedReceiver={effectiveReceiverId}
              onPick={(sId, rId) => {
                setSenderId(sId);
                setReceiverId(rId);
              }}
            />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, maxWidth: 420, fontSize: 13, color: "#C9C4B6" }}>
            <span>Less arrives</span>
            <span
              style={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                background: "linear-gradient(90deg,rgba(181,72,58,0.75),rgba(217,164,65,0.75),rgba(63,163,127,0.75))",
              }}
            />
            <span>More arrives</span>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" style={{ padding: "80px 0 96px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.1, letterSpacing: "-0.015em" }}>
            How it works
          </h2>
          <p style={{ margin: "10px 0 0", color: "#C9C4B6" }}>
            Live rates, compared on every visit.
            {data ? ` Last updated ${new Date(data.benchmark.asOf).toLocaleString()}.` : ""}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40, marginTop: 40 }}>
            <HowStep n={1} title="Live rate" body="Today's mid-market EUR to INR interbank rate, fetched live." />
            <HowStep n={2} title="Real costs" body="Each bank's own published fees and rate markup, pulled from its daily rate-card PDF." />
            <HowStep n={3} title="Best today" body="Routes ranked by what actually arrives." />
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer id="contact" className="foot" style={{ background: "#071015", borderTop: "1px solid #24333D", padding: "56px 0 32px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40 }}>
            <div style={{ flex: "1.4 1 260px" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, color: "#EDE8DC" }}>[Brand name]</div>
              <p style={{ margin: "10px 0 0", maxWidth: "30ch", color: "#8FA0AA", fontSize: 15 }}>
                Compare what actually arrives when you send euros to India.
              </p>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>About us</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
                <a href="#how">How it works</a>
                <a href="#">Our story</a>
                <a href="#">Sources</a>
              </div>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Contact us</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15, color: "#C9C4B6" }}>
                <span>[hello@yourdomain.com]</span>
                <span>[Mon to Fri, 9am to 6pm IST]</span>
                <span>[Office address]</span>
              </div>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Legal</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
                <a href="#">Privacy policy</a>
                <a href="#">Terms of use</a>
                <a href="#">Disclaimer</a>
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 40,
              paddingTop: 20,
              borderTop: "1px solid #24333D",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 32px",
              justifyContent: "space-between",
              fontSize: 13,
              color: "#8FA0AA",
            }}
          >
            <span>&copy; [Year] [Brand name]</span>
            <span>For comparison only. Not financial advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#4A5660" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M4 7l5 5 5-5" />
    </svg>
  );
}

function HowStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ flex: "1 1 240px", borderTop: "1px solid #B89B5E", paddingTop: 18 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1, color: "#B89B5E" }}>{n}</div>
      <h3 style={{ margin: "12px 0 4px", fontSize: 19, fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: 0, color: "#C9C4B6" }}>{body}</p>
    </div>
  );
}

interface Sender {
  id: string;
  name: string;
  kind: string;
  tag: "live" | "sample";
}

function PairingGrid({
  amount,
  benchmarkRate,
  senders,
  results,
  selectedSender,
  selectedReceiver,
  onPick,
}: {
  amount: number;
  benchmarkRate: number;
  senders: Sender[];
  results: CompareResult[];
  selectedSender: string;
  selectedReceiver: string | null;
  onPick: (senderId: string, receiverId: string) => void;
}) {
  const receivers = results.filter((r) => r.excluded_reason === null && r.effective_rate !== null);

  const values: { senderId: string; receiverId: string; amountReceived: number }[] = [];
  senders.forEach((s) => {
    receivers.forEach((r) => {
      const addOn = computeSenderAddOn(s.id, amount);
      const combined = computeCombinedRoute(
        amount,
        benchmarkRate,
        { effectiveRate: r.effective_rate as number, feeFromCurrency: parseFloat(r.fee_from_currency ?? "0") },
        addOn
      );
      values.push({ senderId: s.id, receiverId: r.provider_id, amountReceived: combined.amountReceived });
    });
  });
  const lo = Math.min(...values.map((v) => v.amountReceived));
  const hi = Math.max(...values.map((v) => v.amountReceived));

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          minWidth: 780,
          display: "grid",
          gridTemplateColumns: `210px repeat(${receivers.length}, minmax(0, 1fr))`,
          gap: 8,
          alignItems: "stretch",
        }}
      >
        <div />
        <div
          style={{
            gridColumn: "2 / -1",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            color: "#EDE8DC",
            borderBottom: "1px solid #3B4A54",
            paddingBottom: 6,
          }}
        >
          Arriving at
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: 14, fontWeight: 600, color: "#EDE8DC", padding: "0 8px 8px" }}>
          Sending from
        </div>
        {receivers.map((r) => (
          <div
            key={r.provider_id}
            style={{ padding: "0 6px 8px", fontSize: 14, color: "#EDE8DC", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
          >
            <span>{providerName(r.provider_id)}</span>
            <span style={{ fontSize: 12, color: "#8FA0AA" }}>live</span>
          </div>
        ))}
        {senders.map((s) => (
          <Fragment key={s.id}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px", fontSize: 15, fontWeight: 600 }}>
              <span>{s.name}</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: "#8FA0AA" }}>{s.tag === "sample" ? "sample" : s.kind}</span>
            </div>
            {receivers.map((r) => {
              const v = values.find((x) => x.senderId === s.id && x.receiverId === r.provider_id);
              const amountReceived = v?.amountReceived ?? 0;
              const t = hi === lo ? 1 : (amountReceived - lo) / (hi - lo);
              const col = heat(t);
              const sel = s.id === selectedSender && r.provider_id === selectedReceiver;
              return (
                <button
                  key={`${s.id}-${r.provider_id}`}
                  className="cell"
                  aria-label={`${s.name} to ${providerName(r.provider_id)}: ${inr0(amountReceived)}`}
                  style={{
                    minHeight: 56,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 15,
                    color: "#FFFFFF",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: sel ? 700 : 500,
                    background: `rgba(${col.join(",")},0.55)`,
                    border: sel ? "2px solid #EDE8DC" : "2px solid transparent",
                  }}
                  onClick={() => onPick(s.id, r.provider_id)}
                >
                  {inr0(amountReceived)}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function EuropeToIndiaSkyline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 300"
      preserveAspectRatio="xMidYMax meet"
      style={{ display: "block", width: "100%", height: "auto", marginTop: 8 }}
    >
      <defs>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFC27A" stopOpacity={0.6} />
          <stop offset="1" stopColor="#FFC27A" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#244A56" />
          <stop offset="1" stopColor="#0A1218" />
        </linearGradient>
      </defs>

      <circle cx={1190} cy={180} r={150} fill="url(#sunGlow)" />
      <circle cx={1190} cy={165} r={46} fill="#FFD7A0" />

      <g fill="#0E1E27">
        <rect x={72} y={124} width={36} height={126} />
        <rect x={67} y={100} width={46} height={26} />
        <polygon points="72,100 90,40 108,100" />
        <rect x={89} y={28} width={2} height={14} />
        <rect x={112} y={214} width={62} height={36} />
        <polygon points="118,214 124,190 130,214" />
        <polygon points="140,214 146,196 152,214" />
        <polygon points="160,214 166,192 172,214" />
      </g>
      <circle cx={90} cy={113} r={6} fill="#F2C77A" />

      <g fill="#0E1E27">
        <polygon points="256,70 264,70 270,132 250,132" />
        <rect x={259} y={36} width={2} height={36} />
        <rect x={246} y={128} width={28} height={5} />
        <polygon points="250,133 270,133 282,190 238,190" />
        <rect x={231} y={190} width={58} height={6} />
        <path d="M226 250 L233 196 L287 196 L294 250 L282 250 Q260 218 238 250 Z" />
      </g>
      <g stroke="#2C4F5B" strokeWidth={1}>
        <line x1={253} y1={140} x2={267} y2={184} />
        <line x1={267} y1={140} x2={253} y2={184} />
        <line x1={244} y1={200} x2={256} y2={240} />
        <line x1={276} y1={200} x2={264} y2={240} />
      </g>

      <g fill="#0E1E27">
        <rect x={338} y={238} width={134} height={12} />
        <rect x={346} y={172} width={10} height={66} />
        <rect x={368} y={172} width={10} height={66} />
        <rect x={390} y={172} width={10} height={66} />
        <rect x={412} y={172} width={10} height={66} />
        <rect x={434} y={172} width={10} height={66} />
        <rect x={456} y={172} width={10} height={66} />
        <rect x={338} y={156} width={134} height={16} />
        <rect x={350} y={140} width={110} height={16} />
        <polygon points="378,140 384,126 426,126 432,140" />
        <rect x={386} y={114} width={8} height={12} />
        <rect x={398} y={108} width={8} height={18} />
        <rect x={410} y={108} width={8} height={18} />
        <rect x={420} y={114} width={8} height={12} />
        <polygon points="403,86 407,86 411,108 399,108" />
      </g>

      <g fill="#0E1E27">
        <rect x={958} y={242} width={84} height={8} />
        <rect x={964} y={234} width={72} height={8} />
        <path d="M972 234 V138 H1028 V234 H1012 V184 Q1000 158 988 184 V234 Z" />
        <rect x={966} y={130} width={68} height={8} />
        <path d="M984 130 Q1000 108 1016 130 Z" />
      </g>

      <g fill="#0E1E27">
        <rect x={1088} y={236} width={204} height={14} />
        <rect x={1148} y={170} width={84} height={66} />
        <path d="M1158 172 C1146 142 1168 122 1190 94 C1212 122 1234 142 1222 172 Z" />
        <rect x={1189} y={76} width={2} height={20} />
        <path d="M1144 172 V160 Q1153 142 1162 160 V172 Z" />
        <path d="M1218 172 V160 Q1227 142 1236 160 V172 Z" />
        <rect x={1110} y={202} width={38} height={34} />
        <path d="M1116 202 Q1129 180 1142 202 Z" />
        <rect x={1232} y={202} width={38} height={34} />
        <path d="M1238 202 Q1251 180 1264 202 Z" />
        <rect x={1098} y={132} width={10} height={104} />
        <path d="M1095 132 Q1103 114 1111 132 Z" />
        <rect x={1272} y={132} width={10} height={104} />
        <path d="M1269 132 Q1277 114 1285 132 Z" />
      </g>
      <path d="M1180 236 V198 Q1190 182 1200 198 V236 Z" fill="#19323D" />

      <g fill="#0E1E27">
        <rect x={1318} y={244} width={86} height={6} />
        <path d="M1326 244 V150 H1394 V244 H1370 V190 Q1360 164 1350 190 V244 Z" />
        <rect x={1326} y={132} width={12} height={18} />
        <path d="M1324 132 Q1332 116 1340 132 Z" />
        <rect x={1382} y={132} width={12} height={18} />
        <path d="M1380 132 Q1388 116 1396 132 Z" />
        <path d="M1346 150 Q1360 124 1374 150 Z" />
      </g>

      <path d="M260 36 Q725 -40 1190 78" fill="none" stroke="#FFD7A0" strokeOpacity={0.45} strokeWidth={1.5} className="arc" />
      <path d="M260 36 Q725 -40 1190 78" fill="none" stroke="#FFE3B8" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 12" className="flow" />
      <circle cx={260} cy={36} r={4} fill="#FFD7A0" />
      <circle cx={260} cy={36} r={11} fill="none" stroke="#FFD7A0" strokeOpacity={0.5} />
      <circle cx={1190} cy={78} r={4} fill="#FFD7A0" />
      <circle cx={1190} cy={78} r={11} fill="none" stroke="#FFD7A0" strokeOpacity={0.5} />

      <rect x={0} y={250} width={1440} height={50} fill="url(#water)" />
      <g stroke="#FFC27A" strokeLinecap="round" strokeOpacity={0.35} strokeWidth={2}>
        <line x1={1130} y1={258} x2={1250} y2={258} />
        <line x1={1150} y1={266} x2={1230} y2={266} />
        <line x1={1165} y1={274} x2={1215} y2={274} />
      </g>
      <g stroke="#7FA9B5" strokeLinecap="round" strokeOpacity={0.18} strokeWidth={2}>
        <line x1={210} y1={259} x2={310} y2={259} />
        <line x1={230} y1={268} x2={290} y2={268} />
      </g>
      <g fontFamily="var(--font-sans)" fontSize={12} fill="#C9C4B6" textAnchor="middle">
        <text x={90} y={288}>London</text>
        <text x={260} y={288}>Paris</text>
        <text x={405} y={288}>Berlin</text>
        <text x={1000} y={288}>Delhi</text>
        <text x={1190} y={288}>Agra</text>
        <text x={1360} y={288}>Mumbai</text>
      </g>
    </svg>
  );
}
