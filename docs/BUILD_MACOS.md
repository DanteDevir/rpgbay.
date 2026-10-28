# Build macOS

Mac compatível com Xcode e Command Line Tools, Node24/npm11 e Rust1.99.1 para arquitetura Intel/Apple Silicon. `npm ci`, `npm --prefix apps/launcher run build -- --bundles dmg`. Configure equipe/assinatura/notarização legitimamente no ambiente Apple, fora do ZIP. Universal binary requer alvos apropriados e teste de ambas arquiteturas.

Nenhum build macOS foi executado neste Linux. Native keystore usa serviço do sistema; teste permissões e rotação.

## Web e API

Na raiz: `npm ci`, `npm run build`. Configuração local no README. O servidor usa PostgreSQL17 e R2 em produção. `npm run build` verifica TypeScript e gera apps/web/dist, não compila Rust.

## Limites

Login OIDC nativo, keystore mobile, integração UI de offline, relay Foundry, SDK Discord e updater assinado ainda pendentes. Build bem-sucedido não certifica recursos externos. Ver NATIVE_IMPLEMENTATION.md e TEST_REPORT.md.
