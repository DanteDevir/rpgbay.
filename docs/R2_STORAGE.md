# Storage R2

Adaptador real em integrations/providers/r2.ts, rotas em apps/api/src/storage-routes.ts e scanner em apps/worker/src/scanner.ts. Endpoint exclusivo: https://<account>.r2.cloudflarestorage.com, região auto; presign usa endpoint S3, sem trocar hostname por CDN. Credenciais ficam apenas na API.

## Classes

PUBLIC para assets permitidos; LIBRARY para pacotes; USER para imagens privadas; PUBLISHING para originais/provas; BACKUPS para cópias. Quarentena é prefixo privado da classe correspondente. Buckets devem ser distintos por ambiente/classe. Chaves tenant/opacas/versão imutável; nomes e títulos não autorizam acesso. Acesso de leitura verifica compra/família/beta antes de Range privado no gateway, Cache-Control private,no-store.

## Ingestão executável

POST /api/uploads/intents reserva quota sob row lock, verifica papel editorial e devolve endpoint PUT autenticado do gateway. /complete verifica tamanho efetivo, magic MIME, SHA256 e scanner real antes de cópia condicionada por ETag e inserção de versão. O scanner recusa arquivos ativos/malware/expansões/imagens inválidas quando ferramentas/base estão disponíveis. Sem scanner configurado não publica. Reservas expiradas deixam de ocupar quota; limpeza física/retentativas operacionais ainda necessárias.

Gateway padrão conta bytes reais, verifica tamanho/hash/MIME antes de enviar ao R2 e limita uploads simultâneos; testes provaram que excesso/hash errado não fazem escrita no R2. Capacidade opcional de PUT pré-assinado existe no adaptador e representa bearer reutilizável até expirar; não é exposta por padrão. Multipart/abort disponível no adaptador; coordenação durável/reinício/limpeza de multipart ainda precisa UI/jobs. ETag não é SHA256. Somente o hash de aplicação representa integridade final.

## Provisionamento pelo proprietário

Use scripts/r2-config.mjs plan/verify para gerar plano e verificar buckets sem criar/pagar recursos. Tokens S3 devem limitar operações aos buckets/prefixos necessários. Configure CORS para WEB_ORIGIN e origens Tauri explicitamente autorizadas: GET/HEAD/PUT e Content-Type, Content-Length, Range; exponha ETag, Content-Range, Accept-Ranges, X-Content-SHA256. Sem wildcard de credenciais. CORS não é autorização.

Lifecycle da quarentena/abandoned multipart só após reconciliar reservas e referências. Não aplicar expiração ao prefixo published. Domínio público/CDN só para PUBLIC. Backups privados com conta/camada independente e retenção testada; exclusão lógica/órfãos/restauração de objetos ainda incompletos. Nenhum comportamento de versionamento nativo S3 é pressuposto: domínio usa chaves imutáveis.
