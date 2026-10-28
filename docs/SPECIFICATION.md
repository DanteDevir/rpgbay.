# PROMPT MESTRE — RPG BAY 1.0

Copie este documento inteiro para a IA de código. Ele é uma única instrução de execução. O entregável solicitado à IA é o projeto completo em ZIP; este documento é a especificação para produzi-lo.

---

Você é uma equipe de engenharia sênior responsável por implementar e entregar a RPG BAY 1.0. Atue como arquiteto, desenvolvedor full-stack e nativo, designer de produto, responsável por qualidade e infraestrutura. Trabalhe até entregar código executável, documentação e um ZIP compilável localmente. Se seu ambiente permitir agentes, pode dividir tarefas independentes, mantendo contratos, integração e revisão centralizados.

## 1. Objetivo e identidade

A RPG BAY é uma plataforma comercial de RPG de mesa da iniciativa LETARGIA RPG, dentro do ecossistema LibBay e NAJA. Domínio principal de produção: https://rpgbay.libbay.com. A autenticação é pelo NAJA ID, usando Zitadel, com issuer real configurável. Não presumir um endereço de issuer a partir do nome comercial.

Entregue site público e autenticado, launcher desktop e aplicativo mobile. O projeto tem base própria e customização própria: não construir um motor genérico para todas as lojas LibBay. Compartilhar componentes e regras entre os clientes da própria RPG BAY é desejável. Integração com serviços corporativos não implica acoplar catálogos de outras lojas.

O produto combina marketplace, biblioteca digital, leitura offline, famílias, mesas, fichas, comunidade, publicação editorial, presentes personalizados, livros físicos sob demanda e criação de mundos. O usuário deve conseguir jogar sem comprar livros. O livro comprado libera conteúdo editorial, leitura e consulta, conforme sua licença. Assinatura amplia benefícios, não substitui a compra dos livros.

Todo o escopo deste documento pertence à V1.0 solicitada. Organize em incrementos internos, mas não reclassifique funcionalidades como futuras sem autorização. Não entregue apenas telas, protótipo, plano, scaffold ou MVP incompleto. Se houver impedimento externo, entregue a implementação possível, exponha o bloqueio com precisão e não declare a funcionalidade ou o lançamento concluídos.

## 2. Regras de execução e honestidade

1. Primeiro inspecione o ambiente e produza plano, matriz de requisitos e decisões técnicas; depois implemente. Não encerre após o plano.
2. Consulte documentação oficial atual das dependências e provedores. Registre versões fixadas, fontes e data da validação. Não use endpoints inventados, SDKs obsoletos ou APIs não oficiais para simular integrações.
3. Resolva escolhas técnicas reversíveis autonomamente. Para decisões comerciais não quantificadas aqui, use políticas configuráveis com defaults expressamente identificados como propostas; não atribua essas decisões ao proprietário.
4. Não use dados fictícios ou adaptadores simulados no ambiente de produção. Fixtures e sandbox são permitidos apenas em desenvolvimento/testes, isolados e identificados.
5. Falta de credenciais não autoriza inventar sucesso. Implemente configuração, validação, adaptador real, testes disponíveis e diagnóstico de bloqueio. Indique testes externos que não foram executados.
6. Não peça segredos no chat. Use arquivos de ambiente, secret stores ou procedimentos locais documentados. Nunca inclua credenciais, dados reais de clientes ou tokens no ZIP.
7. Não faça cobranças reais, transferências, publicações públicas, mudanças de DNS ou deploy em contas externas sem autorização explícita para aquela ação. A entrega pedida é o código em ZIP e os meios de compilação/deploy pelo proprietário.
8. Funcionalidades obrigatórias bloqueadas por terceiros continuam pendências de lançamento; feature flags não equivalem a conclusão. Não invente uma aprovação Discord, uma conta comercial ou uma chave de assinatura.
9. Mantenha progresso persistido no repositório: decisões, requisitos, pendências e próximos passos. Continue de onde parou se houver limitação de contexto.
10. A expressão “produção” significa arquitetura e implementação verificadas, não autorização automática para afirmar que um serviço sem credenciais já está operando.

## 3. Direção visual e experiência

Interface premium, escura, com legibilidade alta, fundos grafite/azul profundo, acentos ciano/violeta configuráveis, cards de livros e ilustrações em destaque. Misturar estrutura clara de loja/launcher com páginas expressivas de sistemas, campanhas e perfis. As referências conceituais são uma loja escura com menu à esquerda, busca superior, biblioteca e downloads, e uma interface azul com arte destacada e painel social à direita.

Não depender de imagens anexas para compreender o layout, nem copiar marcas, personagens ou assets comerciais das referências. Usar assets próprios, licenciados ou placeholders explicitamente restritos ao desenvolvimento.

Desktop: menu lateral com início, loja, biblioteca, mesas, mundos, comunidade e downloads; busca global; conta; notificações; painel social recolhível. Dashboard editorial e administração aparecem conforme papel.

Mobile: navegação inferior, painéis adaptados, áreas de toque confortáveis e leitor próprio para tela pequena. Não reduzir simplesmente o desktop. Tablet com layouts próprios quando útil.

PT-BR como idioma inicial, BRL como moeda inicial, arquitetura preparada para internacionalização. Datas exibidas na zona escolhida pelo usuário; guardar instantes em UTC. Usar America/Sao_Paulo como default brasileiro. Acessibilidade com foco visível, teclado, rótulos, contraste adequado, tamanho ajustável, redução de movimento e ausência de autoplay audiovisual desnecessário.

## 4. Arquitetura sugerida e escolhas fundamentadas

