# Integrações e domínio financeiro

Estado observado em 28/10/2026. Adaptadores reais; testes unitários usam somente transporte injetado e fixtures locais. Nenhuma cobrança, transferência ou escrita em conta externa foi executada.

## Fontes oficiais consultadas

- Cloudflare R2: https://developers.cloudflare.com/r2/api/s3/presigned-urls/ — URLs curtas são bearer tokens reutilizáveis; endpoint S3, `region: auto`.
- Stripe Connect: https://docs.stripe.com/connect/separate-charges-and-transfers — cobrança da plataforma e transferências para múltiplas contas conectadas; disponibilidade depende de país/conta.
- Asaas: https://docs.asaas.com/reference/criar-nova-cobranca e https://docs.asaas.com/docs/receba-informacoes-das-cobrancas-via-webhook — API v3, autenticação `access_token`; webhook autenticado por `asaas-access-token`.
- Zitadel: https://zitadel.com/docs/guides/integrate/login/oidc/login-users — Authorization Code com PKCE, discovery do issuer configurado.

As páginas acima foram obtidas via HTTPS no ambiente de implementação. Consulta documental não substitui teste com conta sandbox do proprietário. Versões dos SDKs estão fixadas em package.json/package-lock.json.

## Código entregue

`integrations/providers/oidc.ts`: discovery real, state associado ao navegador, nonce, PKCE S256, código de uso único em armazenamento transacional, validação JWT de issuer/audience/assinatura/expiração/authorized-party, revogação de token e URL de logout quando suportados. `apps/api/src/provider-routes.ts`: login/callback e sessão local opaca em cookie HttpOnly/SameSite=Lax/Secure em produção. O backend guarda somente hash do token de sessão. Logout da rota encerra a sessão RPG BAY; o logout federado e a revogação de refresh token não estão ligados à sessão da aplicação. Nenhum refresh token é persistido.

`integrations/providers/r2.ts`: cliente S3 real, buckets por classe, chaves opacas com tenant, upload em quarentena, PUT/GET pré-assinado, multipart/abort, Range, SHA-256 de aplicação, contagem real de bytes, assinatura de conteúdo, dimensões PNG e publicação por cópia condicionada ao ETag da versão validada. A publicação exige scanner injetado: **não existe scanner falso que libere conteúdo automaticamente**. PDF/JPEG/WebP precisam de inspeção isolada de estrutura, dimensões/decompressão/ameaças pelo scanner, além da assinatura inicial. As rotas de storage ligam intenção/quota ao banco com lock por tenant; a ingestão retorna 503 sem worker de inspeção configurado. URLs de upload não garantem sozinhas o teto de bytes. A rota padrão entrega PUT autenticado no gateway: grava stream temporário limitado, valida tamanho real/SHA-256/MIME antes do envio ao R2 e mantém quatro uploads simultâneos por processo. URLs pré-assinadas continuam disponíveis no adapter, sem serem expostas por padrão. Limpeza periódica de órfãos ainda precisa de integração operacional.

`integrations/providers/payments.ts`: Stripe Checkout com Connect/separate charges and transfers, onboarding de conta existente, transferência com conta habilitada, reembolso e verificação de assinatura/tolerância temporal do webhook. Asaas Pix/split por valor fixo, QR Code, consulta canônica, reembolso e validação de token de webhook com comparação constante. `asaasCustomerId` recebido do cliente não determina identidade financeira: checkout consulta `customer_payment_accounts` no servidor. Não se pressupõe suporte do Asaas a uma chave arbitrária de idempotência no POST; falha ambígua bloqueia repetição automática e exige conciliação.

`apps/api/src/provider-routes.ts`: checkout com preços do banco, apenas produtos publicados com entrega validada e contas editoriais verificadas; snapshot e chave de idempotência persistentes; URLs retornadas não concedem licença; webhook validado consulta o provedor e concede entitlements uma única vez na mesma transação do evento e ledger. A retenção/transferência é separada da aquisição. Checkout existente com a mesma chave retorna o mesmo pedido. Processador e itens diferentes com a mesma chave retornam conflito.

