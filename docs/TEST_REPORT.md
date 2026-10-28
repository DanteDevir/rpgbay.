# Relatório de testes

Data:28/10/2026. Ambiente: Ubuntu26.04.1 cloud, Node24.21.0/npm11.19.0, TypeScript6.0.3, PostgreSQL17.11 em Docker29.1.3, Chromium compartilhado do Preview. Repositório originalmente sem commits; fontes identificados por SOURCE_MANIFEST.json no ZIP e inventário de hashes do registro de validação. Somente dados sintéticos/autorais locais.

## Resultados comprovados

- `npm run lint`: passou após corrigir imports/expressão do scanner e isolar vendor PDF.js gerado.
- `npm run typecheck`: passou.
- `RUN_EMULATOR_TESTS=true TEST_DATABASE_URL=<rpgbay_test> npm test`: **42 testes passaram,0falhas,0skips**. Banco separado; fixtures em schema descartável. Antes de habilitar emulador houve execução41pass/1skip; não confundir com resultado final.
- `npm run build`: passou. Reader separado por lazy import: entrada web277.95kB, reader440.39kB e worker1264.34kB, valores de saída de build (não medidas de desempenho de hardware).
- `npm audit --omit=dev --audit-level=high`:0vulnerabilidades reportadas no momento. Não é auditoria de imagens/OS/Rust.
- `node scripts/scan-secrets.mjs`: passou para o escopo limitado do scanner; não é garantia absoluta de ausência de segredos.
- Compose dev e produção `config --quiet` (produção com `--no-env-resolution` e senha sintética de configuração): passaram; isso valida composição, não deploy.
- Cargo Linux check bin+lib e build debug: passaram, conforme NATIVE_IMPLEMENTATION.md. Primeiras tentativas falharam por GLib ausente, pins Tauri incompatíveis e código de keyring/ícones; dependências/código foram reparados e comando final passou. Nenhum instalador assinado, teste gráfico/nativo, Windows/macOS/Android/iOS executado.
- Backup AES256GCM + pg_restore transacional em rpgbay_restore_test: passou; contagens fonte/destino e digest ordenado dos usuários iguais. Arquivo adulterado rejeitado (exit1 esperado) e banco permaneceu igual. Banco sintético, não backup de clientes.

## Riscos cobertos pela suíte

Família até5 sob convites concorrentes e remoção online;15mesas sob criação concorrente; ficha sem livro/dados/fórmulas sem eval; segredos/BOLA/RBAC; versões de mundo recuperáveis; beta fixado após update/close; gift uso único/pago/privacidade; pontos sem gasto duplo; print prova/aceite/endereço cifrado; dinheiro9%/maior resto/estorno/retenção/reserva; assinatura Stripe/JWT RS256/JWKS/nonce/CSRF/revogação local; ledger imutável; quotas/limites/magic/hash antes de escrita em R2; download privado; manifesto/offline AES/resume/hash; protocolo Foundry autenticado/dedup; merge concorrente de anotações.

Emulador emulate0.0.1 testou Stripe PaymentIntent e S3 por HTTP. Checkout inline price_data e amount_received não suportados pelo emulador: fluxo comercial completo permanece não comprovado. Nenhum sandbox externo/live do proprietário foi chamado.

## QA visual e acessibilidade

Chromium via coderabbit-agent-browser no Preview: desktop1440×1080, mobile390×844. Leitor renderizou PDF autoral3p; pesquisafarol retornou páginas1/2; notas, bookmark e posição2 persistiram após fechar/reabrir. Criar mesa sem livro persistiu no PostgreSQL e abriu sessão; ficha/dado e mundos foram inspecionados conforme registro final.

Primeira auditoria axe encontrou3regras (contraste, navegações sem nome, banner fora de landmark). Correções de contraste/landmarks aplicadas. Auditoria final axe4.12.1: **0violações** em desktop e mobile,1grupo incomplete de contraste em imagens/gradientes para revisão humana; sessão também0violações. Mobile390×844 sem overflow horizontal. Mesa, rolagem d20, criação de ficha e criação de página de mundo foram confirmadas na UI e no banco. Gradientes/arte exigem inspeção humana; axe sem violações não certifica acessibilidade total. Captura real de tela/negação/permissões e transporte multiusuário não foram validados de ponta a ponta.

## Pacote

Script determinístico com raiz única rpg-bay/, manifesto SHA256 e exclusão de node_modules/target/dist/segredos. ZIP extraído em diretório vazio /tmp/rpgbay-clean-verification: `npm ci` e `npm run build` passaram sem dependência de arquivo fora da entrega. Manifesto/CRC e raiz única passaram. Regeneração do ZIP final e comparação determinística documentadas no registro de validação.

## Não executado / incompleto

NAJA ID real, MFA/logout federado/nativo; Pix/cartão em conta sandbox externa; payouts/refunds/disputas operacionais e BAY PASS recorrente; R2 verdadeiro/backup objetos/órfãos; PDF editorial grande/OCR/offline nativo após reinício; SDK Discord; mundo/sistema Foundry real e relay; WebRTC multiusuário; som licenciado; perf/bateria/dispositivos; lojas/assinaturas/updater; envio email/frete/fornecedor reais e validação jurídica. Muitos itens precisam de código além de credenciais: PRODUCTION_READINESS.md e REQUIREMENTS_MATRIX.md são explícitos.

## Scanner real adicional

Instalação de ClamAV1.5.4/qpdf12.3.2/ImageMagick7.1.2-18 e freshclam oficial passou. Assinaturas daily28167/main63/bytecode339 verificadas. Worker HTTP: health200; PDF autoral200clean:true; PNG declarado PDF422clean:false; EICAR422clean:false. clamscan independente identificou EICAR(exit1esperado). Encontrados e corrigidos: limite768MiB insuficiente para base oficial (ClamAV agora2GiB, demais ferramentas768MiB) e probe /dev/null rejeitada (agora arquivo regular privado com cleanup). Nenhuma assinatura falsa usada. Essa validação é local, não R2/sandbox externo.
