# Build iOS

Exige macOS, Xcode e Apple SDKs, Node24/npm11, Rust1.99.1 e targets Apple apropriados, conta/equipe Apple e perfis reais para assinatura/distribuição. Compose/Linux não compila iOS.

`npm ci`, `npm --prefix apps/launcher run ios:init`, `npm --prefix apps/launcher run ios:build`, no Mac. Gere/revise projeto Xcode, bundle ID e privacy/entitlements. Nenhuma credencial ou certificado Apple no ZIP.

OIDC de navegador/deep-link e secure storage iOS ainda precisam ligação; nenhuma distribuição App Store validada. Não distribuir runtime de código fora da política da plataforma.

## Web e API

Na raiz: `npm ci`, `npm run build`. Configuração local no README. O servidor usa PostgreSQL17 e R2 em produção. `npm run build` verifica TypeScript e gera apps/web/dist, não compila Rust.

## Limites

Login OIDC nativo, keystore mobile, integração UI de offline, relay Foundry, SDK Discord e updater assinado ainda pendentes. Build bem-sucedido não certifica recursos externos. Ver NATIVE_IMPLEMENTATION.md e TEST_REPORT.md.