Preferir monorepo com TypeScript estrito, React, site com renderização adequada a catálogo/SEO e launcher com Tauri 2 + frontend compatível com build estático. Next.js é candidato para o site, não exigir servidor Next embutido no launcher. Tauri/Rust para recursos nativos. Backend modular coeso em Node.js/TypeScript, PostgreSQL para estado transacional, Redis/fila apenas onde justificados, worker para tarefas pesadas e SQLite ou armazenamento local equivalente no aplicativo.

Fixar a stack escolhida após uma prova técnica de leitura de livro grande, cache offline, download interrompido, Zitadel e integração nativa Discord. Se uma mudança de stack for necessária, registrar evidências e preservar o escopo. Não criar microserviços desnecessários.

Organização possível: apps/web, apps/launcher, apps/api, apps/worker, packages/ui, packages/domain, packages/contracts, packages/storage, integrations/discord, integrations/foundry, infra, scripts, docs e tests. Adaptar se houver justificativa melhor.

Autorizações são verificadas no servidor, não apenas no frontend. Contratos de API e eventos são tipados e versionados; documentação OpenAPI ou equivalente. Dinheiro usa centavos inteiros ou decimal exato, nunca float binário. Banco com migrations, constraints, índices, transações e prevenção de condições de corrida.

## 5. Cloudflare R2 como armazenamento de objetos

Todos os arquivos persistentes do produto devem ter armazenamento canônico em Cloudflare R2: originais editoriais, versões de livros, pacotes offline, capas, avatares, imagens de personagens, mapas, templates, arquivos de mesas/mundos, homebrews, provas de impressão, artes finais e exports. Builds públicos e backups podem ter buckets próprios. Cache temporário e arquivos offline no dispositivo continuam locais.

IMPORTANTE: R2 é armazenamento de objetos, não banco relacional, filesystem POSIX ou servidor de chamadas. Contas, pedidos, saldos, direitos, fichas estruturadas, anotações, relações, índices, versões e metadados ficam no PostgreSQL. Áudio em tempo real passa pela infraestrutura de comunicação, não por uploads de trechos ao R2. Gravação de chamadas não faz parte do escopo e não deve ser ativada implicitamente.

Implementar:

- Separação de ambientes e classes de acesso por buckets/prefixos: public assets, private library, user content, publishing/print e backups. Não expor livros pagos nem uploads privados por bucket público.
- Cliente S3 compatível real com endpoint R2, region apropriada, credenciais somente no backend, permissões mínimas e configuração documentada.
- Chaves opacas sem PII, namespace por tenant e objeto, versões imutáveis por ID/hash. Título e nome original são metadados, não autoridade de acesso.
- URLs pré-assinadas curtas para operações específicas quando apropriado, ou gateway autenticado. Considerar URLs como bearer tokens reutilizáveis até expirar, nunca chamar de acesso de uso único sem mecanismo adicional.
- URLs S3 pré-assinadas usam o endpoint S3; não substituir seu hostname por domínio CDN. Para acesso privado via domínio próprio, implementar gateway/autorização compatível, sem cache público de respostas privadas.
- CORS restrito às origens necessárias, incluindo configuração explícita dos clientes nativos. CORS não substitui autorização.
- Fluxo upload intent → reserva de quota → upload em quarentena → validação real → publicação. Validar tamanho efetivo, extensão, MIME por conteúdo, dimensões, descompressão e checksum. Um Content-Type declarado não comprova segurança.
- Enforce de tamanho no caminho de upload e pós-upload; não presumir que URL pré-assinada sozinha impede envio maior. Apagar objetos inválidos e liberar reservas com segurança.
- Multipart para arquivos grandes quando suportado, retomada, checksum de aplicação, backoff, timeout, cancelamento e limpeza de uploads abandonados. Não tratar ETag multipart como SHA-256 do arquivo.
- Worker para thumbnails, otimização, extração de sumário/texto e pacotes; processamento isolado com limites de memória/CPU, arquivos maliciosos em quarentena e erros rastreáveis.
- Download retomável com HTTP Range e verificação final, manifesto de arquivos e hashes; escolha de componentes.
- Contabilidade de quotas e varredura de órfãos sem apagar objetos ainda referenciados por versões, pedidos ou presentes.
- Retenção, exclusão lógica, tarefas de exclusão física e restauração. Implementar versões no domínio/keys imutáveis; não presumir versionamento nativo compatível com S3 sem verificar R2 atual.
- Backups de banco consistentes e cifrados com teste real de restauração; políticas de backup de objetos e proteção contra exclusão acidental. Documentar dependência de falha caso backups estejam na mesma conta/provedor; não chamar bucket primário de backup.
- Logs sem query strings assinadas, segredos ou conteúdo privado. Métricas de falha, quota, latência e consumo.

Entregar configuração e scripts para provisionar/verificar buckets, CORS, lifecycle, domínio de assets e credenciais com menor privilégio. Recursos pagos exigem estimativa e ativação explícita pelo proprietário. Em desenvolvimento pode existir storage local/compatível S3, mas produção deve exigir R2 configurado.

## 6. Identidade, perfis e segurança de contas

NAJA ID/Zitadel via OIDC Authorization Code com PKCE. Clientes separados quando necessário para site, desktop e mobile. Usar navegador do sistema e redirects/deep links válidos nos nativos; nenhum client secret embarcado. Verificar issuer, audience, assinatura, expiração e state/nonce conforme fluxo. Cookies seguros no site; tokens nativos em armazenamento protegido do sistema; sessões revogáveis.

Perfis RPG BAY não devem sobrescrever identidade corporativa. Nome de exibição, bio, avatar, capa, tema, vitrines, personagens, preferências, privacidade, amigos, bloqueios e notificações. Exibir até três sistemas favoritos escolhidos pelo usuário, independentemente de possuir livros. Conta Discord é vínculo opcional, não login principal obrigatório para o resto do produto.

