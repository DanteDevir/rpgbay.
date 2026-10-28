# Build Android

Node24/npm11, Rust1.99.1, Android Studio, JDK17 compatível com versão Gradle Tauri, SDK/NDK configurados em ANDROID_HOME/NDK_HOME e targets Rust Android indicados pela documentação Tauri2. Linux/Windows/macOS podem preparar Android quando toolchain suportada.

`npm ci`, `npm --prefix apps/launcher run android:init`, depois `npm --prefix apps/launcher run android:build`. Arquivos Gradle/identidade gerados devem ser revisados. Keystore de release fora do projeto e senha via cofre. Teste real de permissão/deep-link/offline obrigatório.

Cliente mobile ainda não tem ponte segura de keystore/OIDC final; Android não foi compilado neste ambiente. Offline nativo falha explicitamente em plataforma sem keystore, não usa chave global.

## Web e API

Na raiz: `npm ci`, `npm run build`. Configuração local no README. O servidor usa PostgreSQL17 e R2 em produção. `npm run build` verifica TypeScript e gera apps/web/dist, não compila Rust.

## Limites

Login OIDC nativo, keystore mobile, integração UI de offline, relay Foundry, SDK Discord e updater assinado ainda pendentes. Build bem-sucedido não certifica recursos externos. Ver NATIVE_IMPLEMENTATION.md e TEST_REPORT.md.
