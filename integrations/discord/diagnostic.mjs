import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Installation inspection only: this does not pretend to implement the proprietary SDK ABI. */
export async function diagnoseDiscordSdk(
  directory = process.env.DISCORD_SOCIAL_SDK_DIR,
) {
  if (!directory)
    return {
      available: false,
      code: "SDK_NOT_CONFIGURED",
      message:
        "Instale o Discord Social SDK oficial e configure DISCORD_SOCIAL_SDK_DIR. Voz integrada ainda não está disponível.",
    };
  const root = resolve(directory);
  try {
    const manifest = JSON.parse(
      await readFile(resolve(root, "rpgbay-sdk-install.json"), "utf8"),
    );
    if (
      typeof manifest.version !== "string" ||
      !manifest.version ||
      !Array.isArray(manifest.files) ||
      !manifest.files.length
    )
      throw new Error("Manifest inválido");
    for (const file of manifest.files) {
      const path = resolve(root, file);
      if (!path.startsWith(root + "/") || typeof file !== "string")
        throw new Error("Caminho inválido");
      await access(path);
    }
    return {
      available: false,
      code: "BRIDGE_NOT_IMPLEMENTED",
      version: manifest.version,
      message:
        "Arquivos encontrados. Compilar e testar a ponte ABI licenciada antes de habilitar voz. A presença dos arquivos não comprova integração.",
    };
  } catch {
    return {
      available: false,
      code: "SDK_INSTALL_INVALID",
      message:
        "Instalação oficial ausente/incompleta. Consulte integrations/discord/README.md.",
    };
  }
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  console.log(JSON.stringify(await diagnoseDiscordSdk(), null, 2));
