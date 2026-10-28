# Build Windows

Windows10/11 suportado pelo Tauri2, Node24/npm11, Python3 para empacotar, Rust1.99.1 MSVC target, Visual Studio2022 C++ Build Tools e Windows SDK, WebView2 Runtime. PowerShell: `npm ci`, depois `npm --prefix apps/launcher run build -- --bundles nsis`.

Android também exige JDK/SDK/NDK. Instalador release requer certificado/assinatura e testes no Windows; nenhum binário Windows foi compilado neste Linux. Não tratar instalador sem assinatura como release confiável.

## Web e API

Na raiz: `npm ci`, `npm run build`. Configuração local no README. O servidor usa PostgreSQL17 e R2 em produção. `npm run build` verifica TypeScript e gera apps/web/dist, não compila Rust.

## Limites

Login OIDC nativo, keystore mobile, integração UI de offline, relay Foundry, SDK Discord e updater assinado ainda pendentes. Build bem-sucedido não certifica recursos externos. Ver NATIVE_IMPLEMENTATION.md e TEST_REPORT.md.
