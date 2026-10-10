# Vendas atribuídas ao criador

Ingestão de webhook de pedido (no essencial de um pedido Shopify: id, total, cupom, UTMs, status) que atribui a venda a no máximo um criador e trata estorno — parcial, repetido e até antes do pedido. Não conecta em loja real.

## Atribuição

A regra fica num lugar só, em `AttributionRules.attribute` (`src/attribution.ts`): o cupom tem precedência sobre a UTM. Se o cupom aponta para um criador, vence; senão vale o `utm_content`; senão o pedido fica sem criador (`reason: "none"`). O desempate cupom × UTM é explícito e testado — o cupom é um código deliberado, sinal mais forte que o parâmetro de link.

## Estornos

`SalesLedger` (`src/sales.ts`) guarda o pedido com o total, o líquido e o histórico de estornos:

- **Webhook duplicado** do pedido não soma a venda de novo (dedupe por id do pedido).
- **Estorno parcial** reduz o líquido e fica rastreável (cada estorno guarda o pedido, o valor pedido e o valor aplicado).
- **Estorno repetido** com o mesmo id não aplica duas vezes (dedupe por id do estorno).
- A **soma dos estornos nunca passa do valor da venda**: o excedente é cortado (`appliedCents`), então o líquido não fica negativo.
- **Estorno antes do pedido** fica pendente por id do pedido e é aplicado, uma vez, quando o pedido chega.

Um estorno total zera o líquido mas não apaga a atribuição: `creatorId` e `reason` continuam, com o histórico.

## Como rodar

Node 22.

```bash
npm install
npm test
npm run dev   # http://127.0.0.1:3005
```

```bash
curl -s -X POST localhost:3005/webhooks/orders \
  -H 'content-type: application/json' \
  -d '{"id":"ord_1","total_price":"150.00","discount_codes":[{"code":"ANA10"}]}'

curl -s -X POST localhost:3005/webhooks/refunds \
  -H 'content-type: application/json' \
  -d '{"id":"ref_1","order_id":"ord_1","amount":"50.00"}'

curl -s localhost:3005/orders/ord_1
```

## Uso de IA

Usei o Claude para criar os testes.
