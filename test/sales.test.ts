import { beforeEach, describe, expect, it } from "vitest";
import { AttributionRules } from "../src/attribution.ts";
import type { Clock } from "../src/clock.ts";
import { SalesLedger } from "../src/sales.ts";

const clock: Clock = () => new Date("2026-06-01T12:00:00.000Z");

function ledger() {
  const rules = new AttributionRules()
    .registerCoupon("ANA10", "crt_ana")
    .registerUtmContent("ana", "crt_ana")
    .registerUtmContent("bruno", "crt_bruno");
  return new SalesLedger(rules, clock);
}

describe("atribuição", () => {
  it("atribui pelo cupom", () => {
    const record = ledger().ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
    expect(record).toMatchObject({ creatorId: "crt_ana", reason: "coupon" });
  });

  it("atribui pela UTM quando não há cupom", () => {
    const record = ledger().ingestOrder({ id: "ord_1", totalCents: 15000, utm: { content: "bruno" } });
    expect(record).toMatchObject({ creatorId: "crt_bruno", reason: "utm" });
  });

  it("fica sem criador quando nada bate", () => {
    const record = ledger().ingestOrder({ id: "ord_1", totalCents: 15000 });
    expect(record).toMatchObject({ creatorId: null, reason: "none" });
  });

  it("cupom vence a UTM quando apontam para criadores diferentes", () => {
    const record = ledger().ingestOrder({
      id: "ord_1",
      totalCents: 15000,
      coupon: "ANA10",
      utm: { content: "bruno" },
    });
    expect(record).toMatchObject({ creatorId: "crt_ana", reason: "coupon" });
  });
});

describe("pedido duplicado", () => {
  it("não soma a venda de novo", () => {
    const book = ledger();
    const first = book.ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
    const second = book.ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
    expect(second).toEqual(first);
    expect(book.find("ord_1")?.netCents).toBe(15000);
  });
});

describe("estornos", () => {
  let book: SalesLedger;
  beforeEach(() => {
    book = ledger();
    book.ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
  });

  it("estorno parcial reduz o líquido e fica rastreável", () => {
    const outcome = book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    expect(outcome.status).toBe("applied");
    const order = book.find("ord_1");
    expect(order?.refundedCents).toBe(5000);
    expect(order?.netCents).toBe(10000);
    expect(order?.refunds).toHaveLength(1);
  });

  it("estorno repetido com o mesmo id não aplica duas vezes", () => {
    book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    const dup = book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    expect(dup.status).toBe("duplicate");
    expect(book.find("ord_1")?.refundedCents).toBe(5000);
  });

  it("a soma dos estornos nunca passa do valor da venda", () => {
    book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 9000 });
    book.ingestRefund({ id: "ref_2", orderId: "ord_1", amountCents: 9000 });
    const order = book.find("ord_1");
    expect(order?.refundedCents).toBe(15000);
    expect(order?.netCents).toBe(0);
    expect(order?.refunds.map((refund) => refund.appliedCents)).toEqual([9000, 6000]);
    expect(order?.creatorId).toBe("crt_ana");
  });
});

describe("estorno antes do pedido", () => {
  it("fica pendente e é aplicado quando o pedido chega", () => {
    const book = ledger();
    const early = book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    expect(early.status).toBe("pending");
    expect(book.find("ord_1")).toBeUndefined();

    const order = book.ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
    expect(order.refundedCents).toBe(5000);
    expect(order.netCents).toBe(10000);
  });

  it("não perde o estorno nem o duplica quando chega repetido antes do pedido", () => {
    const book = ledger();
    book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    const dup = book.ingestRefund({ id: "ref_1", orderId: "ord_1", amountCents: 5000 });
    expect(dup.status).toBe("duplicate");
    const order = book.ingestOrder({ id: "ord_1", totalCents: 15000, coupon: "ANA10" });
    expect(order.refundedCents).toBe(5000);
  });
});
