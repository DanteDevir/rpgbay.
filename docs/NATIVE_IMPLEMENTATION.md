# Clientes nativos e offline — estado da entrega

## Build reproduzível pelo proprietário

Frontend React/Vite compartilhado em `apps/web`; Tauri 2 em `apps/launcher/src-tauri`, distribuição estática `../../web/dist`. Versões diretas fixadas em Cargo.toml/package.json; Cargo.lock gerado ao resolver dependências com Rust 1.99.1 instalado via rustup oficial. Ubuntu 26.04.1 e Node 24.21.0 inspecionados. Instale Rust estável e requisitos oficiais antes do build: https://v2.tauri.app/start/prerequisites/ . Configuração consultada em 2026-10-28: https://v2.tauri.app/reference/config/ . O sucesso HTTP das fontes não equivale a build das plataformas.

No Ubuntu 26.04, os pacotes usados para verificação nativa foram:

```sh
sudo apt-get update
sudo apt-get install -y --no-install-recommends libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev patchelf
```

Depois de instalar dependências do monorepo:

```sh
cd apps/launcher
npm ci
# Use a chave pública Ed25519 real, hex, sem chave privada no app.
export RPGBAY_MANIFEST_PUBLIC_KEY='<64 hex da chave pública>'
export RPGBAY_API_ORIGIN='https://rpgbay.libbay.com'
export VITE_API_ORIGIN='https://rpgbay.libbay.com'
npm run build -- --bundles deb,appimage # Linux, requer WebKitGTK e toolchain local
npm run build -- --bundles nsis         # Windows, executar no Windows com MSVC/WebView2
npm run build -- --bundles dmg          # macOS, executar no macOS com Xcode
npm run android:init
npm run android:build                   # Android SDK/NDK/JDK e assinatura do proprietário
npm run ios:init
npm run ios:build                       # macOS/Xcode; assinatura Apple do proprietário
```

Windows/macOS/Android/iOS exigem suas próprias máquinas/SDKs/assinatura. Linux: `cargo check --locked` (binário e biblioteca) e `cargo build --locked --bin rpgbay-launcher` passaram após instalar requisitos de sistema. Rust 1.99.1, Tauri 2.12.5, tauri-build 2.7.4 e CLI 2.12.4 estão fixados. O binário debug foi compilado localmente, mas não teve teste gráfico ou de autenticação. Windows/macOS/Android/iOS não foram compilados. cargo fmt passou. A falha inicial por GLib ausente e a incompatibilidade das versões antigas de Tauri foram reparadas. O wrapper mobile tem layout compartilhado responsivo, mas não substitui testes em aparelho.

## Contrato offline implementado

`packages/offline/index.ts` verifica Ed25519 sobre bytes exatos do manifesto, identidade de conta/dispositivo, expiração e arquivos; retoma ciphertext com Range, reinicia se servidor ignora Range, rejeita Content-Range incompatível, limita tamanho, verifica SHA-256 completo e só então publica arquivo final; AES-256-GCM autentica o conteúdo e seu vínculo licença/conta/dispositivo/componente. Não há segredo mestre embutido. Chave AES única por licença/entrega deve vir do servidor após autorização de direito vigente, não de um PDF aberto no frontend.

Envelope: `{payload:base64url(JSON),signature:base64url(Ed25519(payloadBytes))}`. Payload: `{version:1,licenseId,accountId,deviceId,bookId,source:'purchase'|'family',issuedAt,expiresAt,files:[{id,bytes,sha256,nonce,tag}]}`. Instantes UTC em milissegundos; bytes é tamanho de ciphertext sem tag, nonce 12 bytes hex, tag GCM 16 bytes hex. AAD UTF-8: `JSON.stringify([licenseId,accountId,deviceId,fileId])` (array JSON compacto, evita ambiguidades com dois-pontos em identificadores OIDC). SHA-256 do ciphertext. `files.id` opaco sem barras. Produtor deve gerar nonce aleatório único para cada componente/chave.