`apps/api/src/storage-routes.ts`: reserva de quota serializada por tenant, publicação editorial com verificação de papel antes e depois da inspeção, versões com checksum/somente validação do servidor, download privado com HTTP Range e autorização por licença própria/família/beta fixado. Limite comum confirmado: 2.000.000 bytes por arquivo; total dev proposto de 20.000.000 bytes. Editorial dev proposto: 512 MiB por arquivo/5 GiB total. Produção exige configuração explícita das cotas.

`apps/worker/src/scanner.ts`: serviço Linux autenticado com token de 32+ caracteres, streaming para arquivo temporário privado, ClamAV, qpdf e ImageMagick. Rejeita malware, PDF com JavaScript/ações/arquivos incorporados/criptografia, expansão excessiva, imagem incompatível/multiframe/dimensões excessivas. Executa ferramentas sem shell com prlimit de CPU/endereço/arquivo e timeout. Depende de executáveis e base de assinaturas real. Inicialmente health503 por dependências ausentes; após instalação/base oficial e duas correções reais, health200 e testes HTTP clean/MIME falso/EICAR passaram. Nenhuma ausência de scanner libera arquivos.

`packages/finance/index.ts`: BRL em centavos inteiros com BigInt nos intermediários; política proposta versionada de 9% conjunta; distribuição por maior resto com desempate estável por ID; desconto por item; frete separado; produção/tarifas discriminadas; estornos proporcionais cumulativos; ledger balanceado/congelado; sete dias corridos contados do pagamento confirmado **e** disponibilidade real do provedor; KYC/disputa/reservas; reserva evita novo saque do mesmo saldo. Banco tem trigger contra UPDATE/DELETE do ledger; ajustes devem ser lançamentos compensatórios.

## Configuração

OIDC_ISSUER não é derivado do nome NAJA: deve ser issuer HTTPS real, sem barra adicional divergente do discovery. Configure OIDC_CLIENT_ID, OIDC_REDIRECT_URI e OIDC_CLIENT_SECRET somente se cliente confidencial. WEB_ORIGIN é uma origem confiável, previamente registrada; callbacks nativos exigem clientes e handlers próprios (não entregues pelo adapter web).

Stripe: STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET. Asaas: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_ENVIRONMENT=sandbox. Chaves ausentes retornam diagnóstico 503 no endpoint correspondente. Produção não usa fixtures. Chaves live/ambiente production exigem PAYMENTS_LIVE_ALLOWED=true explicitamente, além de configuração e autorização operacional do proprietário.

Contas verificadas em `publisher_payment_accounts` e o vínculo do cliente Asaas em `customer_payment_accounts` devem ser provisionados por processo privilegiado auditado após onboarding real; não existe default. O adapter não afirma criar/aprovar conta comercial.

R2 usa `R2Config` tipado: accountId, accessKeyId, secretAccessKey e mapa de buckets public/library/user/publishing/backups. Credenciais apenas no servidor. Classes privadas não devem usar bucket público. Validar CORS/lifecycle/menor privilégio na conta antes de uso. Nenhum bucket/domínio foi provisionado nesta entrega.

## Pendências que impedem go-live financeiro/storage/identidade

1. Sandbox externo real: login com assinatura/JWKS do issuer, logout federado e revogação; Pix/cartão, retry de rede, replay e webhook de contas configuradas; contas Connect/Asaas de múltiplas editoras. Os testes locais cobrem mecanismos, não aprovação comercial.
2. Aprovação formal da base comercial/tarifas/vendedor fiscal. Checkout atual aceita somente itens digitais sem frete/produção/cupom, snapshot com tarifa estimada zero; saldo permanece retido até conciliação de tarifa real. O cálculo de domínio suporta esses componentes, mas UI/roteamento comercial completo ainda precisa ligar todos os casos.
3. Webhooks de reembolso/chargeback/disputa fora de ordem, compensações de ledger, revogação granular da licença, pontos e taxas reais: não processados automaticamente. Eventos não tratados respondem `handled:false`; não se declara cobertura integral.
4. Worker de conciliação e payout idempotente transacional, payout efetivamente liquidado, configuração interna da divisão da comissão, mudança auditada de destino com reautenticação: ainda pendentes. Funções puras de elegibilidade/reserva não são transferências operacionais. `transfer()` só deve ser chamado depois desses gates.
5. Gateway limitado antes da escrita, quotas e scanner local real estão ligados/testados. Limpeza de órfãos, restauração R2, operação contínua de assinaturas e testes no R2 real permanecem pendentes. Não se deve marcar upload validado sem `validateAndPublish()` e scanner verdadeiro.
6. Sessões/dispositivos administráveis, reautenticação financeira/MFA, refresh, cliente OIDC nativo e invalidação federada automática ainda precisam de integração.