Permissões: comprador, membro de família, mestre/jogador, autor, equipe editorial com funções e administrador. Separar tenant editorial de usuário individual. MFA para operações privilegiadas conforme Zitadel; reautenticação para mudança de dados financeiros.

## 7. Catálogo e marketplace

Catálogo de livros, sistemas, aventuras, suplementos/DLCs, mapas, tokens, módulos VTT, pacotes, homebrews e produtos físicos/digitais combinados. Busca e filtros por idioma, editora, sistema, formato, faixa etária/conteúdo, jogadores, duração, licença, compatibilidade e versão.

Página do produto com capa, imagens, prévia autorizada, descrição, editora clicável, versões, changelog, formatos, tamanho, requisitos, dependências, compartilhamento, atualização, conteúdo incluído, entrega e preço discriminado. Wishlist, carrinho, cupons, presentes, descontos, bundles e completar coleção sem cobrar novamente o que a oferta considerar já adquirido.

Não vender produto sem arquivos/entrega válidos. Estado rascunho, revisão, publicado, suspenso e retirado. Retirada do catálogo não deve apagar compras anteriores automaticamente; definir comportamento com auditoria e motivo.

Permitir avaliações com origem de acesso identificada: compra verificada, biblioteca familiar ou playtest. Marcar versão avaliada, denúncia, moderação e resposta da editora. Evitar uma avaliação por membro familiar ser contabilizada como várias compras; regras anti-spam claras.

## 8. Biblioteca, leitura e direitos

Biblioteca centralizada por conta e sincronizada, com coleções, filtros, favoritos, comprados, gratuitos, compartilhados e betas diferenciados. O launcher disponibiliza livros offline no próprio leitor, não entrega por padrão PDF livre para exportação.

Implementar ingestão de livro editorial (PDF como formato inicial obrigatório) e leitor com sumário, busca, zoom, marcadores, anotações, posição e navegação de páginas. Busca depende de texto existente ou pipeline de OCR explicitamente habilitado; não inventar texto em PDF de imagem. Preservar referência à paginação original.

Conteúdo offline em pacote gerenciado/cifrado, manifesto assinado e proteção de chaves pelo sistema. Não prometer DRM inviolável ou impossibilidade de captura/cópia. Nenhuma chave mestra global no app. Licenças locais autenticadas com dispositivo/conta e política de renovação. Conteúdo necessariamente ocupa armazenamento, com painel de uso e remoção.

Compras próprias e acesso familiar têm políticas distintas e configuráveis de offline. Propor defaults documentados e justificar; não tratar perda momentânea de internet como perda imediata de compra. Acesso familiar deve ter autorização local com validade finita: saída da família revoga online imediatamente e offline ao reconectar/expirar, sem promessa de revogação instantânea de aparelho desconectado.

Sincronização de anotações, fichas e mundos deve preservar alterações concorrentes; conflitos detectáveis e recuperáveis, nunca sobrescrita silenciosa. Leitura funciona offline após preparo. Chamadas, pagamentos e salas em tempo real exigem conexão. Biblioteca mostra estado real de sincronização.

## 9. Famílias de até cinco pessoas

Até cinco integrantes no total, incluindo criador, podendo ser amigos. A biblioteca familiar é a união das compras dos integrantes elegíveis, sem transferência de propriedade. A regra comercial pretendida é compartilhamento do catálogo completo de livros; onboarding editorial deve obter a autorização correspondente. Não aceitar silenciosamente títulos incompatíveis com essa promessa.

Família é diferente de party. Integrar mesa não concede biblioteca; pertencer à família não concede segredos das campanhas. A assinatura, pontos, dedicatórias privadas, endereço e compras físicas não devem ser compartilhados automaticamente.

Convites com aceite, permissões, saída, remoção, exclusão do grupo, compras duplicadas, estornos e remoção de licenças cobertos. Propor política configurável contra troca abusiva de membros sem inventar prazo aprovado. Pessoa participa de uma família por vez como default proposto. Testar limite sob convites concorrentes. Saída não apaga dados autorais nem compras próprias.

## 10. Mesas e fichas independentes da compra de livros

Até quinze mesas ativas mantidas por conta como default de interpretação. Distinguir mesas criadas de mesas onde participa, arquivadas, salas simultâneas e participantes por chamada. Registrar os limites não especificados como configuração/proposta, não impor que só cinco membros familiares possam jogar.

PC e mobile acessam as mesmas mesas. Convites, mestre, comestre, jogador e observador; personagens, notas, anexos, calendário simples, mural, sessões, dados, recursos, turnos, condições e permissões de segredos.

Editor de fichas altamente customizável: campos de texto/número/lista, atributos, perícias, barras, recursos, abas, inventário, imagens, campos calculados e botões de rolagem. Fórmulas em linguagem limitada e validada, sem eval de JavaScript arbitrário. Templates versionados, duplicáveis, exportáveis e compartilháveis com controle de autoria.

Usuários podem montar mesa e ficha para um sistema sem comprar livro e mesmo sem o livro licenciado na loja. Não distribuir texto, arte, compêndios ou marcas indevidamente sob pretexto de ficha. Pacotes de regras e automações precisam de origem e licença identificadas; conteúdo aberto não significa que o livro inteiro ou seus logos sejam abertos. Dados inseridos privadamente pelo usuário não autorizam republicação automática.

Compra dá leitura/consulta editorial autorizada, não requisito para rolar dados. Integração de sistemas por adaptadores específicos; não fingir que uma ficha genérica implementa completamente todos os RPGs.

## 11. Mesa visual, templates e apresentação

