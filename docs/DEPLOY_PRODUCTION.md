# Deploy e operação de produção

**Não executar go-live com este estado.** Use PRODUCTION_READINESS.md e a matriz para fechar pendências. A entrega não autoriza DNS, cobranças, transferências ou deploy em contas externas.

## Topologia proposta

VPS Linux com Docker/Compose; Caddy publica https://rpgbay.libbay.com; API em /api (mesma origem); PostgreSQL isolado, scanner em rede interna. R2 é canônico para objetos; banco armazena metadados/direitos. Sugestão inicial de capacidade para homologação:4vCPU/8GiB, disco conforme banco/temporários. É uma proposta não medida de capacidade; dimensionar com carga e orçamento de storage/egress/scanner. Nenhum domínio ou bucket foi provisionado.

1. Copie `.env.production.example` para `.env.production`, preencha localmente (0600). Use credenciais separadas por ambiente; nunca valores demo. DATABASE_URL aponta `postgres:5432`; POSTGRES_PASSWORD deve coincidir. Configure o mesmo POSTGRES_PASSWORD no ambiente do Compose (interpolação de Compose não é fornecida pelo env_file do serviço).
2. `docker compose --env-file .env.production config --quiet` valida composição. `npm ci`, `npm run build`, testes e scan devem passar antes de build da imagem.
3. `docker compose --env-file .env.production build` compila. API recusa produção incompleta ou DEV_AUTH_ENABLED=true. Migrations são serviço único transacional antes da API. Banco não publica porta externa.
4. Configure DNS A/AAAA e firewall80/443 somente com autorização do proprietário. Caddy solicita TLS; teste emissão em homologação. Não habilite HSTS includeSubDomains sem validar domínio/subdomínios.
5. Scanner profile: `docker compose --env-file .env.production --profile publishing up -d`. Atualize bases reais com `docker compose run --rm --user root scanner freshclam` e ajuste bases e arquivos .sign para0644 (dados públicos de assinaturas, sem segredos) para o usuário node ler; health deve ficar ready. Sem base, ingestão permanece bloqueada. ClamAV exige até2GiB de espaço de endereçamento por processo; demais ferramentas768MiB e duas conexões simultâneas. CPU/RAM/disk/tmpfs precisam de limites de contêiner adicionais conforme host.
6. Verifique /api/health, login real, CORS nativo, webhooks autenticados, private storage e restauração antes de permitir vendas.

Backups: scripts/db-backup.mjs exige pg_dump/pg_restore compatíveis e chave32bytes fora do checkout; roteiro em RUNBOOK.md. Objetos R2 precisam de política de cópia independente/restauração; ainda não operacionalizada. Nunca confundir volume do banco com backup. Uma conta R2 única é domínio de falha compartilhado.

Rollback: backup pré-migração e snapshot de objetos referenciados; nenhuma down migration destrutiva automática. Reaplique imagem anterior somente se schema compatível; restauração requer janela aprovada. Compose/produção não foram implantados externamente nesta entrega.
