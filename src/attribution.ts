export type Utm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export type OrderInput = {
  id: string;
  totalCents: number;
  coupon?: string;
  utm?: Utm;
};

export type AttributionReason = "coupon" | "utm" | "none";

export type Attribution = {
  creatorId: string | null;
  reason: AttributionReason;
};

export class AttributionRules {
  private readonly byCoupon = new Map<string, string>();
  private readonly byUtmContent = new Map<string, string>();

  registerCoupon(coupon: string, creatorId: string): this {
    this.byCoupon.set(normalize(coupon), creatorId);
    return this;
  }

  registerUtmContent(content: string, creatorId: string): this {
    this.byUtmContent.set(normalize(content), creatorId);
    return this;
  }

  attribute(order: OrderInput): Attribution {
    const byCoupon = order.coupon ? this.byCoupon.get(normalize(order.coupon)) : undefined;
    if (byCoupon) return { creatorId: byCoupon, reason: "coupon" };

    const content = order.utm?.content;
    const byUtm = content ? this.byUtmContent.get(normalize(content)) : undefined;
    if (byUtm) return { creatorId: byUtm, reason: "utm" };

    return { creatorId: null, reason: "none" };
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