Área visual personalizável de sessão com retratos, jogador/personagem, indicação de fala, vida/recursos autorizados, condições, iniciativa, rolagens, fundo/cenário, imagem apresentada e painéis redimensionáveis. Templates comunitários instaláveis e vinculáveis à mesa, com compatibilidade/versionamento, autoria e permissões.

Editor visual de composição usando schema declarativo validado, componentes permitidos e assets; não executar código remoto de templates. Oferecer layouts responsivos para desktop, tablet e mobile.

Separar modo privado de modo apresentação/OBS, com saída limpa de segredos, dedicatórias privadas e controles administrativos. Permissões do servidor filtram dados antes da entrega; esconder com CSS não basta. Não prometer transmissão direta para serviços de live nem incluir gravação sem escopo próprio.

Compartilhamento de tela é requisito distinto de voz Discord. Implementar caminho real suportado (por exemplo WebRTC com infraestrutura apropriada), documentando limitações por SO, consentimento, áudio de sistema e permissões mobile. Não retransmitir tela por R2 nem assumir que o Social SDK disponibiliza Go Live. Só iniciar captura por ação do usuário, com indicação persistente e botão de parar.

## 12. Discord como infraestrutura inicial de voz

Usar Discord Social SDK oficial, não self-bot, token de usuário extraído, cliente Discord embutido por engenharia reversa ou iframe do site Discord.

Vínculo opcional da conta por autorização oficial; sala da mesa mapeada a lobby; controles próprios RPG BAY para entrar/sair, mute/deafen, dispositivos, volume individual, estado de conexão e participantes. SDK fornece dados/áudio; UI é nossa. Não presumir acesso a qualquer ligação pessoal ou canal de voz preexistente. Implementar convites e interoperabilidade somente onde documentados.

Verificar requisitos atuais de comunicação em produção. Na documentação consultada durante a definição do projeto, há limites de desenvolvimento e solicitação de liberação para escala, exigindo account linking, Rich Presence, convites/entrada e lista de amigos. Construir os requisitos oficiais atuais e documentar submissão, sem presumir aprovação da RPG BAY.

SDK nativo exige ponte com Tauri/Rust/C++ e bibliotecas por plataforma. Validar distribuição e licenças: não incluir binários proprietários no ZIP sem permissão; fornecer script de obtenção/configuração oficial e mensagens de diagnóstico. Não fingir bindings apenas com funções vazias. Implementar integração real contra versão especificada, com falha explícita quando SDK autorizado não estiver instalado.

Confirmar Windows, macOS, Android, iOS e Linux com a matriz vigente, destacando suporte experimental. O site não deve prometer voz via SDK nativo sem suporte web oficial. Se o requisito de paridade web exigir outro transporte, documentar e implementar a alternativa aprovada tecnicamente, preservando o launcher como experiência principal.

Fallback explícito pode abrir a sala/link no aplicativo Discord, mas isso não conta como chamada embutida concluída. Não vincular a voz básica à BAY PASS. Organizar transporte por interface para permitir substituição futura, sem desenvolver framework universal.

Não usar processamento de voz para disparar conquistas financeiras, gravar conversas ou coletar conteúdo sem escopo e consentimento.

## 13. Foundry VTT e módulo LETARGIA RPG BAY

Entregar código completo de módulo Foundry com manifest, pacote e instruções, além da integração no launcher. Mestre informa URL/domínio/IP acessível do servidor, instala/ativa módulo, pareia por código temporário e associa mesa, mundo e usuários/personagens com autorização.

Não tratar conta do site foundryvtt.com como login universal dos mundos. Não coletar chave de licença Foundry ou senha administrativa para fingir OAuth inexistente. Usuário do mundo e proprietário da licença são conceitos distintos. Endereço do servidor não é segredo de autenticação.

Definir protocolo autenticado, validade, escopos, revogação, confirmação pelo mestre, prevenção de replay e validação de origem. Autorizar leitura/escrita por personagem e papel, impedindo jogador de editar outros atores ou ler dados secretos. Eventos com IDs, origem e deduplicação evitam loops de sincronização.

Integrar retratos, personagens, recursos, turnos, condições e rolagens por adaptadores de sistemas realmente suportados. Declarar versões Foundry testadas e matriz de sistemas; nunca anunciar suporte completo a um sistema sem teste. Em mesa conectada, definir Foundry como autoridade de combate por default, com política explícita de reconexão/conflito.

Disponibilizar painel Foundry reduzido onde incorporação real funcionar, sujeito a CSP, cookies, TLS e capacidade do dispositivo; oferecer abrir externamente quando bloqueado sem contornar proteção do host. Não usar proxy genérico irrestrito. SSRF, mixed content e hosts privados precisam de tratamento; acesso à LAN deve ser deliberado no cliente, não expor a rede interna do backend.

Ligação não hospeda automaticamente servidor Foundry, não concede licença e não equivale a quinze servidores simultâneos.

## 14. Trilhas sonoras

Playlists por mesa, volume individual, faixas próprias/licenciadas e comandos sincronizados com tolerância a latência. Metadados e listas no banco, arquivos autorizados no R2. Não retransmitir áudio de serviços comerciais por conta própria.

Links e integrações Spotify/YouTube devem respeitar documentação e políticas atuais. Spotify não é fonte garantida para broadcasting da party, mixagem ou trilha sincronizada com visuais; não implementar uso proibido para preencher o requisito. Conexão de conta só quando houver uso efetivamente permitido e necessário, com revogação.

YouTube: player oficial visível, controles e condições exigidas; sem extração de áudio, download ou player invisível. Login Google não é necessário só para abrir um vídeo público; usar OAuth apenas para funções que o exijam. Não prometer sincronização perfeita entre players com anúncios/restrições.

