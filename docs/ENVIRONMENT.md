# Variáveis de ambiente

Arquivos .env.example da raiz/API/web/worker. Carregue variáveis no processo (não há loader implícito dotenv). `.env` é ignorado pelo Git; nunca configure segredo via VITE_ pois será público no bundle. Produção é fail-closed conforme apps/api/src/config.ts.

| Nome                              | Tipo                 | Obrigatória em produção | Origem e validação                                                                         |
| --------------------------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| NODE_ENV                          | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| DEV_AUTH_ENABLED                  | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| VITE_DEV_AUTH                     | Público/configuração | Condicional ao serviço  | Build frontend; sem segredos, API HTTPS explícita para nativo                              |
| DATABASE_URL                      | Secreto              | Sim                     | Operador; consulte documento do domínio correspondente                                     |
| PORT                              | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| HOST                              | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| WEB_ORIGIN                        | Público/configuração | Sim                     | Operador; consulte documento do domínio correspondente                                     |
| TRUST_PROXY                       | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| OIDC_ISSUER                       | Público/configuração | Sim                     | Configuração real de cliente/issuer Zitadel; discovery e HTTPS exatos                      |
| OIDC_AUDIENCE                     | Público/configuração | Sim                     | Configuração real de cliente/issuer Zitadel; discovery e HTTPS exatos                      |
| OIDC_CLIENT_ID                    | Público/configuração | Sim                     | Configuração real de cliente/issuer Zitadel; discovery e HTTPS exatos                      |
| OIDC_CLIENT_SECRET                | Secreto              | Condicional ao serviço  | Configuração real de cliente/issuer Zitadel; discovery e HTTPS exatos                      |
| OIDC_REDIRECT_URI                 | Público/configuração | Sim                     | Configuração real de cliente/issuer Zitadel; discovery e HTTPS exatos                      |
| R2_ACCOUNT_ID                     | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_ACCESS_KEY_ID                  | Secreto              | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_SECRET_ACCESS_KEY              | Secreto              | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_BUCKET_LIBRARY                 | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_BUCKET_USER                    | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_BUCKET_PUBLIC                  | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_BUCKET_PUBLISHING              | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_BUCKET_BACKUPS                 | Público/configuração | Sim                     | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| R2_PUBLIC_ASSET_ORIGIN            | Público/configuração | Condicional ao serviço  | Cloudflare da conta autorizada; nomes de buckets separados e account ID hex32              |
| STRIPE_SECRET_KEY                 | Secreto              | Condicional ao serviço  | Dashboard Stripe autorizado; sandbox primeiro, webhook assinatura validada                 |
| STRIPE_WEBHOOK_SECRET             | Secreto              | Condicional ao serviço  | Dashboard Stripe autorizado; sandbox primeiro, webhook assinatura validada                 |
| ASAAS_API_KEY                     | Secreto              | Condicional ao serviço  | Dashboard Asaas; sandbox, token webhook e conta vinculada                                  |
| ASAAS_WEBHOOK_TOKEN               | Secreto              | Condicional ao serviço  | Dashboard Asaas; sandbox, token webhook e conta vinculada                                  |
| ASAAS_ENVIRONMENT                 | Público/configuração | Condicional ao serviço  | Dashboard Asaas; sandbox, token webhook e conta vinculada                                  |
| PAYMENTS_LIVE_ALLOWED             | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| SCANNER_URL                       | Público/configuração | Sim                     | Operador; consulte documento do domínio correspondente                                     |
| SCANNER_TOKEN                     | Secreto              | Sim                     | Operador; consulte documento do domínio correspondente                                     |
| SMTP_URL                          | Secreto              | Condicional ao serviço  | Provedor email; configuração reservada, envio/retries ainda não implementados              |
| SMTP_FROM                         | Público/configuração | Condicional ao serviço  | Provedor email; configuração reservada, envio/retries ainda não implementados              |
| DISCORD_APPLICATION_ID            | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| DISCORD_SDK_DIR                   | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| RPGBAY_API_ORIGIN                 | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| RPGBAY_MANIFEST_PUBLIC_KEY        | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| OFFLINE_MANIFEST_PRIVATE_KEY_FILE | Secreto              | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| BACKUP_KEY_FILE                   | Secreto              | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| USER_QUOTA_BYTES                  | Público/configuração | Sim                     | Política comercial explícita; inteiro positivo em bytes                                    |
| EDITORIAL_QUOTA_BYTES             | Público/configuração | Sim                     | Política comercial explícita; inteiro positivo em bytes                                    |
| EDITORIAL_FILE_LIMIT_BYTES        | Público/configuração | Sim                     | Política comercial explícita; inteiro positivo em bytes                                    |
| SCANNER_PORT                      | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| SCANNER_HOST                      | Público/configuração | Condicional ao serviço  | Operador; consulte documento do domínio correspondente                                     |
| VITE_API_ORIGIN                   | Público/configuração | Condicional ao serviço  | Build frontend; sem segredos, API HTTPS explícita para nativo                              |
| PRINT_ADDRESS_ENCRYPTION_KEY      | Secreto              | Sim                     | Secret store;32bytes cifragem endereços em64hex; rotação exige preservar chaves anteriores |

SMTP, Discord, manifest signer e updater não têm fluxo operacional completo. A presença da variável não indica integração pronta. POSTGRES_PASSWORD/PUBLIC_HOST são adicionais do Compose em .env.production.example. STRIPE_API_ORIGIN e R2_EMULATOR_ENDPOINT são somente local/test e recusados em produção; nunca usar credencial real com emulador.
