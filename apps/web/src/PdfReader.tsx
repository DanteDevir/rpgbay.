import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BOOKMARK_MARKER,
  mergeReadingStates,
  type ReadingState,
} from "../../../packages/reader/state";
import "./pdf-reader.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export interface PdfReaderProps {
  bookId: string;
  title: string;
  source?: string | Uint8Array;
  onClose: () => void;
  request?: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
}
interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}
interface SearchMatch {
  page: number;
  excerpt: string;
}
class ReadingApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function defaultRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const dev = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "true";
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  if (
    apiOrigin &&
    new URL(apiOrigin).protocol !== "https:" &&
    !import.meta.env.DEV
  )
    throw new ReadingApiError("A origem da API nativa exige HTTPS.", 0);
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(dev ? { "x-dev-user": "dev-user" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ReadingApiError(
      result.error?.message ?? `Falha ao sincronizar (${response.status})`,
      response.status,
    );
  return result as T;
}
const blank = (): ReadingState => ({ page: 1, annotations: [], version: 0 });
export function PdfReader({
  bookId,
  title,
  source,
  onClose,
  request = defaultRequest,
}: PdfReaderProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1);
  const [reading, setReading] = useState<ReadingState>(blank),
    [base, setBase] = useState<ReadingState>(blank);
  const [outline, setOutline] = useState<OutlineEntry[]>([]),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("Carregando posição…"),
    [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0),
    [searching, setSearching] = useState(false),
    [searchDone, setSearchDone] = useState(false),
    [rendering, setRendering] = useState(false),
    [pageText, setPageText] = useState("");
  const [remoteConflict, setRemoteConflict] = useState<ReadingState | null>(
      null,
    ),
    [note, setNote] = useState(""),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    renderTask = useRef<RenderTask | null>(null),
    searchGeneration = useRef(0);
  const sequence = useRef(0),
    readingRef = useRef(reading),
    savingRef = useRef(false),
    alive = useRef(true);
  readingRef.current = reading;
  const path = `/library/${encodeURIComponent(bookId)}/reading`;
  useEffect(() => {
    alive.current = true;
    let active = true;
    request<ReadingState>(path)
      .then((state) => {
        if (active) {
          setReading(state);
          setBase(state);
          setPage(state.page);
          setLoaded(true);
          setStatus("Sincronizado");
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setStatus(
            "Sincronização indisponível. Anotações estão desabilitadas para evitar perda de versões.",
          );
        }
      });
    return () => {
      active = false;
      alive.current = false;
      searchGeneration.current++;
    };
  }, [path, request]);
  useEffect(() => {
    if (!source) {
      setStatus("O arquivo autorizado deste livro ainda não está disponível.");
      return;
    }
    let active = true;
    let sourceOrigin: string, trustedOrigin: string;
    try {
      sourceOrigin =
        typeof source === "string"
          ? new URL(source, window.location.href).origin
          : "";
      trustedOrigin = import.meta.env.VITE_API_ORIGIN
        ? new URL(import.meta.env.VITE_API_ORIGIN).origin
        : window.location.origin;
    } catch {
      setError("Origem do arquivo ou da API inválida.");
      return;
    }
    const sendCredentials =
      sourceOrigin === window.location.origin || sourceOrigin === trustedOrigin;
    const devHeaders =
      sendCredentials &&
      import.meta.env.DEV &&
      import.meta.env.VITE_DEV_AUTH === "true"
        ? { "x-dev-user": "dev-user" }
        : undefined;
    // Signed R2 URLs are bearer authorization; never send our auth headers/cookies to object storage.
    // Copy owned buffers: PDF.js transfers its ArrayBuffer to the worker.
    const resources = {
      cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
      wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    };
    const task = getDocument(
      typeof source === "string"
        ? {
            ...resources,
            url: source,
            withCredentials: sendCredentials,
            httpHeaders: devHeaders,
          }
        : { ...resources, data: source.slice() },
    );
    task.onProgress = ({
      loaded: bytes,
      total,
    }: {
      loaded: number;
      total: number;
    }) => {
      if (active && total)
        setProgress(Math.min(100, Math.round((bytes / total) * 100)));
    };
    task.promise
      .then(async (document) => {
        if (!active) return;
        setPdf(document);
        setProgress(100);
        const entries: OutlineEntry[] = [];
        async function collect(
          items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
          depth = 0,
        ): Promise<void> {
          for (const item of items ?? []) {
            if (entries.length >= 1000) return;
            try {
              const dest =
                typeof item.dest === "string"
                  ? await document.getDestination(item.dest)
                  : item.dest;
              if (dest?.[0] !== undefined)
                entries.push({
                  title: item.title,
                  page:
                    typeof dest[0] === "number"
                      ? dest[0] + 1
                      : (await document.getPageIndex(dest[0])) + 1,
                  depth,
                });
            } catch {
              /* External/unresolvable destinations are not opened as remote links. */
            }
            if (depth < 12) await collect(item.items, depth + 1);
          }
        }
        try {
          await collect(await document.getOutline());
          if (active) setOutline(entries);
        } catch {
          if (active) setOutline([]);
        }
      })
      .catch((e) => {
        if (active) setError(`Não foi possível abrir o PDF: ${e.message}`);
      });
    return () => {
      active = false;
      searchGeneration.current++;
      renderTask.current?.cancel();
      void task.destroy();
      setPdf(null);
    };
  }, [source]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    const previousRender = renderTask.current;
    previousRender?.cancel();
    setRendering(true);
    setPageText("");
    const safePage = Math.max(1, Math.min(pdf.numPages, page));
    if (safePage !== page) setPage(safePage);
    pdf
      .getPage(safePage)
      .then(async (pdfPage) => {
        await previousRender?.promise.catch(() => {});
        if (!active || !canvas.current) return;
        const target = canvas.current,
          context = target.getContext("2d");
        if (!context) throw new Error("Canvas indisponível");
        const viewport = pdfPage.getViewport({ scale: zoom });
        if (viewport.width > 8192 || viewport.height > 16384)
          throw new Error("Página excede o limite seguro de renderização");
        const scale = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(16_777_216 / (viewport.width * viewport.height)),
        );
        target.width = Math.floor(viewport.width * scale);
        target.height = Math.floor(viewport.height * scale);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        const task = pdfPage.render({
          canvas: target,
          canvasContext: context,
          viewport,
          transform: scale !== 1 ? [scale, 0, 0, scale, 0, 0] : undefined,
        });
        renderTask.current = task;
        await task.promise;
        const text = await pdfPage.getTextContent();
        if (active)
          setPageText(
            text.items
              .map((item) =>
                "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
              )
              .join("")
              .slice(0, 200000),
          );
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError(`Falha ao renderizar: ${e.message}`);
      })
      .finally(() => {
        if (active) setRendering(false);
      });
    return () => {
      active = false;
      renderTask.current?.cancel();
    };
  }, [pdf, page, zoom]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(next: ReadingState) {
    sequence.current++;
    setReading(next);
    setDirty(true);
    setStatus("Alterações locais pendentes");
  }
  function go(next: number) {
    const current = Math.max(1, Math.min(pdf?.numPages ?? 100000, next));
    setPage(current);
    if (loaded) change({ ...readingRef.current, page: current });
  }
  async function save() {
    if (!loaded || savingRef.current || remoteConflict) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const snapshot = readingRef.current,
      seq = sequence.current;
    try {
      const result = await request<ReadingState>(path, "PUT", snapshot);
      if (!alive.current) return;
      setReading((current) => ({ ...current, version: result.version }));
      setBase(result);
      const unchanged = sequence.current === seq;
      setDirty(!unchanged);
      setStatus(unchanged ? "Sincronizado" : "Há alterações novas para salvar");
    } catch (e) {
      if (!alive.current) return;
      const failure = e as Error & { status?: number };
      if (failure.status === 409) {
        try {
          setRemoteConflict(await request<ReadingState>(path));
          setStatus("Conflito: suas anotações foram preservadas.");
        } catch {
          setError(
            "Não foi possível recuperar a versão remota. Seu rascunho continua nesta janela.",
          );
        }
      } else {
        setError(failure.message);
        setStatus(
          "Não sincronizado. Mantenha esta janela aberta para tentar novamente.",
        );
      }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }
  async function search() {
    if (!pdf || !query.trim()) return;
    const generation = ++searchGeneration.current,
      needle = query.trim().toLocaleLowerCase("pt-BR");
    setSearching(true);
    setSearchDone(false);
    setMatches([]);
    const found: SearchMatch[] = [];
    try {
      for (
        let index = 1;
        index <= pdf.numPages && found.length < 200;
        index++
      ) {
        if (generation !== searchGeneration.current) return;
        const content = await (await pdf.getPage(index)).getTextContent();
        const text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
          at = text.toLocaleLowerCase("pt-BR").indexOf(needle);
        if (at >= 0) {
          found.push({
            page: index,
            excerpt: text.slice(Math.max(0, at - 45), at + needle.length + 85),
          });
          setMatches([...found]);
        }
        // Yield between pages; never keep an entire book's text in the UI.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (generation === searchGeneration.current) setSearchDone(true);
    } catch {
      if (generation === searchGeneration.current)
        setError("Busca textual indisponível neste arquivo.");
    } finally {
      if (generation === searchGeneration.current) setSearching(false);
    }
  }
  const bookmarks = reading.annotations.filter(
      (a) => a.text === BOOKMARK_MARKER,
    ),
    notes = reading.annotations.filter((a) => a.text !== BOOKMARK_MARKER);
  const bookmarked = bookmarks.find((a) => a.page === page);
  return (
    <section
      className="pdf-reader"
      role="dialog"
      aria-modal="true"
      aria-label={`Leitor de ${title}`}
    >
      <header className="pdf-reader-header">
        <div>
          <small>BIBLIOTECA RPG BAY</small>
          <h2>{title}</h2>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              !dirty ||
              window.confirm(
                "Há alterações não sincronizadas. Fechar descartará este rascunho. Deseja continuar?",
              )
            )
              onClose();
          }}
          aria-label="Fechar leitor"
        >
          Fechar ✕
        </button>
      </header>
      <div className="pdf-toolbar">
        <button onClick={() => go(page - 1)} disabled={!pdf || page <= 1}>
          ← Anterior
        </button>
        <label>
          Página{" "}
          <input
            aria-label="Página"
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={page}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isSafeInteger(value) && value > 0) go(value);
            }}
          />
        </label>
        <span>de {pdf?.numPages ?? "—"}</span>
        <button
          onClick={() => go(page + 1)}
          disabled={!pdf || page >= pdf.numPages}
        >
          Próxima →
        </button>
        <label>
          Zoom{" "}
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={!!bookmarked}
          disabled={
            !loaded ||
            !pdf ||
            (!bookmarked && reading.annotations.length >= 1000)
          }
          onClick={() =>
            change({
              ...reading,
              annotations: bookmarked
                ? reading.annotations.filter((a) => a.id !== bookmarked.id)
                : [
                    ...reading.annotations,
                    { id: crypto.randomUUID(), page, text: BOOKMARK_MARKER },
                  ],
            })
          }
        >
          {bookmarked ? "★ Marcado" : "☆ Marcar"}
        </button>
        <button
          disabled={!loaded || !dirty || saving || !!remoteConflict}
          onClick={() => void save()}
        >
          {saving ? "Salvando…" : "Salvar posição e notas"}
        </button>
      </div>
      {error && (
        <p className="pdf-error" role="alert">
          {error}
        </p>
      )}
      {remoteConflict && (
        <div className="pdf-conflict" role="alert">
          <p>
            Outra sessão salvou uma versão diferente. Sua versão local permanece
            aqui. Mesclar conserva textos divergentes e usa sua página atual;
            revise antes de salvar.
          </p>
          <button
            onClick={() => {
              const merged = mergeReadingStates(
                base,
                readingRef.current,
                remoteConflict,
              );
              setBase(remoteConflict);
              setRemoteConflict(null);
              change(merged);
            }}
          >
            Mesclar e revisar
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Descartar o rascunho local e carregar a versão remota?",
                )
              ) {
                setReading(remoteConflict);
                setBase(remoteConflict);
                setPage(remoteConflict.page);
                setDirty(false);
                setRemoteConflict(null);
                setStatus("Versão remota carregada");
              }
            }}
          >
            Usar versão remota
          </button>
        </div>
      )}
      <div className="pdf-reader-body">
        <aside className="pdf-sidebar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label htmlFor="pdf-search">Buscar texto no livro</label>
            <div>
              <input
                id="pdf-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={200}
              />
              <button disabled={!pdf || !query.trim() || searching}>
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </form>
          {searching && (
            <button
              onClick={() => {
                searchGeneration.current++;
                setSearching(false);
              }}
            >
              Parar busca
            </button>
          )}
          {searchDone && !matches.length && (
            <p>
              Nenhum texto encontrado. PDFs de imagem exigem OCR habilitado na
              ingestão.
            </p>
          )}
          {matches.map((match) => (
            <button
              key={match.page}
              className="pdf-result"
              onClick={() => go(match.page)}
            >
              p. {match.page} — {match.excerpt}
            </button>
          ))}
          <h3>Sumário</h3>
          {outline.length ? (
            outline.map((item, index) => (
              <button
                className="pdf-outline"
                key={index}
                style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
                onClick={() => go(item.page)}
              >
                {item.title} <small>{item.page}</small>
              </button>
            ))
          ) : (
            <p>Este PDF não possui sumário navegável.</p>
          )}
          <h3>Marcadores</h3>
          {bookmarks.map((mark) => (
            <button key={mark.id} onClick={() => go(mark.page)}>
              ★ Página {mark.page}
            </button>
          ))}
          <h3>Anotações</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              change({
                ...reading,
                annotations: [
                  ...reading.annotations,
                  { id: crypto.randomUUID(), page, text: note.trim() },
                ],
              });
              setNote("");
            }}
          >
            <label htmlFor="pdf-note">Nota da página {page}</label>
            <textarea
              id="pdf-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={10000}
              disabled={!loaded}
            />
            <button
              disabled={
                !loaded || !note.trim() || reading.annotations.length >= 1000
              }
            >
              Adicionar nota
            </button>
          </form>
          {notes.map((annotation) => (
            <article className="pdf-note" key={annotation.id}>
              <button onClick={() => go(annotation.page)}>
                Página {annotation.page}
              </button>
              <p>{annotation.text}</p>
              <button
                onClick={() =>
                  change({
                    ...reading,
                    annotations: reading.annotations.filter(
                      (a) => a.id !== annotation.id,
                    ),
                  })
                }
              >
                Remover nota
              </button>
            </article>
          ))}
        </aside>
        <main className="pdf-canvas-region" aria-busy={rendering}>
          {!pdf && (
            <p role="status">
              {source
                ? `Abrindo arquivo autorizado… ${progress}%`
                : "Nenhum arquivo autorizado foi fornecido para este título."}
            </p>
          )}
          <canvas
            ref={canvas}
            aria-label={`Página ${page} do livro ${title}`}
          />
          {pdf && (
            <>
              <p className="pdf-render-note">
                Paginação original preservada · Página {page}
              </p>
              <details className="pdf-page-text">
                <summary>Texto acessível da página {page}</summary>
                <p>
                  {pageText ||
                    "Não há texto selecionável nesta página. Uma imagem exige OCR habilitado na ingestão."}
                </p>
              </details>
            </>
          )}
        </main>
      </div>
    </section>
  );
}
