import { serve } from "@hono/node-server";
import { AttributionRules } from "./attribution.ts";
import { createApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { SalesLedger } from "./sales.ts";

const rules = new AttributionRules()
  .registerCoupon("ANA10", "crt_ana")
  .registerUtmContent("ana", "crt_ana")
  .registerCoupon("BRUNO10", "crt_bruno")
  .registerUtmContent("bruno", "crt_bruno");

const ledger = new SalesLedger(rules, systemClock);
const port = Number(process.env.PORT ?? 3005);

serve({ fetch: createApp(ledger).fetch, port }, (info) => {
  console.log(`vendas atribuídas em http://127.0.0.1:${info.port}`);
});
