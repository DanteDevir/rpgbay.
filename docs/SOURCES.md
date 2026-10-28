# Fontes e versões verificadas

Consulta HTTPS com curl em28/10/2026; ferramenta web indisponível por autenticação do ambiente. As fontes oficiais foram lidas para protocolos, não como evidência de homologação externa.

- React https://react.dev/versions
- Vite https://vite.dev/guide/
- Tauri2 https://v2.tauri.app/start/ e https://v2.tauri.app/reference/config/
- Zitadel https://zitadel.com/docs/guides/integrate/login/oidc/login-users
- Cloudflare https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Stripe https://docs.stripe.com/connect/separate-charges-and-transfers
- Asaas https://docs.asaas.com/reference/criar-nova-cobranca e docs de webhooks
- Foundry https://foundryvtt.com/api/v13/ (alvo, não mundo testado)
- Discord https://docs.discord.com/developers/discord-social-sdk/overview (SPA/acesso não comprova SDK/plataforma)

Versões exatas npm no package-lock.json; Rust no Cargo.lock/rust-toolchain.toml. TypeScript7 inicialmente disponível no registry foi substituído por6.0.3 para satisfazer peer suportado do typescript-eslint8.72.1 (<6.1). Essa decisão é compatibilidade de ferramentas. Binários nativos não gerados e SDK Discord não distribuído.