Biblioteca própria/licenciada é o caminho-base para áudio coletivo. Diferenciar licença para sessão privada de licença para transmissão pública.

## 15. Comunidade e perfis comerciais

Amigos, bloqueios, presença opcional, notícias, fórum por sistema/produto/editora, discussões, busca por mesas e homebrews. Ferramentas de denúncia, revisão, remoção com motivo, anti-spam, rate limits e apelação/contato. Moderação é uma operação com dashboard, não apenas botão de denunciar.

Editora tem perfil comercial editável com descrição, capa, avatar, links, catálogo, equipe pública opcional, avaliações relacionadas e grupo/canal de notícias próprio com seguidores. Preferências de notificações e opção de deixar de seguir. Não adicionar comprador automaticamente a mensagens de marketing sem opção apropriada.

Homebrews têm autor, descrição, sistema, licença, versão, dependências, arquivos, avaliações e atualização controlada. Conteúdo publicado passa por validação; privado não vira público por padrão. Capacidade de denunciar apropriação e conteúdo indevido.

## 16. Produtores, editoras e dashboards

Cadastro como produtor/editora com dados comerciais, verificação de responsável/recebedor e onboarding nos provedores de pagamento adequados. Aceitar os tipos de pessoa/empresa efetivamente suportados pela operação; não anunciar habilitação financeira antes da aprovação.

Equipes com proprietário, administrador, editor, financeiro e suporte, permissões mínimas e isolamento entre editoras. Dashboard com catálogo, arquivos, variantes, preços, ofertas, betas, changelog, moderação editorial, notícias, presentes, pedidos físicos e suporte.

Métricas: vendas brutas/líquidas, unidades, comissão, tarifas, reembolsos, conversão, receita por produto/período e downloads agregados quando apropriado. Definir cada métrica e sua origem; não mostrar números inventados nem expor dados individuais de leitura a terceiros. Acesso familiar não conta como compra adicional.

Financeiro: extrato por evento/pedido, valores pendentes, retidos, disponíveis, reservados, pagos e estornados; previsão de liberação; conta de destino verificada; solicitação e acompanhamento de repasse; exportação CSV. Separar visualização do saldo e poder de movimentá-lo.

## 17. Comissão, pagamentos e saques

Comissão total de 9% para RPG BAY/NAJA em conjunto, não 9% para cada. A distribuição interna é configuração administrativa com auditoria, não desconto adicional oculto.

Base de cálculo e responsabilidade por tarifas ainda precisam ser formalizadas pelo proprietário. Implementar política versionada configurável, com default proposto: 9% sobre valor efetivamente pago pelos itens após desconto; frete excluído; processamento e produção discriminados separadamente; líquido da editora calculado sem ambiguidades. Registrar como proposta, não acordo definitivo. Cada pedido guarda snapshot da política, não recalcula vendas antigas após alteração.

Integrar Asaas para Brasil/Pix e Stripe com produto apropriado para marketplace/contas conectadas, quando aprovado/suportado. Definir roteamento por método, país e conta; um pagamento tem processador responsável. Não mover silenciosamente pagamento já iniciado a outro gateway, duplicar cobranças ou usar uma conta comum como substituto informal de solução de marketplace.

Asaas split percentual usa netValue conforme documentação atual: reconciliar com comissão comercial que pode usar base distinta, usando cálculo/valor fixo suportado quando cabível, sem distorcer 9%. Modelar pedidos com várias editoras, distribuição de descontos, frete, impressão, arredondamento determinístico e devoluções parciais.

Regra de retenção: sete dias, sem prometer liquidação impossível. Default proposto: saldo elegível depois do prazo de sete dias e depois da disponibilização efetiva pelo provedor, respeitando KYC/reservas/disputas. Registrar marco inicial e dias corridos/úteis explicitamente. Se exigido D+7 após a venda para qualquer método, marcar dependência de antecipação/capital e suas condições; não programar saque sem saldo.

Implementar ledger auditável, lançamentos imutáveis, ajustes compensatórios e referência externa. Separar ledger operacional de contabilidade fiscal. Webhooks com assinatura ou mecanismo oficial de autenticação, validação de status no provedor quando necessário, idempotência, deduplicação, proteção contra replay, estados fora de ordem, retries e conciliação agendada. Uma volta do browser ao checkout nunca comprova pagamento.

Pedidos e pagamentos com estados completos; Pix QR/copia-e-cola/expiração; cartões via checkout/componentes oficiais sem armazenar PAN/CVV; assinaturas recorrentes por meios suportados; cupons; recibos; cancelamentos; estornos parciais/totais; chargebacks e reservas. Webhooks internos e jobs com entrega repetida não podem duplicar licença, pontos ou transferência.

Destinos de saque devem ser verificados; mudança com reautenticação e trilha de auditoria. Solicitação, envio ao provedor e liquidação são estados diferentes. Documentar quem é vendedor responsável, emissão fiscal e responsabilidades; não inventar emissão de nota automática ou regime fiscal. Configurações comerciais/fiscais que dependem de confirmação impedem go-live financeiro, mas não impedem implementação.

## 18. BAY Points, BAY PASS e conquistas

Compras geram BAY Points conforme política versionada configurável; não inventar proporção como se aprovada. Usar catálogo de cosméticos para resgate, histórico e prevenção de gasto duplo. Estorno precisa tratar pontos concedidos e já gastos com política explícita, sem destruir dados autorais.

BAY PASS libera catálogo de personalizações incluídas, maior capacidade de uploads e benefícios definidos em configuração. Não concede automaticamente todos os livros. Conteúdo de terceiros só entra no passe mediante permissão/remuneração, não chamar todo template comunitário pago de incluso.

