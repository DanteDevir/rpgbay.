# RPG BAY

Plataforma de RPG de mesa da LETARGIA RPG, ecossistema LibBay/NAJA. Esta entrega contém código executável, testes, clientes Tauri e documentação, mas **não conclui integralmente a V1.0 especificada e não está pronta para receber clientes**. Há pendências de implementação e de validação externa; consulte [matriz](docs/REQUIREMENTS_MATRIX.md) e [prontidão](docs/PRODUCTION_READINESS.md). O documento original permanece em [SPECIFICATION.md](docs/SPECIFICATION.md).

## Stack fixada

Node24.21.0 / npm11.19.0; TypeScript6.0.3; React19.3.1; Vite8.3.5; Fastify5.12.7; PostgreSQL17; Tauri2 e Rust1.99.1; PDF.js6.4.299; SDKs AWS S3, jose e Stripe. Versões transitivas no package-lock.json/Cargo.lock. Sem SDK Discord proprietário no pacote. Nenhuma credencial ou binário de terceiros não autorizado incluído.

## Iniciar localmente

Pré-requisitos: Node24, npm11, Docker com Compose. Extraia o ZIP: a raiz única é `rpg-bay/`. Linux/macOS: `bash scripts/dev.sh`. Windows: `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1`; abra a API em outro terminal conforme indicação. Setup não precisa de credenciais para dados sintéticos isolados.

Passos manuais, a partir da raiz:

```bash
npm ci
cp .env.example .env
# Carregue as variáveis do .env no ambiente local.
# Bash: set -a; source .env; set +a
# PowerShell: veja scripts/dev.ps1
docker compose -f compose.dev.yaml up -d --wait
npm run db:migrate
npm run db:seed
npm run start:api
# Segundo terminal, mesmas variáveis:
npm run dev
```

Abra http://localhost:5173; API http://localhost:3001/api/health. Vite encaminha /api. O seed exige NODE_ENV=development E DEV_AUTH_ENABLED=true. O frontend exige VITE_DEV_AUTH=true em `vite dev`; o build de produção nunca ativa essa identidade. Sessão demonstrativa não cria administrador. Livro PDF autoral pequeno é servido por rota exclusiva de desenvolvimento e autorização; não é livro comercial.

## Verificar

```bash
npm run lint
npm run typecheck
# Banco separado: crie rpgbay_test com usuário autorizado.
# Defina TEST_DATABASE_URL para esse banco, nunca o banco de desenvolvimento/produção.
npm test
npm run build
npm audit --omit=dev --audit-level=high
node scripts/scan-secrets.mjs
```

Sem TEST_DATABASE_URL, testes PostgreSQL são skipped; isso não é validação completa. Testes rejeitam banco cujo nome não termina em `_test`. São usadas fixtures/transportes de teste e schema descartável. O build web prepara fontes/CMaps/codecs PDF.js do pacote instalado. Não é necessário baixar recursos fora do lockfile para o web build.

## Conteúdo

- apps/web: catálogo, biblioteca/leitor, mesas/fichas, mundos, comunidade, família e preferências, responsivos em PT-BR.
- apps/api: autorização, migrations, persistência PostgreSQL, limites concorrentes, rotas comerciais e storage.
- apps/worker: scanner real fail-closed (ClamAV/qpdf/ImageMagick), sem falso resultado limpo.
- apps/launcher: Tauri desktop/mobile e armazenamento offline cifrado; paridade/autenticação nativa ainda pendentes.
- packages: domínio, finanças exatas, offline assinado e merge do leitor.
- integrations: R2, OIDC, Stripe/Asaas, módulo Foundry e diagnóstico Discord.
- infra: Docker multi-stage, Compose e Caddy; scripts incluem dev, diagnóstico, backup/restore e empacotamento.

A API possui mais fluxos que a interface atual; endpoints e limites estão em [API_CONTRACT.md](docs/API_CONTRACT.md). Presença de rota/adaptador não comprova integração em produção.

## Compilar por plataforma

[Linux](docs/BUILD_LINUX.md), [Windows](docs/BUILD_WINDOWS.md), [macOS](docs/BUILD_MACOS.md), [Android](docs/BUILD_ANDROID.md), [iOS](docs/BUILD_IOS.md). macOS/iOS requerem Apple/Xcode; release exige credenciais de assinatura/distribuição. Nenhum script Linux gera todos os binários de todas as plataformas.

## Configuração legítima e lançamento

[Variáveis](docs/ENVIRONMENT.md), [deploy](docs/DEPLOY_PRODUCTION.md), [R2](docs/R2_STORAGE.md), [Zitadel](docs/ZITADEL_SETUP.md), [Discord](docs/DISCORD_SETUP.md), [Foundry](docs/FOUNDRY_SETUP.md), [pagamentos](docs/PAYMENTS_AND_PAYOUTS.md), [políticas](docs/COMMERCIAL_POLICIES.md), [testes reais](docs/TEST_REPORT.md), [segurança](docs/SECURITY.md). Nenhum DNS/deploy/cobrança/transferência externo foi feito. Segredos devem ser configurados localmente ou em secret store, nunca em chat/ZIP.

## Recriar o ZIP

Python3 necessário: `python3 scripts/package.py --output /caminho/RPG_BAY_V1_Source.zip`; Windows `python scripts/package.py` ou scripts/package.ps1. Verifique `python3 scripts/verify-package.py /caminho/RPG_BAY_V1_Source.zip` e o SHA256 ao lado do arquivo. ZIP fonte exclui node_modules, target, dist, caches, .env privados e recursos PDF.js gerados. SOURCE_MANIFEST.json contém tamanho/hash de cada arquivo; timestamps fixos. Reprodutibilidade foi testada para este ZIP fonte, não para binários nativos.
