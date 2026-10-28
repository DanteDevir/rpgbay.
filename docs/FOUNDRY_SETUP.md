# Foundry LETARGIA RPG BAY

Código do módulo em integrations/foundry; manifest module.json e documentação própria README.md. Copie a pasta para Data/modules/letargia-rpgbay e ative no mundo de teste autorizado. Não pede chave de licença nem senha administrativa. URL do servidor não é credencial.

O módulo exige confirmação pelo GM e usa mensagens com HMAC, validade, scoping/ator, origem e deduplicação; segredos da sessão ficam sessionStorage do GM. Foundry é autoridade de combate proposta. Hooks de atualização enviam eventos autorizados. Veja protocolo e testes offline-foundry.

**Relay /v1/foundry/pair/confirm e /v1/foundry/events não implementado no backend deste pacote.** Pareamento completo e sincronização ainda não funcionam de ponta a ponta. Foundry13 é alvo do manifest, sem versão verificada; nenhum sistema comercial anunciado como suportado integralmente. Não existe teste em instalação Foundry/licença/mundo real neste sandbox.

Não faça proxy genérico a URLs informadas pelo cliente. Acesso LAN é escolha local explícita; host/IP não devem ser requisitados pelo backend. Incorporação depende de CSP/cookies/TLS do host; abrir externamente é fallback sem burlar proteção.
