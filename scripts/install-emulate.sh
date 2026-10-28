#!/usr/bin/env bash
set -euo pipefail
cd /tmp
install_root="$HOME/runtime/emulate/v0.0.1"
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Emulate requires Node 24+")'
if [ -f "$install_root/.release-tag" ] && [ "$(cat "$install_root/.release-tag")" = "v0.0.1" ]; then
  if node "$install_root/dist/index.js" --version; then exit 0; fi
fi
command -v pnpm >/dev/null
pnpm_version="$(pnpm --version)"
node -e 'if (Number(process.argv[1].split(".")[0]) !== 11) throw new Error("Emulate build requires pnpm 11 (found " + process.argv[1] + ")")' "$pnpm_version"
mkdir -p "$HOME/runtime/emulate"
staging="$(mktemp -d "$HOME/runtime/emulate/.install.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
curl --fail --location --retry 2 --connect-timeout 15 --max-time 120 'https://codeload.github.com/coderabbitai/emulate/tar.gz/refs/tags/v0.0.1' -o "$staging/source.tar.gz"
node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); if (crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex") !== "f6ec889b13deda3062424daa0c70b86b7485627c5b52ac4cad91cb1f11eee4f1") throw new Error("Emulate source checksum mismatch")' "$staging/source.tar.gz"
mkdir "$staging/source"
tar -xzf "$staging/source.tar.gz" --strip-components=1 -C "$staging/source"
(cd "$staging/source"; pnpm install --frozen-lockfile --ignore-scripts --filter emulate...; pnpm --filter emulate... build; pnpm --filter emulate deploy --prod --legacy "$staging/package")
cp -R "$staging/source/skills" "$staging/package/skills"
cp "$staging/source/README.md" "$staging/package/README.md"
node "$staging/package/dist/index.js" list
printf '%s\n' 'v0.0.1' > "$staging/package/.release-tag"
rm -rf "$install_root"
mv "$staging/package" "$install_root"
echo "Installed CodeRabbit emulators at $install_root"
