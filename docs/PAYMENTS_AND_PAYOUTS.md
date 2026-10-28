# Pagamentos, comissão e repasses

Código em packages/finance e integrations/providers/payments.ts; integração em apps/api/src/provider-routes.ts. Métodos atualmente ligados: Stripe Checkout para BRL e Asaas Pix. Nenhuma cobrança real foi autorizada ou realizada. Mantenha PAYMENTS_LIVE_ALLOWED=false.

Comissão conjunta9% dos itens líquidos de desconto (proposta de base), frete excluído. Exemplo sem tarifa/frete: item10000centavos => comissão900 e editora9100. Em dois itens3333/6667 com desconto1000, rateio determinístico do desconto precede comissão; nenhuma operação usa float na aritmética do domínio. Conversões na borda Asaas usam formato aceito pelo provedor. Split percentual Asaas incide em netValue; adaptador usa valores fixos reconciliáveis.

Checkout obtém preço/entrega/conta verificada no banco e grava snapshot da política + chave idempotente. Mesmo pedido/processador não pode mudar silenciosamente. Volta do browser não libera compra. Webhook Stripe valida assinatura e consulta PaymentIntent canônico; Asaas autentica token e consulta pagamento. Confirmação bloqueia pedido e grava evento/entitlement/ledger na mesma transação. Trigger SQL impede UPDATE/DELETE do ledger; correções devem ser compensatórias.

Stripe separate charges and transfers exige contas conectadas habilitadas e país suportado. Crédito em ledger não significa transferência enviada. Asaas precisa customer binding e wallet verificados no servidor. Não aceitar recebedor arbitrário enviado pelo cliente. Provisionamento financeiro ainda é operacional e requer trilha auditada.

Elegibilidade: sete dias corridos do pagamento confirmado E saldo efetivamente disponível, KYC, sem disputas/reservas. Pedido de saque, envio e liquidação são distintos. Funções puras testam reserva/idempotência/insuficiência; worker de conciliação/payout, contabilidade de tarifas reais, refunds/disputes fora de ordem e fluxo completo de saque ainda precisam implementação. Não habilitar transferência direta do adaptador sem esses gates.

Política de pontos por compra, pagamentos de presente, recorrência BAY PASS, cupons/bundles/completar coleção e UI comercial completa devem seguir status atualizado na matriz. Sandbox local de transporte/JWKS não comprova conta sandbox externa. Vendedor responsável, notas fiscais, responsabilidades e contratos aguardam definição do proprietário/jurídico.
