import { type AttributionReason, type AttributionRules, type OrderInput } from "./attribution.ts";
import type { Clock } from "./clock.ts";

export type RefundInput = {
  id: string;
  orderId: string;
  amountCents: number;
};

export type AppliedRefund = {
  id: string;
  requestedCents: number;
  appliedCents: number;
  appliedAt: string;
};

export type OrderRecord = {
  id: string;
  totalCents: number;
  creatorId: string | null;
  reason: AttributionReason;
  refundedCents: number;
  netCents: number;
  refunds: AppliedRefund[];
};

export type RefundOutcome =
  | { status: "applied"; order: OrderRecord }
  | { status: "pending"; orderId: string }
  | { status: "duplicate" };

export class SalesLedger {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly pending = new Map<string, RefundInput[]>();
  private readonly seenRefunds = new Set<string>();

  constructor(
    private readonly rules: AttributionRules,
    private readonly clock: Clock,
  ) {}

  ingestOrder(order: OrderInput): OrderRecord {
    const existing = this.orders.get(order.id);
    if (existing) return snapshot(existing);

    const { creatorId, reason } = this.rules.attribute(order);
    const record: OrderRecord = {
      id: order.id,
      totalCents: order.totalCents,
      creatorId,
      reason,
      refundedCents: 0,
      netCents: order.totalCents,
      refunds: [],
    };
    this.orders.set(order.id, record);

    const queued = this.pending.get(order.id);
    if (queued) {
      for (const refund of queued) this.applyRefund(record, refund);
      this.pending.delete(order.id);
    }
    return snapshot(record);
  }

  ingestRefund(refund: RefundInput): RefundOutcome {
    if (this.seenRefunds.has(refund.id)) return { status: "duplicate" };
    this.seenRefunds.add(refund.id);

    const record = this.orders.get(refund.orderId);
    if (!record) {
      const queue = this.pending.get(refund.orderId) ?? [];
      queue.push(refund);
      this.pending.set(refund.orderId, queue);
      return { status: "pending", orderId: refund.orderId };
    }

    this.applyRefund(record, refund);
    return { status: "applied", order: snapshot(record) };
  }

  find(orderId: string): OrderRecord | undefined {
    const record = this.orders.get(orderId);
    return record ? snapshot(record) : undefined;
  }

  private applyRefund(record: OrderRecord, refund: RefundInput): void {
    const remaining = record.totalCents - record.refundedCents;
    const applied = Math.max(0, Math.min(refund.amountCents, remaining));
    record.refunds.push({
      id: refund.id,
      requestedCents: refund.amountCents,
      appliedCents: applied,
      appliedAt: this.clock().toISOString(),
    });
    record.refundedCents += applied;
    record.netCents = record.totalCents - record.refundedCents;
  }
}

function snapshot(record: OrderRecord): OrderRecord {
  return { ...record, refunds: record.refunds.map((refund) => ({ ...refund })) };
}
