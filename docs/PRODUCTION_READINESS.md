# Prontidão da entrega

**Resultado: V1.0 integral NÃO concluída. NÃO pronta para clientes/go-live.** Esta é uma entrega de código funcional em desenvolvimento com vários domínios implementados e lacunas reais. Nenhum requisito obrigatório foi transferido para versão futura. Configurações externas não resolvem automaticamente trabalho de código ainda incompleto.

| Domínio              | Código e validação observados                                                                | Pendência de lançamento                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Web PT-BR responsiva | Build, Chromium, leitor PDF real e dados PostgreSQL                                          | SEO/SSR por produto, virtualização e fluxos editoriais/operacionais completos na UI                                  |
| Identidade web       | PKCE/state/nonce/JWT/JWKS/session/CSRF em testes locais                                      | Issuer NAJA ID real, logout federado/revogação refresh/dispositivos, MFA/reautenticação                              |
| PostgreSQL           | Migrations transacionais, constraints, locks, permissões e conflitos testados                | Operação/alertas/migração compatível em homologação e plano de retenção                                              |
| R2                   | Adapter S3, gateway limitado antes da escrita, SHA/MIME/scanner e quotas testados localmente | Buckets/CORS/credenciais, teste R2 real, limpeza órfãos/multipart, backup/restore de objetos                         |
| Scanner              | Código real ClamAV/qpdf/ImageMagick; PDF/MIME falso/EICAR HTTP testados                      | Operação de atualização de assinaturas, recursos e isolamento em produção; scanner local pronto                      |
| Checkout             | Stripe/Asaas real, confirmação canônica/idempotência/licença/ledger testada com fixtures     | Contas marketplace/KYC/sandbox externo real; base comercial/tarifas, cupons/bundles/recorrência                      |
| Reembolso e saque    | Dinheiro exato e elegibilidade/reserva/estorno em domínio; adapters reais                    | Workers transacionais de conciliação/refund/dispute/payout, liquidação, auditoria de destino/reauth                  |
| Família              | Até5 sob concorrência, agregado e remoção/revogação online testados                          | Política antitroca a aprovar, offline familiar operacional e licenças editoriais reais                               |
| Biblioteca           | PDF.js páginas/zoom/sumário/texto/busca/notas/bookmarks/conflitos                            | OCR opt-in, provas com PDF grande/criptografia, ingestão/pacotes para leitor nativo                                  |
| Offline              | Manifesto Ed25519, AES-GCM por livro, resume/hash e keyring desktop no código                | Emissão/enrollment/licenças no backend, UI nativa offline após restart e rotação; keystore mobile                    |
| Tauri                | Fontes desktop/mobile, Cargo.lock, compilação Linux conforme TEST_REPORT                     | Teste runtime/native auth e secure bridge mobile, builds/dispositivos Windows/macOS/Android/iOS, updater/assinaturas |
| Mesas/fichas         | Sem livro,15mesas, dados/fórmulas/segredos/apresentação segura no servidor                   | Editor visual de layouts/templates, calendário/convites completos, suporte real a sistemas específicos               |
| Voz Discord          | Somente diagnóstico e fallback externo identificado                                          | SDK/ponte nativa oficial, linking/lobbies/controles/requisitos de liberação e testes por plataforma                  |
| Tela                 | getDisplayMedia por ação do usuário, parada local                                            | Sinalização/WebRTC/TURN/autorização/transmissão aos participantes e teste real multiplataforma                       |
| Foundry              | Manifest/módulo/protocolo HMAC/escopos/replay testados                                       | Relay/pairing servidor, adaptadores de sistemas e mundo Foundry real; nenhuma compatibilidade verificada             |
| Áudio                | Nenhuma retransmissão indevida                                                               | Player/playlist de conteúdo licenciado, sincronização/transporte/volume e termos de integrações                      |
| Comunidade           | Discussões/comentários/bloqueios/denúncia/moderação no servidor                              | Amigos/presença/follow/avisos, homebrew publishing completo, anti-spam/recursos humanos/apelação UI                  |
| Editoras/betas       | RBAC/arquivos/status/betas/versão fixada/feedback                                            | Onboarding real, métricas definidas/CSV e todos painéis operacionais                                                 |
| Presentes/físicos    | Segredo/resgate/dedicatória; pagamento vinculado e endereço cifrado/prova/aceite no servidor | Capas/artes/comissões/variantes/custo/frete/fornecedor real, fluxos UI completos e validação operacional             |
| Points/PASS          | Débito cosmético atômico/propriedade + modelos de domínio                                    | Política pontos/compra aprovada, grants/refunds/passe recorrente por webhook/quota e UI                              |
| Mundos               | Páginas/histórico/conflitos/RBAC/links/mesa/export; editor simples funcional                 | Editor refinado de links/timeline/recuperação completa e export de assets autorizados                                |
| Operação/legal       | Compose/headers/scripts/backup cifrado banco+restore testado                                 | Deploy autorizado, scanner/alertas/jobs/email real/retries, LGPD/exclusão/retenção/termos/fornecedor e licenças      |

## Credenciais/aprovações reais necessárias

Issuer e clientes NAJA ID; R2 conta/buckets/tokens mínimos; Stripe Connect e Asaas aprovados/KYC/webhook sandbox; política fiscal/comercial; SDK Discord/licença/acesso/liberação; Foundry legítimo e mundo de teste; SMTP/provedor; gráfica/logística e direitos de arte; assinatura de aplicativos/Apple/Android e chaves de manifesto/updater. Configure em arquivos privados/secret store, sem enviar no chat. PAYMENTS_LIVE_ALLOWED não é autorização para usar dinheiro real.

## Ordem concreta de conclusão

1. Completar identity nativa, licenças/offline/end-to-end e builds/plataformas.
2. Completar relay Foundry, SDK Discord, tela multiusuário e trilhas licenciadas.
3. Completar financeiro operacional, PASS/points/refunds, editoriais/social/homebrew/print UI e políticas.
4. Fechar upload workers/órfãos/R2 restore/retenção/email/alertas/segurança operacional.
5. Executar20critérios originais em homologação legítima e revisar matriz linha a linha antes de go-live.

Estes itens permanecem pendências desta V1, não uma redefinição do pedido como MVP. Arquivo ZIP com nome exigido identifica o pacote solicitado; não certifica completude ou homologação.