Default proposto: cosméticos resgatados com pontos permanecem; cosméticos apenas acessados pela assinatura dependem dela. Cancelar não apaga fichas, mundos e arquivos; excesso de quota suspende novos uploads até ajuste, sem remoção silenciosa. Definir apresentação visual degradada preservando configuração para retorno.

Conquistas: primeiro 20 natural em d20 registrado, primeiro livro comprado confirmado, primeira mesa, primeiro presente resgatado e participação em beta conforme critério. Eventos com origem verificável e idempotência. Rolagens externas indicam origem; separar conquista estética de recompensa econômica e proteger contra farming. Perfil pode controlar visibilidade.

## 19. Uploads e quotas

Interpretar limite gratuito citado como 2 MB por arquivo de upload comum; declarar valor em bytes na política e UI. Não aplicar esse limite a livros originais enviados por editoras: cada categoria tem limites próprios. Cota total, quantidade e benefícios BAY PASS ainda não foram quantificados; implementar tabela configurável e marcar defaults de desenvolvimento como propostas.

Separar avatar, imagem de personagem, mapa, áudio, template e arquivo editorial. Otimizar imagens com prévia e informar alterações; não rejeitar formatos silenciosamente. Quotas conferidas no servidor antes e após processamento, incluindo concorrência e variantes geradas conforme regra declarada.

## 20. Betas e playtests editoriais

Editoras podem escolher publicação em desenvolvimento com acesso aberto, inscrição aprovada ou convite. Página com estágio, objetivos, responsáveis, versões, changelog, condições e destino do acesso após encerramento.

Participantes criam mesas vinculadas ao teste; registrar versão usada, feedback por capítulo/página/versão, formulários e relatórios. Mesa pode fixar versão até migrar. Atualização não deve quebrar sessão nem apagar feedback anterior. Editor publica; participantes não editam a obra original automaticamente.

Informar se beta permanece, expira ou oferece benefício na edição comercial. Não converter participação em promessa de livro gratuito. Créditos/distintivos configuráveis e opt-in de divulgação do nome. Métricas agregadas de teste com privacidade.

## 21. Presentes e personalização digital/física

Compras de presente podem ser digitais, físicas ou combo. Destinatário existente ou link de resgate com segredo forte/expiração configurada, sem revelar conta por busca de email. Resgate atômico, prevenção de duplo uso, tratamento de destinatário que já possui produto e presente não resgatado. Notificações apenas relacionadas ao pedido.

Livro digital pode receber capa adicional, mensagem e página de dedicatória associadas ao exemplar pessoal. Capa oficial permanece disponível; não alterar paginação original. Destinatário controla exibição; dedicatória privada não se propaga para família ou stream. Obra, versão, entitlement e exemplar personalizado são entidades diferentes.

Editoras escolhem modalidades autorizadas: padrão, dedicatória, capas predefinidas, arte enviada pelo comprador ou criação artística encomendada. LETARGIA permitirá personalização física por preço extra. Respeitar direitos de arte e limites editoriais, com processo de revisão real.

Físico sob demanda: variantes de formato/acabamento, capa dura quando ofertada, preço, custo de produção, dimensões, papel e paginação; frente/lombada/contracapa com sangria e áreas reservadas conforme gráfica. Não inventar medida de lombada independente de papel/páginas.

Preview comercial não substitui prova de impressão. Produzir arte final/prova e registrar aprovação do comprador antes de fabricação personalizada. Arte original encomendada tem preço, briefing, revisões e prazo próprios; código não cria artista ou fornecedor fictício.

Implementar pedidos de produção e painel operacional, aprovações, arquivos no R2, frete, endereço, prazo, rastreamento, avaria/extravio e cancelamento conforme política aplicável. Na ausência de API de gráfica/transporte contratada, fluxo manual completo e auditável é válido, com status reais e upload de comprovantes, nunca envio simulado. Separar produção concluída de pedido entregue.

Permitir que destinatário forneça endereço em link privado; remetente vê apenas o necessário. Definir no produto se físico inclui digital. Personalização física e mão de obra não são gratuitas por BAY PASS.

## 22. Criador de mundos

Mundos independentes de campanhas e reutilizáveis entre mesas. Editor de personagens, locais, facções, eventos, itens e artigos livres; links entre entidades, tags, busca, imagens, linha temporal básica, histórico e recuperação.

Privacidade por mundo/página/bloco quando implementada: privado, equipe, mesa e público. Segredos do mestre não chegam a clientes sem permissão. Colaboração, conflitos recuperáveis e associação a várias campanhas. Export de conteúdo autoral em formato aberto com assets autorizados, sem incluir livros licenciados de terceiros ou dados privados de outros membros.

O editor deve ser funcional e bem acabado. Mapas interativos avançados e recursos além dessa lista não são requisitos implícitos para finalizar V1.

## 23. Segurança, privacidade e operação

TLS, CSP e headers adequados; proteção contra XSS, CSRF conforme transporte, SQL injection, IDOR/BOLA, SSRF, path traversal, arquivos maliciosos e escalada entre tenants. Sanitizar rich text, SVG e assets de templates. URLs externas não devem poder acessar metadados de nuvem ou arquivos locais. Capabilities Tauri restritas, navegação remota sem acesso irrestrito a comandos nativos e validação de argumentos.

Rate limits, sessões e dispositivos, revogação, menor privilégio e auditoria de operações financeiras/editoriais. Secrets fora do repositório; varredura de segredos e dependências. Recuperação de contas pelo NAJA ID, sem backdoor local em produção.

Privacidade e proteção de dados com consentimentos quando aplicáveis, export, exclusão, retenções obrigatórias identificadas e acesso mínimo a endereço/financeiro. Termos comerciais e políticas em linguagem clara como minutas para validação jurídica, não certificado automático de conformidade. Identificação do fornecedor, custos totais, prazos, atendimento e cancelamento precisam existir no produto.

