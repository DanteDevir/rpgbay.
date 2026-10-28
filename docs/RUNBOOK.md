# Runbook

## Iniciar desenvolvimento

`bash scripts/dev.sh` (Linux/macOS com Docker/Node24), ou scripts/dev.ps1 (PowerShell; API em terminal separado). Não use fixtures em produção. No sandbox da entrega, API e Vite foram iniciados separadamente com banco sintético; README documenta comandos.

## Falha de dependências

/api/health verifica banco, não prova todos provedores. OIDC discovery inválido impede boot fora de dev. Checkout/R2 sem config responde503; mantenha bloqueado, não habilite mock. Scanner /health503 significa ferramentas/base indisponíveis; instalar/atualizar base antes de permitir ingestão. R2 indisponível: preserve metadados/licenças e reexecute operação idempotente após diagnóstico. Discord falho não deve bloquear livro/mesa. Foundry exige reconciliação de autoridade e eventos deduplicados.

## Backup/restore do banco

Instale cliente PostgreSQL17 compatível. Gere32bytes aleatórios em arquivo0600 fora do checkout (`node` crypto.randomBytes); não imprima chave. `BACKUP_KEY_FILE=/caminho/chave DATABASE_URL=... node scripts/db-backup.mjs backup /caminho/backup.bak`. O arquivo usa nonce aleatório AES256GCM. Guarde chave em cofre distinto.

Restauração em banco de teste vazio: `PGDATABASE=rpgbay_restore_test RESTORE_CONFIRM_DATABASE=rpgbay_restore_test BACKUP_KEY_FILE=... DATABASE_URL=... node scripts/db-backup.mjs restore ...`. O dump é autenticado antes de alterar o banco, pg_restore transacional; compare contagens/integridade/direitos e referências aos objetos. Modo local Docker: PG_TOOL_MODE=docker, PG_CONTAINER=rpgbay-postgres, DOCKER_HOST do daemon local. Nenhum nome arbitrário vira shell.

Teste real de banco executado nesta entrega; R2 backup/restore e recuperação com perda de conta/chave ainda pendentes. Mantenha cópias independentes, retenção e monitoramento. Não guarde backup/chave no ZIP.

## Jobs/pagamentos

Pedido requires_reconciliation após falha ambígua: consulte provedor por referência, não repita cobrança Asaas cegamente. Webhook duplicado é seguro; evento refund/dispute não tratado exige intervenção humana e impede operação comercial autônoma. Nunca altere ledger: ajuste compensatório.

## Parar/recuperar

CTRL+C em Vite/API; `docker compose -f compose.dev.yaml stop` preserva banco. Não usar down -v em produção. Após restauração: migrations, health, comparação de permissões e testes de compra sandbox antes de abrir acesso. Rotação de chave offline deve manter meios legítimos de recuperar conteúdo necessário; recuperação de chave global não existe no app.