Nenhum dos itens externos acima foi validado em produção. A presença de adapter compilável não equivale a integração comercial pronta.

## Verificação local executada

`npm run typecheck`: passou após ajustes de tipos. `TEST_DATABASE_URL=... npx tsx --test tests/providers-api.test.ts tests/providers-finance.test.ts`: 10 testes passaram; PostgreSQL real local, fixture Stripe assinada criptograficamente com transporte SDK substituído somente no teste, JWT RS256/JWKS local real, deduplicação, valor divergente sem licença, ledger imutável, dinheiro/estorno/retenção e bytes/MIME/hash. Nenhuma conta externa chamada. `npm run db:migrate` aplicou 004_storage.sql no PostgreSQL local. Scanner inicialmente503 foi reparado: base oficial instalada, health200, PDF autoral aceito, MIME falso/EICAR rejeitados. Ver TEST_REPORT.md.

## Presentes pagos e prova de impressão

Checkout aceita giftId e exige remetente autenticado, presente pendente/não expirado e exatamente o produto presenteado. Restrição UNIQUE(gift_id) impede pedidos duplicados com chaves distintas. Webhook confirma o pagamento e muda presente para ready sem conceder biblioteca ao remetente; resgate concede ao destinatário no fluxo principal. Teste PostgreSQL cobre webhook duplicado e ausência de licença indevida. A confirmação ainda exige valor e identidade canônica do pagamento vinculados uma única vez por processador.

Upload print_proof recebe publisherId/printJobId, verifica equipe editorial e etapa do pedido e publica PDF validado sem criar versão do livro. Transição física verifica prova publicada vinculada ao pedido antes da aprovação do comprador. Arquivos são privados no bucket publishing, chave opaca objects/<tenant>/... .

## Emuladores locais — validação separada de sandbox

CodeRabbit emulate release v0.0.1 foi inspecionado (catálogo e skills Stripe/AWS). O teste opcional `RUN_EMULATOR_TESTS=true npx tsx --test tests/providers-emulator.test.ts` passou: HTTP/SDK reais para criar/confirmar/consultar PaymentIntent, verificar webhook assinado, criar buckets S3 e put/get com bytes exatos. Nenhuma operação atingiu conta Stripe/Cloudflare. O teste inicia/encerra serviços em memória e usa identidades sintéticas.

Limites observados: emulador Stripe não aceita inline price_data usado pelo checkout real (exige price previamente criado) e omite amount_received do PaymentIntent. O teste registra essas limitações; a aplicação continua exigindo amount_received e não concede licença com resposta incompleta. O emulador AWS verifica wire transport S3 básico, não comprova autorização/conditional copy/multipart/Range específicos do R2. Não há serviço Asaas/Zitadel correspondente às operações reais na release inspecionada. Okta genérico não substitui validação do issuer Zitadel.

STRIPE_API_ORIGIN e R2_EMULATOR_ENDPOINT permitem somente HTTP loopback em NODE_ENV=development/test; produção os rejeita. Não usar credenciais reais com emuladores. Seed e runtime ficam fora do ZIP em $HOME/runtime/emulate-config/. Para reproduzir, instalar a release conforme documentação do ambiente e executar o teste opcional; o pacote de produção não depende dela.