Comandos Tauri: `provision_book_key`, `download_component`, `read_component`. Trust root e origem API fixadas em compilação. Provisionamento por POST autenticado `/v1/offline/licenses/:id/key` com `{deviceId}` retorna `{key:'64hex'}` via TLS diretamente ao Rust, que salva no Keychain, Windows Credential Manager ou Secret Service. Downloads e leitura revalidam licença assinada. Pacotes ficam sob diretório local do aplicativo, conta/dispositivo e licença; não são salvos como PDF aberto. A leitura retorna componente em memória de até 32 MiB, exigindo ingestão de livros grandes em componentes e leitor nativo conectado a esse contrato. O runtime nativo executa rede/leitura em workers e serializa downloads com try-lock, retornando estado ocupado para evitar corrupção concorrente. Há timeout, falha segura e retomada por nova tentativa; backoff/cancelamento nativo/painel de uso e remoção ainda não estão conectados ao frontend.

O backend precisa implementar inscrição de dispositivo, emissão/renovação/revogação de licenças, empacotamento, rotação da chave pública e endpoint de chave com checagem de direito online. Os comandos não substituem estes serviços. O Node helper é testável, mas não é armazenamento seguro de navegador. SQLite/sync de anotações, leitor PDF offline conectado aos comandos nativos por componentes, proteção contra rollback do relógio e fluxo OIDC nativo com navegador do sistema/PKCE/deep link permanecem pendências explícitas. OIDC do site não deve ser anunciado como login nativo seguro concluído.

Mobile: acesso ao armazenamento de chave **falha fechado** com diagnóstico até implementação/teste de Keychain iOS e Keystore Android; não usa arquivo plaintext como fallback. Tokens OAuth nativos não estão persistidos. A proteção é local e limitada, sem promessa de DRM inviolável, captura impossível ou revogação instantânea offline.

Defaults comerciais propostos, ainda não aprovados: licença offline de compra 30 dias; familiar 72 horas; renovação em cada conexão, revogação online imediata e offline na expiração/reconexão. O servidor deve versionar políticas e informar condições ao usuário. Não bloquear permanentemente compras após uma interrupção momentânea.

## Foundry e Discord

Veja `integrations/foundry/README.md` e `integrations/discord/README.md`. Módulo Foundry possui hooks/protocolo autenticado/escopos/replay/dedup e confirmação GM, mas não foi executado em Foundry real; adaptador genérico não implementa RPGs completos. Relay deve coincidir com o contrato documentado. Discord possui diagnóstico honesto; ponte SDK licenciada, matriz de plataformas e aprovação de produção são bloqueios, não recursos concluídos.

## Leitor PDF do frontend

`apps/web/src/PdfReader.tsx` usa pdfjs-dist 6.4.299 com worker bundlado, navegação de páginas, zoom, sumário real, busca no texto extraído (sem inventar OCR), marcadores e notas. O estado GET/PUT `/api/library/:id/reading` mantém versões otimistas. Conflitos 409 preservam o rascunho e oferecem mescla explícita/revisão; textos concorrentes não são sobrescritos. Posição/notas são salvas por ação explícita, com aviso ao fechar janela não sincronizada. O usuário pode consultar o texto acessível da página. O componente recebe URL autorizada ou bytes, não inclui exportação/download de PDF e não prova acesso offline cifrado completo. Sua fonte não deve ser URL pública de livro pago. `key={bookId}` recria estado ao trocar de livro. Fontes R2 precisam de CORS e respostas Range reais; tokens nunca são gravados em logs. `VITE_API_ORIGIN` define origem HTTPS para requests nativos, mas autenticação nativa continua pendente.

O script `node scripts/prepare-pdfjs-assets.mjs` prepara os assets abertos de `pdfjs-dist` na versão exata do leitor: CMaps, fontes padrão, codecs WASM e licenças são copiados a `apps/web/public/pdfjs`. `predev`/`prebuild` devem executá-lo; os arquivos gerados não substituem a dependência fixada nem precisam entrar no ZIP fonte. O componente usa as URLs sob BASE_URL, sem depender de CDN.

A CSP permite `wasm-unsafe-eval` apenas para os codecs WASM distribuídos do PDF.js; não habilita eval de JavaScript ou código remoto. A hospedagem web deve aplicar permissão equivalente para páginas que precisem de codecs WASM.
