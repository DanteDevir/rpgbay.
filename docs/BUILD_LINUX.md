# Build Linux

Ubuntu/Debian suportado pelo Tauri2; Node24/npm11, Rust1.99.1 via rustup, pkg-config, build-essential, libglib2.0-dev, libgtk-3-dev, libwebkit2gtk-4.1-dev, librsvg2-dev, libayatana-appindicator3-dev, patchelf. Instale pacotes com apt do SO correspondente. A sandbox é Ubuntu26.04.

`cd apps/launcher && npm run build -- --bundles deb,appimage` depois de preparar a API HTTPS real via VITE_API_ORIGIN. Use secure storage do sistema; dependência de Secret Service/keystore deve ser validada no host desktop. Distribua somente após revisar licenças/assinatura/updater e testar hardware real.

## Web e API

Na raiz: `npm ci`, `npm run build`. Configuração local no README. O servidor usa PostgreSQL17 e R2 em produção. `npm run build` verifica TypeScript e gera apps/web/dist, não compila Rust.

## Limites

Login OIDC nativo, keystore mobile, integração UI de offline, relay Foundry, SDK Discord e updater assinado ainda pendentes. Build bem-sucedido não certifica recursos externos. Ver NATIVE_IMPLEMENTATION.md e TEST_REPORT.md.
