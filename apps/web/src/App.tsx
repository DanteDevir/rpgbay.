import React, {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ElementType,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Crown,
  Dice5,
  Download,
  ExternalLink,
  Globe2,
  Heart,
  Home,
  Layers,
  Library,
  Loader2,
  Menu,
  MessageCircle,
  MonitorUp,
  Plus,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import "./style.css";
const PdfReader = lazy(() =>
  import("./PdfReader").then((module) => ({ default: module.PdfReader })),
);

type Item = Record<string, any>;
type Page =
  | "Início"
  | "Loja"
  | "Biblioteca"
  | "Mesas"
  | "Mundos"
  | "Comunidade"
  | "Downloads"
  | "Família"
  | "Editora"
  | "Configurações";
const navigation: { name: Page; icon: ElementType; tag?: string }[] = [
  { name: "Início", icon: Home },
  { name: "Loja", icon: ShoppingBag },
  { name: "Biblioteca", icon: Library },
  { name: "Mesas", icon: Dice5 },
  { name: "Mundos", icon: Globe2 },
  { name: "Comunidade", icon: Users },
  { name: "Downloads", icon: ArrowDownToLine },
];
const art = [
  "/art/astral.svg",
  "/art/ember.svg",
  "/art/wild.svg",
  "/art/void.svg",
  "/art/dawn.svg",
];
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const apiOrigin = import.meta.env.VITE_API_ORIGIN || "";
if (apiOrigin && new URL(apiOrigin).protocol !== "https:")
  throw new Error("VITE_API_ORIGIN deve usar HTTPS.");
const dev = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "true";
async function api(path: string, method = "GET", data?: unknown): Promise<any> {
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(dev ? { "x-dev-user": "dev-user" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await response
    .json()
    .catch(() => ({ message: "Não foi possível ler a resposta do servidor." }));
  if (!response.ok)
    throw new Error(
      body.message ||
        body.error?.message ||
        (typeof body.error === "string" ? body.error : "") ||
        `Falha na solicitação (${response.status})`,
    );
  return body;
}
export default function App() {
  const [page, setPage] = useState<Page>("Início");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [data, setData] = useState<Item[]>([]);
  const [profile, setProfile] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [cart, setCart] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("rpgbay-wishlist") || "[]");
    } catch {
      return [];
    }
  });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [family, setFamily] = useState<Item | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [roll, setRoll] = useState<Item | null>(null);
  const [activeTable, setActiveTable] = useState<Item | null>(null);
  const [activeWorld, setActiveWorld] = useState<Item | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [reader, setReader] = useState<Item | null>(null);
  useEffect(() => {
    api("/catalog")
      .then((r) => setCatalog(r.items || []))
      .catch((e) => setError(e.message));
    api("/me")
      .then(setProfile)
      .catch(() => {});
  }, []);
  useEffect(() => {
    setMobileMenu(false);
    setError("");
    setLoading(true);
    setActiveTable(null);
    setActiveWorld(null);
    const routes: Partial<Record<Page, string>> = {
      Biblioteca: "/library",
      Mesas: "/tables",
      Mundos: "/worlds",
      Comunidade: "/community",
      Família: "/family",
      Editora: "/publishers",
    };
    if (!routes[page]) {
      setData([]);
      setLoading(false);
      return;
    }
    api(routes[page]!)
      .then((r) => {
        if (page === "Família") setFamily(r);
        else setData(r.items || []);
      })
      .catch((e) => {
        setError(e.message);
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [page, refresh]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (video.current) video.current.srcObject = screen;
    return () => {};
  }, [screen, activeTable]);
  useEffect(
    () => () => {
      screen?.getTracks().forEach((t) => t.stop());
    },
    [screen],
  );
  useEffect(() => {
    localStorage.setItem("rpgbay-wishlist", JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[role=dialog] button,[role=dialog] a,[role=dialog] input,[role=dialog] select,[role=dialog] textarea",
          ),
        ).filter((x) => !x.hasAttribute("disabled"));
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handle);
      before?.focus();
    };
  }, [modal]);
  const changePage = (p: Page) => {
    setPage(p);
    setQuery("");
    setFilter("Todos");
  };
  const wish = (id: string) =>
    setFavorites((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  const selectProduct = (item: Item) => {
    setSelected(item);
    setModal("product");
  };
  const addCart = (item: Item) => {
    setCart((v) => (v.some((p) => p.id === item.id) ? v : [...v, item]));
    setNotice("Adicionado à sua sacola.");
    setModal(null);
  };
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>, kind: string) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    await run(async () => {
      if (kind === "table") {
        await api("/tables", "POST", {
          title: values.name,
          system: values.system,
          description: values.description,
        });
        setNotice("Mesa criada. Convide seu grupo e comece a jogar.");
      }
      if (kind === "world") {
        await api("/worlds", "POST", {
          title: values.name,
          description: values.description,
          visibility: "private",
        });
        setNotice("Seu mundo foi criado.");
      }
      if (kind === "post") {
        await api("/community", "POST", {
          title: values.name,
          body: values.description,
          system: values.system,
          category: "discussion",
        });
        setNotice("Discussão publicada.");
      }
      if (kind === "family") {
        await api("/family", "POST", { name: values.name });
        setNotice("Família criada.");
      }
      if (kind === "accept") {
        await api("/family/accept", "POST", { token: values.token });
        setNotice("Convite aceito. Bem-vindo à família.");
      }
      if (kind === "sheet") {
        await api(`/tables/${activeTable!.id}/sheets`, "POST", {
          name: values.name,
          system: activeTable!.system,
          fields: { forca: 10, destreza: 10, vida: 20 },
          visibility: "private",
        });
        setNotice("Ficha criada.");
        setActiveTable({
          ...activeTable,
          sheets: await api(`/tables/${activeTable!.id}/sheets`).then(
            (r) => r.items,
          ),
        });
      }
      if (kind === "entity") {
        await api(`/worlds/${activeWorld!.id}/pages`, "POST", {
          title: values.name,
          content: values.description,
          kind: values.kind,
          visibility: "private",
          tags: [],
        });
        setNotice("Página salva no mundo.");
        setActiveWorld({
          ...activeWorld,
          pages: await api(`/worlds/${activeWorld!.id}`).then((r) => r.pages),
        });
      }
      if (kind === "entity-edit") {
        await api(`/worlds/${activeWorld!.id}/pages/${selected!.id}`, "PUT", {
          title: values.name,
          content: values.description,
          tags: selected!.tags || [],
          links: selected!.links || [],
          visibility: selected!.visibility,
          version: selected!.version,
        });
        setActiveWorld({
          ...activeWorld,
          pages: await api(`/worlds/${activeWorld!.id}`).then((r) => r.pages),
        });
        setNotice(
          "Página atualizada. A versão anterior permanece no histórico.",
        );
      }
      if (kind === "sheet-edit") {
        let fields;
        try {
          fields = JSON.parse(String(values.fields));
        } catch {
          throw new Error("Os campos precisam ser um objeto JSON válido.");
        }
        await api(`/sheets/${selected!.id}`, "PUT", {
          name: values.name,
          fields,
          secretFields: selected!.secretFields || {},
          version: selected!.version,
        });
        setActiveTable({
          ...activeTable,
          sheets: await api(`/tables/${activeTable!.id}/sheets`).then(
            (r) => r.items,
          ),
        });
        setNotice("Ficha atualizada.");
      }
      setModal(null);
      if (!["sheet", "entity", "entity-edit", "sheet-edit"].includes(kind))
        setRefresh((v) => v + 1);
    });
  };
  const openTable = async (item: Item) => {
    await run(async () => {
      const sheets = await api(`/tables/${item.id}/sheets`);
      setActiveTable({ ...item, sheets: sheets.items || [] });
    });
  };
  const openWorld = async (item: Item) => {
    await run(async () => {
      const world = await api(`/worlds/${item.id}`);
      setActiveWorld({ ...world, pages: world.pages || [] });
    });
  };
  const shareScreen = () =>
    run(async () => {
      if (screen) {
        screen.getTracks().forEach((t) => t.stop());
        setScreen(null);
        return;
      }
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      s.getVideoTracks()[0].onended = () => setScreen(null);
      setScreen(s);
      setNotice(
        "Captura local ativa. A transmissão aos participantes exige o transporte WebRTC configurado.",
      );
    });
  const shown = catalog.filter(
    (x) =>
      `${x.title} ${x.system} ${x.publisher}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "Todos" ||
        (filter === "Favoritos" && favorites.includes(x.id)) ||
        x.system === filter ||
        x.format === filter),
  );
  function ProductCard({ item, index = 0 }: { item: Item; index?: number }) {
    return (
      <article className="product-card">
        <button
          className="book-art"
          onClick={() => selectProduct(item)}
          style={{ backgroundImage: `url(${art[index % art.length]})` }}
        >
          <span className="cover-imprint">LETARGIA RPG · EDIÇÃO DIGITAL</span>
          <strong>{item.title}</strong>
          <span className="cover-bottom">
            {item.system || "UNIVERSOS ORIGINAIS"}
          </span>
          {index === 0 && <span className="cover-badge">DESTAQUE</span>}
        </button>
        <button
          aria-label={
            favorites.includes(item.id) ? "Remover dos favoritos" : "Favoritar"
          }
          className={`wishlist ${favorites.includes(item.id) ? "saved" : ""}`}
          onClick={() => wish(item.id)}
        >
          <Heart size={16} />
        </button>
        <span className="eyebrow">
          {item.system || "Sistema independente"} <span>•</span>{" "}
          {item.format || "Livro digital"}
        </span>
        <button className="product-title" onClick={() => selectProduct(item)}>
          {item.title}
        </button>
        <div className="product-footer">
          <span>{item.priceCents ? money(item.priceCents) : "Gratuito"}</span>
          <button
            title="Ver produto"
            aria-label={`Ver ${item.title}`}
            onClick={() => selectProduct(item)}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </article>
    );
  }
  function PageHeading({
    eyebrow,
    title,
    description,
    action,
    icon: Icon = Plus,
    onClick,
  }: {
    eyebrow: string;
    title: string;
    description: string;
    action?: string;
    icon?: ElementType;
    onClick?: () => void;
  }) {
    return (
      <div className="page-heading">
        <div>
          <span className="eyebrow accent">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action && (
          <button className="primary" onClick={onClick}>
            <Icon size={17} />
            {action}
          </button>
        )}
      </div>
    );
  }
  function Empty({
    icon: Icon,
    title,
    text,
    action,
    onClick,
  }: {
    icon: ElementType;
    title: string;
    text: string;
    action?: string;
    onClick?: () => void;
  }) {
    return (
      <div className="empty">
        <span>
          <Icon size={30} />
        </span>
        <h3>{title}</h3>
        <p>{text}</p>
        {action && (
          <button className="primary" onClick={onClick}>
            {action}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    );
  }
  function Field({
    label,
    name,
    placeholder,
    area = false,
    value,
  }: {
    label: string;
    name: string;
    placeholder?: string;
    area?: boolean;
    value?: string;
  }) {
    return (
      <label className="field">
        {label}
        {area ? (
          <textarea
            name={name}
            placeholder={placeholder}
            required
            maxLength={10000}
            defaultValue={value}
          />
        ) : (
          <input
            name={name}
            placeholder={placeholder}
            required
            maxLength={120}
            defaultValue={value}
          />
        )}
      </label>
    );
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside aria-label="Navegação principal" className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => changePage("Início")}
          aria-label="RPG BAY início"
        >
          <span className="brand-icon">
            <Layers size={25} />
          </span>
          <span>
            RPG<span className="brand-light">BAY</span>
            <small>SEU UNIVERSO DE RPG</small>
          </span>
        </button>
        <div className="nav-label">EXPLORAR</div>
        <nav aria-label="Explorar">
          {navigation.map((n) => (
            <button
              key={n.name}
              className={page === n.name ? "active" : ""}
              onClick={() => changePage(n.name)}
            >
              <n.icon size={19} />
              {n.name}
              {n.name === "Loja" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-rule" />
        <div className="nav-label">SEU ESPAÇO</div>
        <nav aria-label="Seu espaço">
          <button
            className={page === "Família" ? "active" : ""}
            onClick={() => changePage("Família")}
          >
            <Users size={19} />
            Minha família
          </button>
          <button
            className={page === "Editora" ? "active" : ""}
            onClick={() => changePage("Editora")}
          >
            <BookOpen size={19} />
            Área da editora
            <ExternalLink size={12} className="push" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="pass-mini">
            <Crown size={21} />
            <strong>
              Mais possibilidades.
              <br />
              Mais BAY.
            </strong>
            <p>Conheça os benefícios do BAY PASS.</p>
            <button onClick={() => setModal("pass")}>
              Explorar BAY PASS <ArrowRight size={14} />
            </button>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => changePage("Configurações")}
          >
            <Settings size={17} />
            Configurações
            <CircleHelp size={16} className="push" />
          </button>
          <div className="made-by">
            UMA INICIATIVA <strong>LETARGIA RPG</strong>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Seu próximo universo <ChevronRight size={13} /> <b>{page}</b>
            </span>
          </div>
          <label className="global-search">
            <Search size={17} />
            <input
              aria-label="Buscar no catálogo"
              placeholder="Busque livros, sistemas, aventuras..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (page !== "Início" && page !== "Loja") setPage("Loja");
              }}
            />
            <kbd>⌕</kbd>
          </label>
          <div className="top-actions">
            <button
              className="icon-button cart-button"
              aria-label={`Sacola com ${cart.length} itens`}
              onClick={() => setModal("cart")}
            >
              <ShoppingCart size={20} />
              {cart.length > 0 && <span>{cart.length}</span>}
            </button>
            <button
              className="icon-button notification"
              aria-label="Notificações"
              onClick={() => setModal("notifications")}
            >
              <Bell size={20} />
            </button>
            <span className="top-divider" />
            <button className="account" onClick={() => setModal("account")}>
              <span className="avatar">
                {(profile?.displayName || "AV").slice(0, 2).toUpperCase()}
              </span>
              <span>
                {profile?.displayName || "Aventureiro"}
                <small>
                  {dev ? "Ambiente de desenvolvimento" : "Conecte seu NAJA ID"}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        {dev && (
          <aside
            className="dev-banner"
            aria-label="Ambiente de desenvolvimento"
          >
            <span />
            Ambiente de desenvolvimento · catálogo demonstrativo · nenhuma
            cobrança real
          </aside>
        )}
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="error-box" role="alert">
              <XCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setRefresh((x) => x + 1)}>
                Tentar novamente
              </button>
            </div>
          )}
          {(page === "Início" || page === "Loja") && (
            <>
              {page === "Início" ? (
                <>
                  <div className="welcome-line">
                    <span>
                      <span className="status-dot" /> BEM-VINDO À RPG BAY
                    </span>
                    <span>
                      Histórias extraordinárias começam com uma boa mesa.
                    </span>
                  </div>
                  <section className="hero">
                    <div className="hero-art" />
                    <div className="hero-shade" />
                    <div className="hero-content">
                      <span className="pill">
                        <Sparkles size={13} /> PARA QUEM VIVE OUTRAS HISTÓRIAS
                      </span>
                      <h1>
                        Todo grande mundo
                        <br />
                        começa com <em>você.</em>
                      </h1>
                      <p>
                        Descubra seu próximo livro, reúna sua mesa
                        <br className="desktop" /> e dê vida às histórias que
                        ainda não existem.
                      </p>
                      <div className="hero-buttons">
                        <button
                          className="primary"
                          onClick={() => changePage("Loja")}
                        >
                          Explore a loja <ArrowRight size={17} />
                        </button>
                        <button
                          className="hero-secondary"
                          onClick={() => {
                            changePage("Mesas");
                            setModal("table");
                          }}
                        >
                          <Dice5 size={18} />
                          Crie sua mesa
                        </button>
                      </div>
                      <div className="hero-foot">
                        <span className="mini-symbol">
                          <BookOpen size={15} />
                        </span>{" "}
                        Sua biblioteca. Sua mesa. Seu universo.
                      </div>
                    </div>
                    <div className="hero-annotation">
                      <span>UNIVERSOS PARA DESCOBRIR</span>
                      <strong>Além do horizonte</strong>
                      <small>Arte original · RPG BAY</small>
                    </div>
                    <div className="hero-pagination">
                      <span className="current" />
                      <span />
                      <span />
                    </div>
                  </section>
                  <section className="quick-links">
                    {[
                      {
                        icon: BookOpen,
                        title: "Sua próxima leitura",
                        text: "Histórias para todos os sistemas",
                        p: "Loja",
                      },
                      {
                        icon: Dice5,
                        title: "A aventura é em grupo",
                        text: "Sua mesa, do seu jeito",
                        p: "Mesas",
                      },
                      {
                        icon: Globe2,
                        title: "Crie algo extraordinário",
                        text: "Dê um lugar às suas ideias",
                        p: "Mundos",
                      },
                    ].map((l, i) => (
                      <button
                        key={l.title}
                        onClick={() => changePage(l.p as Page)}
                      >
                        <span className={`quick-icon quick-${i}`}>
                          <l.icon size={22} />
                        </span>
                        <span>
                          <strong>{l.title}</strong>
                          <small>{l.text}</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </section>
                </>
              ) : (
                <PageHeading
                  eyebrow="MARKETPLACE"
                  title="Uma nova história te espera."
                  description="Livros, aventuras e ferramentas para expandir o seu universo."
                />
              )}
              <section className="catalog-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow accent">
                      ESCOLHIDOS PARA A SUA PRÓXIMA SESSÃO
                    </span>
                    <h2>
                      {query
                        ? "Resultados da busca"
                        : "Explore novos universos"}
                      <Sparkles size={19} />
                    </h2>
                  </div>
                  {page === "Início" && (
                    <button
                      className="text-button"
                      onClick={() => changePage("Loja")}
                    >
                      Ver toda a loja <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                <div className="filter-row">
                  {[
                    "Todos",
                    "Fantasia",
                    "Ficção científica",
                    "Terror",
                    "Favoritos",
                  ].map((f) => (
                    <button
                      className={filter === f ? "selected" : ""}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f === "Todos" && <Compass size={14} />} {f}
                    </button>
                  ))}
                  <span className="filter-count">{shown.length} títulos</span>
                </div>
                <div className="product-grid">
                  {shown.map((item, index) => (
                    <ProductCard key={item.id} item={item} index={index} />
                  ))}
                </div>
                {!shown.length && (
                  <Empty
                    icon={Search}
                    title={
                      catalog.length
                        ? "Nenhum título encontrado"
                        : "O catálogo está sendo preparado"
                    }
                    text={
                      catalog.length
                        ? "Experimente outra busca ou categoria."
                        : "Os títulos publicados aparecerão aqui quando houver arquivos e entrega disponíveis."
                    }
                  />
                )}
              </section>
              <section className="world-banner">
                <div>
                  <span className="eyebrow accent">
                    O PRÓXIMO CAPÍTULO É SEU
                  </span>
                  <h2>A imaginação não precisa de licença.</h2>
                  <p>
                    Crie mesas, personagens e mundos. Comece a jogar sem comprar
                    um livro.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    changePage("Mesas");
                    setModal("table");
                  }}
                >
                  Comece sua aventura <ArrowRight size={16} />
                </button>
                <Dice5 className="banner-dice" size={130} />
              </section>
            </>
          )}
          {page === "Biblioteca" && (
            <>
              <PageHeading
                eyebrow="SEU ACERVO"
                title="Todas as suas histórias."
                description="Compras, livros gratuitos e acesso familiar em um só lugar."
                action="Explorar a loja"
                icon={ShoppingBag}
                onClick={() => changePage("Loja")}
              />
              {loading ? (
                <div className="loading">
                  <Loader2 className="spin" /> Carregando sua biblioteca
                </div>
              ) : data.length ? (
                <div className="product-grid">
                  {data.map((x, i) => (
                    <article key={x.id || i} className="library-card">
                      <div
                        className="library-cover"
                        style={{ backgroundImage: `url(${art[i % 5]})` }}
                      >
                        <h2>{x.title}</h2>
                      </div>
                      <h3>{x.title}</h3>
                      <span className="eyebrow">
                        {x.source === "family"
                          ? "Compartilhado pela família"
                          : "Sua biblioteca"}
                      </span>
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            setReader({
                              id: x.productId || x.id,
                              title: x.title,
                              source:
                                dev && x.id.startsWith("20000000-")
                                  ? `${apiOrigin}/api/development/books/${x.id}/content`
                                  : `${apiOrigin}/api/library/${x.productId || x.id}/download`,
                            });
                          })
                        }
                      >
                        <BookOpen size={16} />
                        Abrir leitor
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Library}
                  title="Sua próxima leitura começa aqui"
                  text="Os livros adquiridos e compartilhados aparecem nesta biblioteca, com o estado real de acesso e download."
                  action="Descobrir livros"
                  onClick={() => changePage("Loja")}
                />
              )}
            </>
          )}
          {page === "Mesas" && (
            <>
              <PageHeading
                eyebrow="REÚNA SEU GRUPO"
                title={
                  activeTable ? activeTable.title : "É hora de rolar os dados."
                }
                description={
                  activeTable
                    ? `${activeTable.system || "Sistema livre"} · Sua mesa de RPG`
                    : "Crie até 15 mesas ativas. Nenhuma compra de livro é necessária."
                }
                action={activeTable ? "Voltar às mesas" : "Nova mesa"}
                icon={activeTable ? ArrowLeft : Plus}
                onClick={() =>
                  activeTable ? setActiveTable(null) : setModal("table")
                }
              />
              {activeTable ? (
                <div className="session-layout">
                  <section className="session-stage">
                    <div className="session-sky" />
                    <span className="pill">
                      <span className="status-dot" />
                      ESPAÇO DA SESSÃO
                    </span>
                    <h2>{activeTable.title}</h2>
                    <p>
                      {activeTable.description ||
                        "Toda aventura começa com uma boa história."}
                    </p>
                    {screen && (
                      <video
                        ref={video}
                        autoPlay
                        muted
                        playsInline
                        className="screen-preview"
                      />
                    )}
                    <div className="session-toolbar">
                      <button
                        onClick={() =>
                          run(async () => {
                            const r = await api(
                              `/tables/${activeTable.id}/rolls`,
                              "POST",
                              { expression: "1d20" },
                            );
                            setRoll(r);
                          })
                        }
                      >
                        <Dice5 />
                        Rolar d20
                      </button>
                      <button onClick={() => setModal("sheet")}>
                        <Plus />
                        Personagem
                      </button>
                      <button onClick={shareScreen}>
                        <MonitorUp />
                        {screen ? "Parar captura" : "Compartilhar tela"}
                      </button>
                      <button onClick={() => setModal("discord")}>
                        <Volume2 />
                        Voz
                      </button>
                    </div>
                    {roll && (
                      <div className="dice-result">
                        <Dice5 size={26} />
                        <strong>
                          {roll.total ??
                            roll.result?.total ??
                            JSON.stringify(roll.result)}
                        </strong>
                        <span>Rolagem registrada no servidor</span>
                      </div>
                    )}
                  </section>
                  <aside className="detail-panel">
                    <h3>
                      Personagens <span>{activeTable.sheets?.length || 0}</span>
                    </h3>
                    {activeTable.sheets?.map((s: Item) => (
                      <div className="sheet-item" key={s.id}>
                        <span className="avatar">
                          <Shield size={17} />
                        </span>
                        <div>
                          <strong>{s.name}</strong>
                          <small>Ficha privada · {s.system || "Livre"}</small>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Ver ficha"
                          onClick={() => {
                            setSelected(s);
                            setModal("sheet-detail");
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="dashed-button"
                      onClick={() => setModal("sheet")}
                    >
                      <Plus size={16} />
                      Criar personagem
                    </button>
                    <p className="muted">
                      As permissões de cada ficha são verificadas pelo servidor.
                    </p>
                  </aside>
                </div>
              ) : loading ? (
                <div className="loading">
                  <Loader2 className="spin" />
                  Carregando mesas
                </div>
              ) : data.length ? (
                <div className="entity-grid">
                  {data.map((x, i) => (
                    <button
                      className="table-card"
                      key={x.id}
                      onClick={() => openTable(x)}
                    >
                      <div
                        className="table-image"
                        style={{ backgroundImage: `url(${art[i % 5]})` }}
                      >
                        <span className="pill">
                          {x.system || "SISTEMA LIVRE"}
                        </span>
                        <Dice5 size={28} />
                      </div>
                      <div className="table-info">
                        <h3>{x.title || x.name}</h3>
                        <p>
                          {x.description || "Uma história esperando por vocês."}
                        </p>
                        <span>
                          Abrir mesa
                          <ArrowRight size={16} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Dice5}
                  title="Seu grupo só precisa de um começo"
                  text="Prepare a mesa, crie personagens e role os dados. Tudo no mesmo espaço."
                  action="Criar minha primeira mesa"
                  onClick={() => setModal("table")}
                />
              )}
            </>
          )}
          {page === "Mundos" && (
            <>
              <PageHeading
                eyebrow="CRIAÇÃO DE MUNDOS"
                title={
                  activeWorld
                    ? activeWorld.title
                    : "Dê um lugar à sua imaginação."
                }
                description="Personagens, lugares e histórias conectados. Seus mundos continuam além de uma campanha."
                action={activeWorld ? "Voltar aos mundos" : "Novo mundo"}
                icon={activeWorld ? ArrowLeft : Plus}
                onClick={() =>
                  activeWorld ? setActiveWorld(null) : setModal("world")
                }
              />
              {activeWorld ? (
                <>
                  <div className="world-actions">
                    <button
                      className="primary"
                      onClick={() => setModal("entity")}
                    >
                      <Plus size={17} />
                      Nova página
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        run(async () => {
                          const result = await api(
                            `/worlds/${activeWorld.id}/export`,
                          );
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(
                            new Blob([JSON.stringify(result, null, 2)], {
                              type: "application/json",
                            }),
                          );
                          a.download = "mundo-rpgbay.json";
                          a.click();
                          URL.revokeObjectURL(a.href);
                        })
                      }
                    >
                      <Download size={16} />
                      Exportar conteúdo autoral
                    </button>
                  </div>
                  <div className="entity-grid">
                    {activeWorld.pages?.map((p: Item) => (
                      <article key={p.id} className="world-page">
                        <span className="eyebrow accent">
                          {p.kind || "Artigo"} · PRIVADO
                        </span>
                        <h2>{p.title}</h2>
                        <p>{p.content}</p>
                        <span className="muted">Versão {p.version || 1}</span>
                        <div
                          className="world-actions"
                          style={{ marginTop: 15, marginBottom: 0 }}
                        >
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelected(p);
                              setModal("entity-edit");
                            }}
                          >
                            Editar página
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              run(async () => {
                                const h = await api(
                                  `/worlds/${activeWorld.id}/pages/${p.id}/history`,
                                );
                                setSelected({ ...p, history: h.items });
                                setModal("history");
                              })
                            }
                          >
                            Histórico
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!activeWorld.pages?.length && (
                    <Empty
                      icon={BookOpen}
                      title="Escreva o primeiro capítulo"
                      text="Comece com uma cidade, uma personagem ou o segredo que move o seu mundo."
                      action="Criar página"
                      onClick={() => setModal("entity")}
                    />
                  )}
                </>
              ) : data.length ? (
                <div className="entity-grid">
                  {data.map((x, i) => (
                    <button
                      className="world-card"
                      key={x.id}
                      style={{
                        backgroundImage: `linear-gradient(0deg,#10131e,transparent),url(${art[i % 5]})`,
                      }}
                      onClick={() => openWorld(x)}
                    >
                      <span className="eyebrow">MUNDO PRIVADO</span>
                      <h2>{x.title || x.name}</h2>
                      <p>{x.description}</p>
                      <span>
                        Explorar mundo <ArrowRight size={17} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Globe2}
                  title="Aqui pode nascer um universo"
                  text="Organize locais, personagens, facções, eventos e artigos com privacidade e histórico."
                  action="Criar meu primeiro mundo"
                  onClick={() => setModal("world")}
                />
              )}
            </>
          )}
          {page === "Comunidade" && (
            <>
              <PageHeading
                eyebrow="HISTÓRIAS SE CONSTROEM JUNTAS"
                title="Encontre a sua party."
                description="Converse sobre sistemas, compartilhe ideias e encontre outras pessoas para jogar."
                action="Nova discussão"
                onClick={() => setModal("post")}
              />
              <div className="community-layout">
                <section>
                  {data.length ? (
                    data.map((x) => (
                      <article className="post-card" key={x.id}>
                        <div className="post-author">
                          <span className="avatar">
                            {(x.authorName || "AV").slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            {x.authorName || "Aventureiro"}
                            <small>
                              {new Date(
                                x.createdAt || Date.now(),
                              ).toLocaleDateString("pt-BR")}
                            </small>
                          </span>
                          <span className="pill">
                            {x.system || "Conversa geral"}
                          </span>
                        </div>
                        <h2>{x.title}</h2>
                        <p>{x.body}</p>
                        <button
                          className="text-button"
                          onClick={() =>
                            run(async () => {
                              await api("/reports", "POST", {
                                entityType: "post",
                                entityId: x.id,
                                reason: "Solicitação de revisão pela moderação",
                              });
                              setNotice("Denúncia enviada para revisão.");
                            })
                          }
                        >
                          <Shield size={14} />
                          Solicitar moderação
                        </button>
                      </article>
                    ))
                  ) : (
                    <Empty
                      icon={MessageCircle}
                      title="Toda boa conversa começa com alguém"
                      text="Publique uma discussão e conecte-se com a comunidade."
                      action="Começar uma conversa"
                      onClick={() => setModal("post")}
                    />
                  )}
                </section>
                <aside className="detail-panel">
                  <span className="eyebrow accent">NOSSA COMUNIDADE</span>
                  <h3>Um lugar para todo grupo.</h3>
                  <p>
                    Respeite as pessoas, os direitos autorais e os limites de
                    cada mesa. Não compartilhe informações privadas.
                  </p>
                  <Shield size={28} className="accent" />
                  <p className="muted">
                    Denúncias seguem para revisão humana. Conteúdo pode ser
                    removido com motivo registrado.
                  </p>
                </aside>
              </div>
            </>
          )}
          {page === "Família" && (
            <>
              <PageHeading
                eyebrow="HISTÓRIAS COMPARTILHADAS"
                title="Uma biblioteca. Até cinco pessoas."
                description="Compartilhe o acesso aos livros elegíveis sem transferir a propriedade das suas compras."
                action={family?.id ? "Convidar pessoa" : undefined}
                onClick={() =>
                  run(async () => {
                    const invite = await api("/family/invites", "POST", {});
                    setSelected(invite);
                    setModal("invite");
                  })
                }
              />
              {family?.id ? (
                <div className="detail-panel family-panel">
                  <Users size={32} className="accent" />
                  <h2>{family.name || "Minha família"}</h2>
                  <p>{family.members?.length || 1} de 5 integrantes</p>
                  {family.members?.map((m: Item) => (
                    <div key={m.id || m.userId} className="sheet-item">
                      <span className="avatar">
                        {(m.displayName || m.userId || "AV")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <strong>{m.displayName || m.userId}</strong>
                      <span className="pill">{m.role || "Membro"}</span>
                    </div>
                  ))}
                  <p className="muted">
                    Mesas e família são independentes. Assinaturas, pontos e
                    dedicatórias privadas não são compartilhados.
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      run(async () => {
                        await api(
                          family.owner_id === profile?.id
                            ? "/family"
                            : `/family/members/${profile?.id}`,
                          "DELETE",
                        );
                        setRefresh((v) => v + 1);
                        setNotice(
                          "Você saiu da família. Suas compras próprias continuam na sua conta.",
                        );
                      })
                    }
                  >
                    Sair da família
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    className="text-button"
                    style={{ marginBottom: 20 }}
                    onClick={() => setModal("accept")}
                  >
                    Já recebeu um convite? Aceitar convite{" "}
                    <ArrowRight size={15} />
                  </button>
                  <Empty
                    icon={Users}
                    title="As melhores histórias merecem companhia"
                    text="Crie uma família de até cinco integrantes, incluindo você. Amigos também podem participar."
                    action="Criar minha família"
                    onClick={() => setModal("family")}
                  />
                </div>
              )}
            </>
          )}
          {page === "Downloads" && (
            <>
              <PageHeading
                eyebrow="SUA BIBLIOTECA VAI COM VOCÊ"
                title="Pronto para a próxima sessão."
                description="Gerencie o espaço e os arquivos preparados para leitura offline."
              />
              <Empty
                icon={Download}
                title="Nenhum download neste navegador"
                text="O pacote gerenciado de leitura offline é preparado pelo launcher. Arquivos privados exigem licença e integridade verificadas."
              />
              <div className="info-card">
                <Shield size={24} />
                <div>
                  <h3>Conteúdo protegido, acesso transparente</h3>
                  <p>
                    Compras e biblioteca familiar têm políticas distintas de
                    renovação offline. O uso de armazenamento e a validade da
                    licença devem ser exibidos pelo cliente nativo.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "Editora" && (
            <>
              <PageHeading
                eyebrow="ÁREA EDITORIAL"
                title="Suas histórias merecem leitores."
                description="Catálogo, versões, playtests, presentes e financeiro da sua editora."
              />
              <Empty
                icon={BookOpen}
                title={
                  data.length
                    ? "Selecione uma editora"
                    : "Nenhuma editora vinculada"
                }
                text="O acesso editorial depende de uma equipe autorizada. Recebimentos exigem cadastro e aprovação do provedor de pagamentos."
              />
              {data.map((x) => (
                <article className="info-card" key={x.id}>
                  <BookOpen />
                  <div>
                    <h3>{x.title || x.name}</h3>
                    <p>{x.description}</p>
                  </div>
                </article>
              ))}
            </>
          )}
          {page === "Configurações" && (
            <>
              <PageHeading
                eyebrow="SEU ESPAÇO, DO SEU JEITO"
                title="Pequenas escolhas. Mais conforto."
                description="Preferências locais de leitura e acessibilidade."
              />
              <div className="settings-grid">
                <section className="detail-panel">
                  <h3>Aparência e leitura</h3>
                  <label className="field">
                    Tamanho de texto
                    <select
                      onChange={(e) => {
                        document.documentElement.style.fontSize =
                          e.target.value;
                        localStorage.setItem("rpgbay-font", e.target.value);
                      }}
                      defaultValue={
                        localStorage.getItem("rpgbay-font") || "16px"
                      }
                    >
                      <option value="16px">Padrão</option>
                      <option value="18px">Grande</option>
                      <option value="20px">Maior</option>
                    </select>
                  </label>
                  <label className="field">
                    Fuso horário
                    <select
                      defaultValue={profile?.timezone || "America/Sao_Paulo"}
                      onChange={(e) =>
                        run(async () => {
                          if (!profile)
                            throw new Error("Entre para salvar preferências.");
                          const r = await api("/me", "PATCH", {
                            displayName: profile.displayName,
                            bio: profile.bio,
                            timezone: e.target.value,
                            favoriteSystems: profile.favoriteSystems,
                          });
                          setProfile(r);
                          setNotice("Preferência salva.");
                        })
                      }
                    >
                      <option>America/Sao_Paulo</option>
                      <option>Etc/UTC</option>
                    </select>
                  </label>
                  <p className="muted">
                    Idioma: Português (Brasil). Valores em reais. Instantes são
                    armazenados em UTC.
                  </p>
                </section>
                <section className="detail-panel">
                  <Shield size={26} className="accent" />
                  <h3>Identidade e privacidade</h3>
                  <p>
                    Seu acesso é feito pelo NAJA ID. O perfil da RPG BAY não
                    altera sua identidade corporativa.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setModal("account")}
                  >
                    Gerenciar acesso <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          <footer>
            <span>
              <Layers size={16} />
              <b>RPG BAY</b>
              <span>Seu próximo universo.</span>
            </span>
            <div>
              <button onClick={() => setModal("terms")}>
                Termos e privacidade
              </button>
              <span>LETARGIA RPG · LibBay / NAJA</span>
            </div>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação mobile">
        {navigation.slice(0, 5).map((n) => (
          <button
            key={n.name}
            onClick={() => changePage(n.name)}
            className={page === n.name ? "active" : ""}
          >
            <n.icon size={20} />
            <span>{n.name}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={`modal ${modal === "product" ? "product-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Janela RPG BAY"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Fechar"
              autoFocus
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {[
              "table",
              "world",
              "post",
              "family",
              "accept",
              "sheet",
              "entity",
              "entity-edit",
              "sheet-edit",
            ].includes(modal) && (
              <form onSubmit={(e) => submit(e, modal)}>
                <span className="eyebrow accent">UM NOVO CAPÍTULO</span>
                <h2>
                  {
                    {
                      table: "Prepare sua mesa",
                      world: "Crie seu mundo",
                      post: "Comece uma conversa",
                      family: "Crie sua família",
                      accept: "Aceitar convite",
                      sheet: "Novo personagem",
                      entity: "Nova página",
                      "entity-edit": "Editar página",
                      "sheet-edit": "Editar personagem",
                    }[modal]
                  }
                </h2>
                {modal === "accept" ? (
                  <Field
                    label="Código do convite"
                    name="token"
                    placeholder="Cole seu convite privado"
                  />
                ) : (
                  <Field
                    label={modal === "entity" ? "Título" : "Nome"}
                    name="name"
                    placeholder="Como essa história começa?"
                    value={
                      modal.endsWith("-edit")
                        ? selected?.title || selected?.name
                        : undefined
                    }
                  />
                )}
                {["table", "post"].includes(modal) && (
                  <Field
                    label="Sistema"
                    name="system"
                    placeholder="Sistema livre, fantasia, ficção científica..."
                  />
                )}
                {modal === "entity" && (
                  <label className="field">
                    Tipo de página
                    <select name="kind">
                      <option value="article">Artigo</option>
                      <option value="character">Personagem</option>
                      <option value="location">Local</option>
                      <option value="faction">Facção</option>
                      <option value="event">Evento</option>
                      <option value="item">Item</option>
                    </select>
                  </label>
                )}
                {["table", "world", "post", "entity", "entity-edit"].includes(
                  modal,
                ) && (
                  <Field
                    label={modal === "entity" ? "Conteúdo" : "Descrição"}
                    name="description"
                    area
                    placeholder="Conte um pouco mais..."
                    value={
                      modal === "entity-edit" ? selected?.content : undefined
                    }
                  />
                )}
                {modal === "sheet-edit" && (
                  <Field
                    label="Campos personalizados (JSON: texto, números e listas)"
                    name="fields"
                    area
                    value={JSON.stringify(selected?.fields || {}, null, 2)}
                  />
                )}
                <div className="form-note">
                  <Shield size={15} />
                  {modal === "post"
                    ? "Publicações seguem as regras da comunidade."
                    : "Dados privados por padrão. Você controla com quem compartilhar."}
                </div>
                <button className="primary submit-button" type="submit">
                  {modal === "accept"
                    ? "Aceitar convite"
                    : modal.endsWith("-edit")
                      ? "Salvar alterações"
                      : "Criar"}
                  <ArrowRight size={17} />
                </button>
              </form>
            )}
            {modal === "invite" && selected && (
              <>
                <Users size={30} className="accent" />
                <h2>Histórias ficam melhores juntas.</h2>
                <p>
                  Compartilhe este código apenas com quem você deseja convidar.
                  Ele dá acesso a um convite privado e expira em sete dias.
                </p>
                <label className="field">
                  Código do convite
                  <input readOnly value={selected.token} />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(selected.token);
                      setNotice("Código copiado.");
                    })
                  }
                >
                  Copiar código
                </button>
              </>
            )}
            {modal === "product" && selected && (
              <>
                <div
                  className="modal-cover"
                  style={{
                    backgroundImage: `url(${art[catalog.findIndex((x) => x.id === selected.id) % 5] || art[0]})`,
                  }}
                >
                  <span>LETARGIA RPG</span>
                  <h2>{selected.title}</h2>
                </div>
                <div className="modal-product-content">
                  <span className="eyebrow accent">
                    {selected.system} · {selected.format || "Livro digital"}
                  </span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.description ||
                      "Uma nova história para a sua mesa."}
                  </p>
                  <div className="product-meta">
                    <span>
                      <BookOpen size={15} />
                      Leitura na biblioteca RPG BAY
                    </span>
                    <span>
                      <Users size={15} />
                      Compartilhamento sujeito à licença editorial
                    </span>
                    <span>
                      <Shield size={15} />A compra não é necessária para jogar
                    </span>
                  </div>
                  <h2>{money(selected.priceCents || 0)}</h2>
                  <button
                    className="primary"
                    onClick={() =>
                      selected.priceCents
                        ? addCart(selected)
                        : run(async () => {
                            await api(
                              `/library/claim/${selected.id}`,
                              "POST",
                              {},
                            );
                            setModal(null);
                            setNotice("Título adicionado à sua biblioteca.");
                            changePage("Biblioteca");
                            setRefresh((v) => v + 1);
                          })
                    }
                  >
                    {selected.priceCents ? (
                      <ShoppingCart size={17} />
                    ) : (
                      <Library size={17} />
                    )}{" "}
                    {selected.priceCents
                      ? "Adicionar à sacola"
                      : "Adicionar à biblioteca"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => wish(selected.id)}
                  >
                    <Heart size={16} />
                    {favorites.includes(selected.id)
                      ? "Salvo nos favoritos"
                      : "Salvar nos favoritos"}
                  </button>
                </div>
              </>
            )}
            {modal === "cart" && (
              <>
                <span className="eyebrow accent">SUA PRÓXIMA AVENTURA</span>
                <h2>
                  Sua sacola <span className="muted">({cart.length})</span>
                </h2>
                {cart.length ? (
                  cart.map((x) => (
                    <div className="cart-row" key={x.id}>
                      <BookOpen size={22} />
                      <div>
                        <strong>{x.title}</strong>
                        <small>{money(x.priceCents || 0)}</small>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Remover ${x.title}`}
                        onClick={() =>
                          setCart((c) => c.filter((y) => y.id !== x.id))
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p>Sua sacola está esperando uma boa história.</p>
                )}
                {cart.length > 0 && (
                  <>
                    <div className="cart-total">
                      Total{" "}
                      <strong>
                        {money(
                          cart.reduce((s, x) => s + (x.priceCents || 0), 0),
                        )}
                      </strong>
                    </div>
                    <button
                      className="primary submit-button"
                      onClick={() =>
                        run(async () => {
                          const result = await api(
                            "/payments/checkout",
                            "POST",
                            {
                              productIds: cart.map((x) => x.id),
                              provider: "stripe",
                              idempotencyKey: crypto.randomUUID(),
                            },
                          );
                          if (result.checkoutUrl)
                            window.location.assign(result.checkoutUrl);
                          else
                            throw new Error(
                              "Checkout não disponível. Nenhuma cobrança foi realizada.",
                            );
                        })
                      }
                    >
                      Ir para checkout <ArrowRight size={16} />
                    </button>
                    <p className="muted">
                      A licença só é liberada após a confirmação do provedor.
                      Nenhum dado de cartão é armazenado aqui.
                    </p>
                  </>
                )}
              </>
            )}
            {modal === "account" && (
              <>
                <Shield size={32} className="accent" />
                <h2>Um acesso. Novos universos.</h2>
                <p>
                  Entre com seu NAJA ID para sincronizar sua biblioteca, suas
                  mesas e seus mundos.
                </p>
                {dev ? (
                  <div className="form-note">
                    Sessão de desenvolvimento isolada. Este acesso não existe em
                    produção.
                  </div>
                ) : (
                  <a className="primary" href="/api/auth/login">
                    Entrar com NAJA ID <ArrowRight size={17} />
                  </a>
                )}
                {profile && (
                  <button
                    className="secondary"
                    onClick={() =>
                      run(async () => {
                        await api("/auth/logout", "POST", {});
                        setProfile(null);
                        setModal(null);
                        setNotice("Sessão encerrada.");
                      })
                    }
                  >
                    Encerrar sessão
                  </button>
                )}
              </>
            )}
            {modal === "notifications" && (
              <>
                <Bell size={28} className="accent" />
                <h2>Você está em dia.</h2>
                <p>
                  Confirmações de pedidos, convites e atualizações da sua
                  biblioteca aparecerão aqui quando a central de notificações
                  estiver conectada.
                </p>
              </>
            )}
            {modal === "pass" && (
              <>
                <Crown size={34} className="accent" />
                <span className="eyebrow accent">BAY PASS</span>
                <h2>Mais espaço para imaginar.</h2>
                <p>
                  Personalizações, mais capacidade de uploads e benefícios
                  configuráveis. A assinatura não inclui automaticamente todos
                  os livros.
                </p>
                <div className="form-note">
                  Planos e preços dependem de aprovação comercial. A contratação
                  ainda não está disponível.
                </div>
              </>
            )}
            {modal === "discord" && (
              <>
                <Volume2 size={32} className="accent" />
                <h2>A voz aproxima a sua mesa.</h2>
                <p>
                  A comunicação integrada depende do Discord Social SDK nativo
                  autorizado. Este navegador não executa a ponte nativa e
                  nenhuma chamada foi iniciada.
                </p>
                <a
                  className="secondary"
                  href="https://discord.com/app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir Discord <ExternalLink size={16} />
                </a>
              </>
            )}
            {modal === "sheet-detail" && selected && (
              <>
                <span className="eyebrow accent">FICHA DO PERSONAGEM</span>
                <h2>{selected.name}</h2>
                <div className="sheet-fields">
                  {Object.entries(selected.fields || {}).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary"
                  onClick={() => setModal("sheet-edit")}
                >
                  Editar ficha <ArrowRight size={16} />
                </button>
                <p className="muted">
                  Modelo genérico. Não representa automação completa de um
                  sistema comercial.
                </p>
              </>
            )}
            {modal === "history" && selected && (
              <>
                <span className="eyebrow accent">HISTÓRICO RECUPERÁVEL</span>
                <h2>{selected.title}</h2>
                {selected.history?.length ? (
                  selected.history.map((h: Item) => (
                    <article
                      key={h.version}
                      className="world-page"
                      style={{ marginBottom: 12 }}
                    >
                      <span className="eyebrow">Versão {h.version}</span>
                      <p>{h.snapshot?.content}</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected({
                            ...selected,
                            content: h.snapshot?.content || "",
                            title: h.snapshot?.title || selected.title,
                          });
                          setModal("entity-edit");
                        }}
                      >
                        Usar como rascunho
                      </button>
                    </article>
                  ))
                ) : (
                  <p>
                    Esta é a primeira versão. As próximas alterações preservam
                    histórico.
                  </p>
                )}
              </>
            )}
            {modal === "terms" && (
              <>
                <Shield size={28} className="accent" />
                <h2>Termos e privacidade</h2>
                <p>
                  Esta é uma versão em desenvolvimento. A plataforma ainda não
                  está pronta para comercialização. Identificação do fornecedor,
                  atendimento, políticas de cancelamento e termos definitivos
                  precisam de validação jurídica e comercial.
                </p>
                <p>
                  Seu conteúdo autoral pertence a você. Livros e conteúdos
                  editoriais seguem suas próprias licenças. Não envie dados
                  pessoais ou financeiros reais neste ambiente.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {reader && (
        <Suspense
          fallback={<div className="reader loading">Preparando leitor…</div>}
        >
          <PdfReader
            key={reader.id}
            bookId={reader.id}
            title={reader.title}
            source={reader.source}
            onClose={() => setReader(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
