# NAJA ID / Zitadel

Use issuer real informado pelo operador, sem derivar domínio do nome NAJA. Leia discovery e registre issuer/audience exatos. Cliente web Authorization Code+PKCE S256; redirect de homologação http://localhost:5173/api/auth/callback e produção https://rpgbay.libbay.com/api/auth/callback, registrados no provedor. Client secret somente no backend se cliente confidencial.

OIDC_ISSUER, OIDC_AUDIENCE, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, WEB_ORIGIN obrigatórios fora do dev isolado. Assinatura/JWKS, issuer, audience, exp, state de uso único e nonce são verificados. Sessão RPG BAY em cookie HttpOnly/Secure/SameSite=Lax em produção, hash no banco e validade12h; mutações exigem Origin. Não guardar tokens em localStorage. Logout revoga sessão local; revogação federada/refresh e dispositivos administráveis continuam pendentes.

Primeiro administrador: faça login legítimo; em canal operacional autorizado e auditado, confirme o sub real e altere users.role para admin usando query parametrizada. Nenhum seed cria admin e não existe senha padrão. MFA/reauth privilegiada não está ligada a todas as operações e bloqueia lançamento.

Clientes Tauri exigem clientes OIDC públicos próprios, navegador do sistema, PKCE, deep-link/loopback válido e secure storage. Esses fluxos nativos não estão implementados; cookies do site não são autenticação nativa. Testes locais RS256/JWKS não comprovam login em issuer real.
