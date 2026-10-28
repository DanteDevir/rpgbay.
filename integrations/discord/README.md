# Discord Social SDK — bloqueio de integração nativa

O binário proprietário e seus headers não foram fornecidos. Não existe ponte de voz operacional nesta entrega. O diagnóstico é executável (`node integrations/discord/diagnostic.mjs`), falha fechado e nunca retorna voz disponível. Não há self-bot, token pessoal, iframe, captura ou redistribuição de binários.

Obtenha o SDK diretamente pelo Developer Portal oficial, aceite seus termos e registre a versão exata antes de implementar a ABI. Não há URL pública estável de download verificada; por isso não foi inventado um instalador. Configure `DISCORD_SOCIAL_SDK_DIR` e crie nessa pasta um `rpgbay-sdk-install.json` com `{ "version": "versão real", "files": ["caminho relativo do header", "caminho relativo da biblioteca"] }`. Isso apenas inspeciona a instalação, não habilita voz.

Interfaces a implementar e testar: inicialização/destruição e event loop nativos, account linking oficial com scopes mínimos, Rich Presence, friends, invites, lobby por mesa, join/leave, mute/deafen, dispositivos, volume por membro, reconexão, revogação. Tokens devem residir no armazenamento protegido do SO. Não transmitir áudio por R2. Abrir o Discord externamente não completa este requisito.

Fonte oficial consultada em 2026-10-28: https://discord.com/developers/docs/discord-social-sdk/overview (HTTP 200, aplicação cliente sem conteúdo documental utilizável pelo curl). A matriz vigente de Windows/macOS/Linux/Android/iOS, licença, versão, limites de desenvolvimento e aprovação de comunicação em produção **não foi validada**. Estas verificações e testes com conta autorizada continuam bloqueios de lançamento. Web não anuncia suporte ao SDK nativo.
