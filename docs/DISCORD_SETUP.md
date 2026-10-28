# Discord

Diagnóstico: `node integrations/discord/diagnostic.mjs`. Discord é opcional para identidade do produto. Não armazenar token de usuário extraído, self-bot, iframe ou cliente não oficial.

**Ponte Social SDK real não implementada nesta entrega.** O SDK proprietário autorizado não está presente e não há bibliotecas redistribuídas. `DISCORD_SDK_DIR`/application ID são configuração futura do binário autorizado; diagnóstico de ausência não equivale a integração. Controles/lobbies/linking/Rich Presence/amigos/convites e liberação de comunicação precisam de implementação e testes reais. A matriz oficial de suporte deve ser reconfirmada na submissão; nenhum suporte web ou Linux é anunciado como validado.

Abrir Discord externo na interface é fallback identificado. Nenhuma chamada embutida, áudio, gravação ou captura de voz foi simulada. Captura getDisplayMedia na web é local; sinalização e transmissão WebRTC multiusuário ainda incompletas. Não usar R2 para áudio/tela em tempo real.

Fontes: https://docs.discord.com/developers/discord-social-sdk/overview e subpáginas communication-features/platform-compatibility. Páginas SPA não forneceram evidência suficiente para certificar versão/plataforma; reconfirmar no portal oficial com acesso autorizado.
