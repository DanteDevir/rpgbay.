# Revisão de segurança do backend — 2026-10-28

## Contrato verificado

Base: especificação original em `docs/SPECIFICATION.md`, itens 6, 9–11, 17, 19–23 e critérios de aceite. Não houve relaxamento do contrato. Autorização acontece no servidor; família não concede segredos de mesa; versão concorrente não pode sobrescrever silenciosamente; quota inclui reservas concorrentes; prova real deve preceder fabricação; retorno de checkout não confirma pagamento.

## Correções materiais desta passagem

- Respostas da API agora usam `Cache-Control: private, no-store`, inclusive dados de sessão/endereço e erros; reduz armazenamento indevido por caches compartilhados. Verificação por API inject.
- Upload declarado acima do limite da categoria retorna HTTP 413 antes de reservar quota/assinar URL. Antes, erro genérico resultava em HTTP 500. Pós-upload permanece obrigatório: declaração não é evidência de arquivo seguro.
- Auditoria encaminhou ao responsável de pagamentos duas verificações adicionais: rejeitar valor Asaas com fração de centavo; vincular confirmação ao identificador canônico do pagamento além de orderId/valor. Ver resultados e testes dos provedores; esta nota não substitui sua evidência de implementação.

## Testes adicionais

`tests/security.test.ts` cria schema PostgreSQL isolado e remove no encerramento. Recusa qualquer TEST_DATABASE_URL sem banco `_test`.

- Identidade de desenvolvimento ignorada em modo production mesmo com flag true.
- Cookies consultam sessão real no PostgreSQL: leitura autenticada, mutação com Origin exata; sem Origin, origem externa e sufixo malicioso recebem 403.
- Sessão revogada ou expirada recebe 401.
- Quatro reservas simultâneas de 60 bytes contra quota de 100 permitem uma reserva e recusam três; somatório persistido é 60.
- Upload comum PDF recusado; tamanho excessivo HTTP 413.
- Discovery OIDC é fixture somente no teste; assinatura OIDC real contra provedor externo não é reivindicada. Presign R2 ocorre localmente com credenciais sintéticas; não houve upload real ou chamada R2. Testes de MIME real, tamanho pós-upload, checksum e scanner pertencem aos testes de provedores.

## Fichas e exposição

`fields` contém dados explicitamente públicos da ficha; `secret_fields` contém os dados privados. Lista de fichas retorna secretFields somente ao proprietário da ficha ou mestre/comestre. Apresentação retorna exclusivamente id/nome/fields; segredo não é enviado e ocultado por CSS. O contrato exige escolher corretamente a classificação do campo no editor; servidor não tenta inferir segredo a partir do texto. Testes PostgreSQL confirmam que outro jogador e apresentação não recebem o conteúdo secreto, e que jogador não edita ficha alheia.

Mundos filtram páginas por visibilidade antes da resposta e export; editores autorizados têm acesso editorial ao mundo. Anotações pertencem ao usuário, com versão otimista/histórico. Dedicatória pertence ao exemplar do destinatário; não aparece na biblioteca agregada. Endereço do destinatário é cifrado e negado ao remetente; acesso operacional é auditado.

## Limites restantes

Esta passagem não certifica segurança de lançamento. Permanecem testes externos OIDC/MFA/reautenticação, R2/antimalware em infraestrutura real, sandbox comercial dos gateways, ciclo de reembolso/disputa/saque, recuperação/rotação de chaves e auditoria dos clientes nativos. A matriz de requisitos e readiness registra escopo ainda incompleto. Nenhum teste local comprova configuração live ou aprovação comercial.
