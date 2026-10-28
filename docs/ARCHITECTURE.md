# Arquitetura e decisões

## ADR 001 — monorepo modular

Repositório de origem vazio; nenhum contrato de implementação anterior. Especificação em SPECIFICATION.md é o contrato. TypeScript estrito e Node 24; React/Vite para frontend estático reutilizado por Tauri 2 desktop/mobile. Fastify e PostgreSQL para API transacional; objetos privados no R2 por adaptador S3. Nenhum Redis antes de necessidade medida.

## ADR 002 — escopo e provas

Provas nativas, OIDC real, Discord e provedores dependem de ambiente/credenciais. A stack é uma escolha provisória enquanto essas provas não estiverem concluídas. Compilação web não comprova launcher ou app mobile. Dados demonstrativos só no desenvolvimento explicitamente habilitado. Produção deve recusar configuração insegura.

## ADR 003 — dinheiro e autorização

Centavos inteiros; comissão conjunta de 9%; regras comerciais não confirmadas são propostas versionadas. Autorizações e limites no servidor com transações. Backend responde apenas dados permitidos; apresentação nunca recebe segredos por CSS.

## ADR 004 — frontend

Vite foi escolhido para compartilhar build estático com clientes Tauri. SEO por produto via SSR ainda precisa de implementação; não alegar paridade com Next SSR. Nenhum deploy externo autorizado.

## ADR005 — provas locais e status final

Linux Tauri2.12.5/tauri-build2.7.4/Rust1.99.1 compilou binário debug. GLib/GTK/WebKit e pins incompatíveis foram reparados. TypeScript6.0.3 satisfaz peers do lint. Scanner ClamAV oficial validou clean/MIME falso/EICAR; exigiu2GiB para base. Reader lazy reduz entrada web. Provas críticas externas/nativoSSO/offline ainda não concluíram; stack permanece escolha documentada, sem alegar que a prova inicial integral está satisfeita.
