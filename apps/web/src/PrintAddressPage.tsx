import { useEffect, useState, type FormEvent } from "react";
import { Shield, MapPin, ArrowRight, CheckCircle2, Layers } from "lucide-react";
export function PrintAddressPage({ token }: { token: string }) {
  const [info, setInfo] = useState<{
      title?: string;
      version: number;
      addressOnFile?: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  const endpoint = `${import.meta.env.VITE_API_ORIGIN || ""}/api/print/address/${encodeURIComponent(token)}`;
  useEffect(() => {
    fetch(endpoint, { credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw new Error(
            b.error?.message || "Este link está indisponível ou expirou.",
          );
        setInfo(b);
      })
      .catch((e) => setError(e.message));
  }, [endpoint]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch(endpoint, {
        method: "PUT",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: { ...values, country: "BR" },
          version: info?.version,
        }),
      });
      const b = await r.json();
      if (!r.ok)
        throw new Error(
          b.error?.message ||
            "Não foi possível salvar. Reabra o link para obter a versão atual.",
        );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na solicitação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 650, padding: "40px 24px" }}>
      <div className="brand">
        <Layers />
        RPG BAY
      </div>
      <span className="eyebrow accent">ENTREGA DE PRESENTE · LINK PRIVADO</span>
      <h1 style={{ marginTop: 15 }}>Um novo capítulo está a caminho.</h1>
      <p>
        Informe o endereço de entrega. O remetente não recebe acesso ao seu
        endereço completo.
      </p>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {done ? (
        <section className="empty">
          <CheckCircle2 className="accent" size={36} />
          <h2>Endereço recebido.</h2>
          <p>
            O preenchimento não confirma fabricação, frete contratado ou
            entrega. A equipe responsável acompanha as próximas etapas do
            pedido.
          </p>
        </section>
      ) : info ? (
        <form onSubmit={submit}>
          <div className="info-card">
            <MapPin />
            <div>
              <strong>{info.title || "Presente RPG BAY"}</strong>
              <p>
                {info.addressOnFile
                  ? "Um endereço já foi informado. Você pode atualizá-lo enquanto este link for válido."
                  : "Dados usados somente para atender à entrega deste pedido."}
              </p>
            </div>
          </div>
          {[
            {
              name: "recipient",
              label: "Nome do destinatário",
              auto: "name",
              max: 120,
            },
            {
              name: "postalCode",
              label: "CEP (somente 8 números)",
              auto: "postal-code",
              max: 8,
            },
            {
              name: "street",
              label: "Rua / avenida",
              auto: "address-line1",
              max: 200,
            },
            { name: "number", label: "Número", max: 30 },
            {
              name: "complement",
              label: "Complemento (opcional)",
              auto: "address-line2",
              max: 100,
            },
            { name: "district", label: "Bairro", max: 100 },
            { name: "city", label: "Cidade", auto: "address-level2", max: 100 },
            {
              name: "state",
              label: "UF (duas letras)",
              auto: "address-level1",
              max: 2,
            },
          ].map((f) => (
            <label key={f.name} className="field">
              {f.label}
              <input
                name={f.name}
                required={f.name !== "complement"}
                autoComplete={f.auto}
                maxLength={f.max}
                pattern={
                  f.name === "postalCode"
                    ? "[0-9]{8}"
                    : f.name === "state"
                      ? "[A-Za-z]{2}"
                      : undefined
                }
              />
            </label>
          ))}
          <div className="form-note">
            <Shield size={18} />O link é uma credencial privada. Não o publique
            nem compartilhe além do destinatário.
          </div>
          <button
            className="primary submit-button"
            disabled={busy}
            type="submit"
          >
            {busy ? "Salvando…" : "Salvar endereço privado"}
            <ArrowRight size={16} />
          </button>
        </form>
      ) : (
        !error && <p>Verificando seu link privado…</p>
      )}
    </main>
  );
}
