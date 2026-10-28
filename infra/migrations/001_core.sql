CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, display_name text NOT NULL DEFAULT 'Jogador', bio text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
 favorite_systems jsonb NOT NULL DEFAULT '[]', role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS publishers (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users, name text NOT NULL, description text NOT NULL DEFAULT '',
 verified boolean NOT NULL DEFAULT false, family_license_accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS publisher_members (publisher_id uuid REFERENCES publishers ON DELETE CASCADE, user_id text REFERENCES users, role text NOT NULL CHECK(role IN ('admin','editor','finance','support')), PRIMARY KEY(publisher_id,user_id));
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, publisher_id uuid REFERENCES publishers, title text NOT NULL, subtitle text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
 system text NOT NULL DEFAULT 'Independente', format text NOT NULL DEFAULT 'PDF', price_cents integer NOT NULL DEFAULT 0 CHECK(price_cents>=0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','suspended','withdrawn')), family_sharing boolean NOT NULL DEFAULT true,
 cover text, color text NOT NULL DEFAULT '#7c60cf', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_versions (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products, label text NOT NULL, changelog text NOT NULL DEFAULT '',
 object_key text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), size_bytes bigint NOT NULL CHECK(size_bytes>0),
 validated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id,label)
);
CREATE TABLE IF NOT EXISTS entitlements (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users, product_id uuid NOT NULL REFERENCES products, source text NOT NULL,
 source_reference text, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, UNIQUE(user_id,product_id,source_reference)
);
CREATE INDEX IF NOT EXISTS entitlement_active ON entitlements(user_id,product_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS families (id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS family_members (family_id uuid REFERENCES families ON DELETE CASCADE, user_id text UNIQUE REFERENCES users, joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(family_id,user_id));
CREATE TABLE IF NOT EXISTS family_invites (id uuid PRIMARY KEY, family_id uuid NOT NULL REFERENCES families ON DELETE CASCADE, secret_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, accepted_by text REFERENCES users, accepted_at timestamptz);
CREATE TABLE IF NOT EXISTS tables (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users, title text NOT NULL, system text NOT NULL DEFAULT 'Livre', description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')), next_session timestamptz, secret_notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS table_members (table_id uuid REFERENCES tables ON DELETE CASCADE, user_id text REFERENCES users, role text NOT NULL CHECK(role IN ('co_gm','player','observer')), PRIMARY KEY(table_id,user_id));
CREATE TABLE IF NOT EXISTS table_invites (id uuid PRIMARY KEY, table_id uuid REFERENCES tables ON DELETE CASCADE, secret_hash text UNIQUE NOT NULL, role text NOT NULL CHECK(role IN ('player','observer')), expires_at timestamptz NOT NULL, accepted_by text REFERENCES users);
CREATE TABLE IF NOT EXISTS sheets (
 id uuid PRIMARY KEY, table_id uuid NOT NULL REFERENCES tables ON DELETE CASCADE, owner_id text NOT NULL REFERENCES users, name text NOT NULL,
 fields jsonb NOT NULL DEFAULT '{}', secret_fields jsonb NOT NULL DEFAULT '{}', layout jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rolls (id uuid PRIMARY KEY, table_id uuid NOT NULL REFERENCES tables ON DELETE CASCADE, user_id text NOT NULL REFERENCES users, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS achievements (user_id text REFERENCES users, code text NOT NULL, source_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,code));
CREATE TABLE IF NOT EXISTS worlds (id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users, title text NOT NULL, description text NOT NULL DEFAULT '', visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','public')), version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS world_members (world_id uuid REFERENCES worlds ON DELETE CASCADE, user_id text REFERENCES users, role text NOT NULL CHECK(role IN ('editor','reader')), PRIMARY KEY(world_id,user_id));
CREATE TABLE IF NOT EXISTS world_tables (world_id uuid REFERENCES worlds ON DELETE CASCADE, table_id uuid REFERENCES tables ON DELETE CASCADE, PRIMARY KEY(world_id,table_id));
CREATE TABLE IF NOT EXISTS world_pages (
 id uuid PRIMARY KEY, world_id uuid NOT NULL REFERENCES worlds ON DELETE CASCADE, title text NOT NULL, kind text NOT NULL DEFAULT 'article', content text NOT NULL DEFAULT '',
 tags jsonb NOT NULL DEFAULT '[]', links jsonb NOT NULL DEFAULT '[]', visibility text NOT NULL DEFAULT 'team' CHECK(visibility IN ('private','team','public')), version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS revisions (id uuid PRIMARY KEY, entity_type text NOT NULL, entity_id uuid NOT NULL, version integer NOT NULL, snapshot jsonb NOT NULL, author_id text NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entity_type,entity_id,version));
CREATE TABLE IF NOT EXISTS community_posts (id uuid PRIMARY KEY, author_id text NOT NULL REFERENCES users, title text NOT NULL, body text NOT NULL, category text NOT NULL DEFAULT 'discussion', system text NOT NULL DEFAULT 'Geral', status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')), removal_reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS post_comments (id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES community_posts ON DELETE CASCADE, author_id text NOT NULL REFERENCES users, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, reporter_id text NOT NULL REFERENCES users, entity_type text NOT NULL, entity_id uuid NOT NULL, reason text NOT NULL, state text NOT NULL DEFAULT 'open', resolution text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_blocks (user_id text REFERENCES users, blocked_id text REFERENCES users, PRIMARY KEY(user_id,blocked_id), CHECK(user_id<>blocked_id));
CREATE TABLE IF NOT EXISTS beta_programs (id uuid PRIMARY KEY, publisher_id uuid NOT NULL REFERENCES publishers, product_id uuid NOT NULL REFERENCES products, version_id uuid NOT NULL REFERENCES product_versions, title text NOT NULL, access text NOT NULL CHECK(access IN ('open','approval','invite')), end_policy text NOT NULL CHECK(end_policy IN ('expires','retained')), state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS beta_participants (beta_id uuid REFERENCES beta_programs ON DELETE CASCADE, user_id text REFERENCES users, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')), pinned_version_id uuid NOT NULL REFERENCES product_versions, credits_consent boolean NOT NULL DEFAULT false, PRIMARY KEY(beta_id,user_id));
CREATE TABLE IF NOT EXISTS beta_feedback (id uuid PRIMARY KEY, beta_id uuid NOT NULL REFERENCES beta_programs, user_id text NOT NULL REFERENCES users, version_id uuid NOT NULL REFERENCES product_versions, page integer CHECK(page>0), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gifts (id uuid PRIMARY KEY, sender_id text NOT NULL REFERENCES users, product_id uuid NOT NULL REFERENCES products, secret_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, state text NOT NULL CHECK(state IN ('pending_payment','ready','redeemed','expired','refunded')), recipient_id text REFERENCES users, dedication text NOT NULL DEFAULT '', redeemed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS personal_copies (id uuid PRIMARY KEY, entitlement_id uuid NOT NULL UNIQUE REFERENCES entitlements, dedication text NOT NULL DEFAULT '', display_dedication boolean NOT NULL DEFAULT false, cover_object_key text);
CREATE TABLE IF NOT EXISTS point_accounts (user_id text PRIMARY KEY REFERENCES users, balance integer NOT NULL DEFAULT 0 CHECK(balance>=0));
CREATE TABLE IF NOT EXISTS cosmetics (id uuid PRIMARY KEY, title text NOT NULL, cost integer NOT NULL CHECK(cost>0), style jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS cosmetic_ownership (user_id text REFERENCES users, cosmetic_id uuid REFERENCES cosmetics, acquired_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,cosmetic_id));
CREATE TABLE IF NOT EXISTS point_entries (id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users, amount integer NOT NULL, reason text NOT NULL, reference text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS subscriptions (user_id text PRIMARY KEY REFERENCES users, status text NOT NULL CHECK(status IN ('active','cancelled','past_due')), provider text NOT NULL, external_reference text UNIQUE NOT NULL, ends_at timestamptz);
CREATE TABLE IF NOT EXISTS print_jobs (id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users, publisher_id uuid NOT NULL REFERENCES publishers, product_id uuid NOT NULL REFERENCES products, status text NOT NULL DEFAULT 'awaiting_art', proof_key text, approved_at timestamptz, tracking text, notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_events (id uuid PRIMARY KEY, actor_id text REFERENCES users, action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reading_state (user_id text REFERENCES users, product_id uuid REFERENCES products, page integer NOT NULL CHECK(page>0), annotations jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,product_id));
