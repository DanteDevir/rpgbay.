# Segurança e privacidade

A implementação está em desenvolvimento e não é certificação jurídica/de segurança. Testes cobrem BOLA entre contas, segredos, tenant editorial, limites concorrentes, state/nonce/JWT, uso único, versões otimistas e ledger imutável. Produção rejeita config incompleta/dev auth.

Cookies seguros/Origin nas mutações; consultas parametrizadas; rich text tratado como texto, React escapa saída; fórmulas usam parser limitado sem eval; templates remotos executáveis não são aceitos. Headers Helmet e Caddy; Tauri capabilities reduzidas. URLs de objetos são privadas e temporárias. Não logar tokens/query assinada/conteúdo/endereço. Logs da API registram somente code/requestId em falha; request logging desabilitado.

Riscos ainda abertos: reforço MFA/reautenticação, revogação federada/dispositivos, native OIDC/keystore mobile, upload gateway/quota operacional/órfãos, scanner real e imagens maliciosas, relay Foundry, assinaturas do aplicativo/updater, retenção/exclusão/consentimentos LGPD, auditoria completa de operações comerciais e observabilidade/alertas. SSRF: não há proxy arbitrário; endpoints de configuração só operacionais, não dados do usuário.

Execute `npm audit --omit=dev --audit-level=high` e `node scripts/scan-secrets.mjs`; scan incluído tem alcance limitado (env privado/PEM/Stripe live), não substitui revisão completa. Nunca inclua .env, chaves, dumps, tokens ou bases de clientes no ZIP. Procure responsável em canal do proprietário para incidentes; nenhum endereço de atendimento fictício é anunciado.

Minutas de termos/privacidade necessitam identificação real de fornecedor/custos/prazos/atendimento/cancelamento e aprovação jurídica antes de lançamento. Export de conteúdo autoral existe na API; exclusão e retenção legal não concluídas.