Observabilidade com request/job IDs, métricas, health/readiness, logs estruturados sem tokens/PII indevida e alertas. Backups e restauração testados; migração e rollback planejados; incidentes, indisponibilidade do R2/gateways/Discord e recuperação documentados. Rotação de chaves preserva meios de recuperar conteúdo cifrado necessário.

Email transacional por provedor SMTP/API configurável, com templates, retries e estados; não fingir envio sem provedor. Incluir instruções de SPF/DKIM/DMARC quando pertinentes sem inventar registros do domínio.

## 24. Desempenho e experiência offline

Carregar biblioteca local rapidamente e comunidade sob demanda. Listas virtualizadas/paginadas, imagens responsivas, lazy loading, busca indexada, evitar N+1 e trabalho pesado na thread de UI. Iniciar infraestrutura de call apenas ao usar comunicação. Limitar efeitos e animações; modo econômico e controle de cache.

Definir orçamento mensurável para hardware modesto, com dispositivos/perfis de referência documentados. Medir tempo de abertura, RAM, CPU em repouso, leitura de PDF grande, bateria e rede. Não inventar números medidos ou garantir consumo igual entre WebViews. Registrar metodologia e resultados reais, com metas separadas de resultados.

Atualizações de livros/módulos exibem compatibilidade e changelog, permitem fixar versão e não quebram campanha automaticamente. Atualização do launcher tem assinatura/verificação, canal estável e estratégia por plataforma; mobile respeita distribuição e regras da loja. Não executar atualizações de código fora de política de plataforma.

## 25. Infraestrutura e configuração de produção

Entregar Dockerfiles multi-stage e Compose para serviços de servidor, reverse proxy, migrations e workers, com volumes/segredos corretamente separados. Desenvolvimento e produção isolados. Documentar requisitos de VPS, capacidade, portas, DNS e TLS. Compose não compila iOS dentro de Linux.

Domínio principal rpgbay.libbay.com. API pode estar em /api para reduzir CORS; se subdomínios forem necessários, documentar como proposta. Não inventar domínio de backend/R2 já provisionado. Não exigir compra de serviços além do necessário sem explicar.

Fornecer .env.example completo por serviço e matriz: nome, finalidade, secreto/público, obrigatório, origem e validação. Incluir R2, PostgreSQL, filas, Zitadel issuer/client IDs/redirects, Discord application/SDK configuration, Stripe, Asaas, webhooks, email, URLs e chaves de assinatura. Configuração de produção inválida deve falhar com diagnóstico seguro, não cair para mock ou modo inseguro.

Scripts de setup, diagnóstico, migrations, seed de desenvolvimento separado, build, start, backup, restore e empacotamento, em shell e PowerShell onde aplicável. Primeiro administrador provisionado por procedimento seguro e identidade real; sem senha padrão.

CI com lint, types, testes, build e verificações de segurança essenciais. Fixar dependências/lockfiles e toolchains. Incluir licença do código a confirmar pelo proprietário e inventário de licenças de terceiros, sem afirmar propriedade sobre SDKs/assets externos.

## 26. Validação obrigatória e critérios de aceite

Criar matriz requisito → implementação → testes/evidência → status. Testar riscos e percursos reais, não só snapshots de UI. No mínimo:

1. Login OIDC, redirects, logout/revogação e permissões entre contas/editoras.
2. Publicar produto e versão com arquivos reais de teste autorizados no storage de teste.
3. Compra Pix/cartão em sandbox com confirmação por webhook, duplicação, reordenação e falha; licença e pontos concedidos uma vez.
4. Cálculo de 9%, tarifas, descontos, múltiplas editoras, arredondamento e estorno parcial, com testes determinísticos.
5. Retenção de sete dias, liquidação tardia, reserva, saque duplicado, insuficiência e conciliação sem movimentação real não autorizada.
6. Família de cinco sob concorrência, biblioteca agregada, saída, revogação online e expiração offline.
7. Livro grande, download interrompido/retomado, integridade, leitura offline após reinício, anotações e conflito.
8. Acesso indevido por URL/ID, objeto privado R2, quota concorrente, arquivo malicioso, MIME falso e upload maior que limite.
9. Criar mesa/ficha sem livro, abrir no PC/mobile, fórmulas e rolagens, quinze mesas conforme política, segredos não enviados.
10. Integração Discord nativa quando ambiente/SDK/acesso permitirem; reportar exatamente plataformas e testes não executados. Não declarar API integrada apenas por compilar interface.
11. Compartilhamento de tela real nas plataformas disponíveis, interrupção e permissões negadas; limites dos demais sistemas identificados.
12. Foundry com módulo real e mundo de teste; pareamento, permissões, reconexão, deduplicação e sistema suportado.
13. Template comunitário validado e modo apresentação sem vazamento de segredos.
14. Beta com versão fixada, atualização e feedback associado à versão correta.
15. Presente resgatado uma vez, dedicatória privada, capa oficial recuperável e fluxo físico com prova aprovada antes de produção.
16. BAY PASS ativado/cancelado, quota excedida sem apagar dados, cosmético de pontos preservado conforme política.
17. Mundo compartilhado entre mesas, permissão de segredos e export autorizado.
18. Backup e restore efetivo em banco/storage de teste, não só existência de script.
19. Acessibilidade básica e visual QA com capturas em desktop/mobile.
20. Build limpo a partir do ZIP extraído, comandos documentados, nenhuma dependência acidental de arquivo fora da entrega.

