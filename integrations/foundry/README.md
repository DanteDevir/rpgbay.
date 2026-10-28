# Módulo LETARGIA RPG BAY

Copie esta pasta para `Data/modules/letargia-rpgbay`, reinicie Foundry e ative o módulo no mundo. Alvo de implementação: API Foundry 13. Nenhuma versão foi executada num servidor Foundry real; `verified` não é anunciado no manifesto. O código não redistribui Foundry, seus sistemas, livros ou licenças.

O mestre ativo configura uma origem HTTPS da API e executa no console do mundo:

```js
await game.modules
  .get("letargia-rpgbay")
  .api.confirmPairing(
    "CODIGO-TEMPORARIO",
    ["ID-ATOR"],
    ["system.attributes.hp.value"],
  );
```

Uma confirmação explícita explica as permissões. Apenas atores selecionados e caminhos numéricos selecionados podem receber mudanças. O adaptador genérico exporta nome/retrato/tipo; **nenhum sistema tem suporte de regras completo validado**. Os caminhos específicos devem ser selecionados pelo mestre de acordo com o sistema instalado. Segredos, mensagens privadas, rolagens cegas e combatentes ocultos não são exportados. Foundry é autoridade do combate; não aceita comandos remotos para turno/iniciativa. Mudanças recebidas têm ID de origem e não geram loop de hooks.

Revogar: `await game.modules.get('letargia-rpgbay').api.revoke()`. Tokens/segredo ficam somente no `sessionStorage` do navegador do mestre, nunca em configurações mundiais distribuídas aos jogadores. Fechar o navegador exige novo pareamento. Módulos executados na mesma origem do Foundry têm o mesmo nível de confiança do navegador e podem acessar esse armazenamento.

## Contrato do relay (API necessária)

- RPG BAY autenticado cria código criptograficamente aleatório de uso único, validade máxima proposta de 5 minutos, associado a mesa, mestre RPG BAY e origem Foundry declarada. Não pedir chave Foundry ou senha administrativa.
- `POST /v1/foundry/pair/confirm`: `{code,worldId,actorIds,writablePaths,scopes}`; consome código uma única vez e retorna `{id,token,secret,expiresAt,tableId}`. `secret` são 32 bytes hex aleatórios por pareamento, não chave global. Backend deve validar origem allowlisted, código, propriedade da mesa e todas as limitações do grant. O conhecimento do código é a credencial inicial; a confirmação ocorre na UI do mestre do mundo.
- `GET /v1/foundry/events?pairingId=...&cursor=...`: bearer por pareamento, retorna `{events,cursor}`, no máximo 100 eventos. `POST /v1/foundry/events`: `{pairingId,event}`. `DELETE /v1/foundry/pair/:id`: revoga grant e invalida token. Escopos, ator, usuário e validade exigidos também no servidor; o launcher nunca recebe segredo de outros pareamentos.
- Evento: `{id,origin,at,payload,mac}`. MAC HMAC-SHA256 sobre UTF-8 `id + '\n' + origin + '\n' + at + '\n' + payload`. `payload` é JSON serializado, validado após MAC. Origem recebida `rpgbay:<tableId>`; enviada `foundry:<worldId>`. Janela de 60s, deduplicação em memória com TTL 120s e limite 10 mil. Relay deve persistir deduplicação/cursor e eventos duráveis; reiniciar este módulo não remove obrigação de deduplicação do servidor.
- Mensagens recebidas: `{type:'actor.update',actorId,changes:[{path,value}]}`. Apenas paths explicitamente autorizados e números finitos até ±1 milhão. Nenhum patch arbitrário.

**O relay completo não foi validado com este módulo.** Conferir implementação da API e seus contratos; sem esses endpoints, o pareamento falha explicitamente. Não chamar o módulo de integração ponta a ponta concluída.

Comunicação sai do navegador do mestre diretamente para a API HTTPS, sem SSRF do backend para uma URL Foundry. Servidor/IP/LAN são abertos deliberadamente pelo cliente. Embedding depende de CSP/cookies/TLS do host; esta entrega usa abertura externa e não contorna headers. Reconexão preserva cursor na sessão e não aplica snapshots antigos de combate sobre Foundry.

Fonte oficial consultada 2026-10-28: https://foundryvtt.com/api/v13/modules/hookEvents.html (HTTP 200). Smoke em Foundry licenciado, autorização de atores por jogador, reconexão entre múltiplos mestres e sistemas reais continuam requisitos de validação.
