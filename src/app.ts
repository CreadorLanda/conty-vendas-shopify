import { Hono } from "hono";
import type { OrderInput, Utm } from "./attribution.ts";
import type { RefundInput, SalesLedger } from "./sales.ts";

export function createApp(ledger: SalesLedger) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/webhooks/orders", async (c) => {
    const body = await c.req.json().catch(() => null);
    const order = parseOrder(body);
    if (!order) return c.json({ error: "pedido inválido" }, 400);
    return c.json(ledger.ingestOrder(order), 201);
  });

  app.post("/webhooks/refunds", async (c) => {
    const body = await c.req.json().catch(() => null);
    const refund = parseRefund(body);
    if (!refund) return c.json({ error: "estorno inválido" }, 400);
    return c.json(ledger.ingestRefund(refund), 201);
  });

  app.get("/orders/:id", (c) => {
    const order = ledger.find(c.req.param("id"));
    if (!order) return c.json({ error: "pedido não encontrado" }, 404);
    return c.json(order);
  });

  return app;
}

function parseOrder(body: unknown): OrderInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const id = asId(raw.id);
  const totalCents = asCents(raw.total_price ?? raw.totalCents);
  if (!id || totalCents === null) return null;
  const coupon = firstCoupon(raw);
  const utm = parseUtm(raw.utm);
  const order: OrderInput = { id, totalCents };
  if (coupon) order.coupon = coupon;
  if (utm) order.utm = utm;
  return order;
}

function parseRefund(body: unknown): RefundInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const id = asId(raw.id);
  const orderId = asId(raw.order_id ?? raw.orderId);
  const amountCents = asCents(raw.amount ?? raw.amountCents);
  if (!id || !orderId || amountCents === null) return null;
  return { id, orderId, amountCents };
}

function firstCoupon(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.coupon === "string") return raw.coupon;
  const codes = raw.discount_codes;
  if (Array.isArray(codes) && codes.length > 0) {
    const first = codes[0];
    if (first && typeof first === "object" && typeof (first as { code?: unknown }).code === "string") {
      return (first as { code: string }).code;
    }
  }
  return undefined;
}

function parseUtm(value: unknown): Utm | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const utm: Utm = {};
  for (const key of ["source", "medium", "campaign", "content", "term"] as const) {
    if (typeof raw[key] === "string") utm[key] = raw[key] as string;
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

function asId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  return null;
}