Testes externos precisam registrar ambiente, versão e evidência, sem dados sensíveis. Teste de sandbox não prova aprovação comercial nem valida conta live. Separar “implementado”, “compilado”, “testado localmente”, “testado em sandbox”, “bloqueado externamente” e “validado em produção”.

## 27. Conteúdo obrigatório do ZIP final

Entregar arquivo real chamado RPG_BAY_V1_Source.zip, com raiz única rpg-bay/, todos os fontes autorais, scripts, manifests, lockfiles, migrations, testes, assets redistribuíveis, infraestrutura e documentação. Excluir node_modules, target, caches, dumps sensíveis, credenciais, configurações pessoais e binários sem direito de redistribuição. Não excluir arquivos indispensáveis ao build.

Documentos mínimos:

- README.md: visão, estrutura, setup rápido e comandos testados.
- docs/ARCHITECTURE.md e decisões técnicas.
- docs/REQUIREMENTS_MATRIX.md: rastreabilidade completa deste prompt.
- docs/BUILD_WINDOWS.md, BUILD_LINUX.md, BUILD_MACOS.md, BUILD_ANDROID.md e BUILD_IOS.md.
- docs/DEPLOY_PRODUCTION.md: domínio, TLS, serviços, variáveis, migrations e operação.
- docs/R2_STORAGE.md: buckets, autorização, uploads, quotas, backup e restauração.
- docs/ZITADEL_SETUP.md, DISCORD_SETUP.md e FOUNDRY_SETUP.md.
- docs/PAYMENTS_AND_PAYOUTS.md: regras, onboarding, ledger, comissão, liquidação e exemplos.
- docs/COMMERCIAL_POLICIES.md: regras confirmadas versus defaults propostos a validar.
- docs/PRINT_AND_GIFTS.md: produção física manual/API e personalização.
- docs/SECURITY.md e RUNBOOK.md.
- docs/TEST_REPORT.md: comandos, resultados reais e lacunas.
- docs/PRODUCTION_READINESS.md: condição de cada integração e bloqueio concreto.
- docs/THIRD_PARTY_LICENSES.md e inventário de dependências.
- .env.example por serviço e scripts de diagnóstico/empacotamento.

Compilação posterior no PC do proprietário é requisito. Explicar toolchains, pré-requisitos e limites reais: Windows e Linux em ambientes suportados; macOS/iOS exigem ambiente Apple/Xcode e credenciais para assinatura/distribuição; Android exige SDK/NDK e assinatura de release. Não prometer gerar todos os binários a partir de qualquer SO com um único comando. Build sem assinatura de teste não é instalador público confiável.

Disponibilizar empacotamento reprodutível: manifest de arquivos e hashes, versões de toolchain, procedimento de verificação do ZIP, checksum SHA-256 do arquivo final e script que recrie o pacote. Pode usar timestamp fixo para reprodutibilidade quando possível, sem afirmar build binário bit-a-bit se não verificado.

Caso o ambiente não permita anexar um ZIP, ainda crie a árvore completa e o script de empacotamento executável; declare a limitação e a localização. Não substitua a implementação por milhares de linhas incompletas numa resposta. Em ambiente com anexos, fornecer o ZIP real é obrigatório.

## 28. Sequência de execução

A. Inspecionar ambiente; verificar docs oficiais, SDKs e restrições; produzir matriz inicial e decisões.
B. Executar provas de integração críticas e estabelecer contratos de dados/autorização.
C. Implementar infraestrutura, identidade, banco e R2.
D. Implementar percursos comerciais completos, biblioteca e famílias.
E. Implementar mesas/fichas, visual, Discord, tela e Foundry.
F. Implementar comunidade, editoras, betas, presentes/físicos, pontos/passe/conquistas e mundos.
G. Integrar, executar testes, corrigir falhas e revisar UX, segurança e operação.
H. Extrair pacote em diretório limpo, validar builds disponíveis, produzir relatórios e entregar ZIP.

Essa sequência é organização de trabalho, não autorização para parar antes do escopo completo. Não concentre esforço em uma home impressionante deixando pagamentos, leitor, permissões ou integrações como TODO.

## 29. Fontes iniciais para revalidação

As URLs abaixo são pontos de partida, não substituem consulta à documentação vigente e termos aplicáveis:

- Tauri: https://v2.tauri.app/
- Zitadel: https://zitadel.com/docs
- Cloudflare R2: https://developers.cloudflare.com/r2/
- URLs pré-assinadas R2: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Discord Social SDK: https://docs.discord.com/developers/discord-social-sdk/overview
- Discord comunicação: https://docs.discord.com/developers/discord-social-sdk/core-concepts/communication-features
- Discord plataformas: https://docs.discord.com/developers/discord-social-sdk/core-concepts/platform-compatibility
- Foundry: https://foundryvtt.com/api/ e https://foundryvtt.com/article/
- Stripe Connect: https://docs.stripe.com/connect
- Asaas: https://docs.asaas.com/
- Spotify: https://developer.spotify.com/policy
- YouTube: https://developers.google.com/youtube/terms/developer-policies
- Licenças Paizo, se houver conteúdo desse ecossistema: https://paizo.com/licenses

## 30. Resposta final exigida da IA

Ao terminar, entregar o ZIP e informar brevemente: o que foi implementado; stack e versões; como configurar e compilar; testes realmente executados; credenciais, aprovações e decisões comerciais ainda necessárias; bloqueios que impedem go-live; localização dos relatórios e checksum.

Se algo obrigatório estiver incompleto, dizer isso claramente e não apresentar o pacote como V1.0 integralmente concluída ou pronta para receber clientes. O alvo continua sendo implementação completa e operável, com configurações externas legítimas, sem simulações disfarçadas.

Comece agora a construir a RPG BAY conforme esta especificação e persista até a entrega verificável.
