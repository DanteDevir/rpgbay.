# Emuladores locais

Foi instalado CodeRabbit emulate **v0.0.1**, fonte tagged com SHA256 f6ec889b13deda3062424daa0c70b86b7485627c5b52ac4cad91cb1f11eee4f1. O instalador opcional está em scripts/install-emulate.sh; exige Node24 e pnpm11. Instala fora do checkout, não faz parte do build da aplicação nem do ZIP. `node "$HOME/runtime/emulate/v0.0.1/dist/index.js" list` e `--help` mostram catálogo/documentação.

`RUN_EMULATOR_TESTS=true TEST_DATABASE_URL=<banco _test> npm test` habilita teste local adicional. Sem instalação, não habilite a flag; a suíte reporta esse caso skipped de forma explícita. Nenhuma credencial real deve ser fornecida. SDK/provedor no teste usa identidades e dados sintéticos.

Operações realmente verificadas com transporte HTTP do emulate: Stripe PaymentIntent create/confirm/retrieve e webhook assinado; AWS S3 bucket/put/get de PDF via cliente S3. Limites encontrados: Checkout do emulate não aceita inline price_data usado pela aplicação, exige preço previamente criado; PaymentIntent canônico emulado não retorna amount_received. Não relaxamos validação de valor real para obter sucesso fictício. Assim, teste emulador não cobre checkout inteiro, Connect/transfers, Pix Asaas, Zitadel real ou R2 específico. Catálogo não contém Asaas/Zitadel/Discord/Foundry; emular outro issuer não prova conformidade com NAJA ID.

STRIPE_API_ORIGIN e R2_EMULATOR_ENDPOINT são overrides somente local/test; produção recusa esses overrides. Nunca alteram o Git/auth do agente. Estado em memória termina com processo e fixture é reprodutível no teste. Não é aprovação comercial ou teste em conta sandbox externa do proprietário.
