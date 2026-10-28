import { randomUUID } from "node:crypto";
import { makePool, transaction } from "./db.js";
if (
  process.env.NODE_ENV !== "development" ||
  process.env.DEV_AUTH_ENABLED !== "true"
)
  throw new Error(
    "Seed permitido apenas com NODE_ENV=development e DEV_AUTH_ENABLED=true.",
  );
const pool = makePool();
try {
  await transaction(pool, async (db) => {
    const user = "dev-user",
      pub = "10000000-0000-4000-8000-000000000001";
    await db.query(
      "INSERT INTO users(id,display_name,bio) VALUES($1,'Viajante','Conta sintética de desenvolvimento — sem dados ou compras reais.') ON CONFLICT DO NOTHING",
      [user],
    );
    await db.query(
      "INSERT INTO publishers(id,owner_id,name,description,verified,family_license_accepted) VALUES($1,$2,'Ateliê RPG BAY · DEMO','Editora sintética de desenvolvimento. Conteúdo autoral de demonstração.',false,true) ON CONFLICT DO NOTHING",
      [pub, user],
    );
    const products = [
      [
        "20000000-0000-4000-8000-000000000001",
        "Crônicas do Horizonte",
        "Toda jornada começa com uma escolha",
        "Fantasia",
        "Uma semente de aventura autoral: um farol desperta nas montanhas e o grupo decide investigar. Conteúdo demonstrativo, sem obra comercial licenciada.",
        "#a36cdb",
      ],
      [
        "20000000-0000-4000-8000-000000000002",
        "Nebulosa: Setor Zero",
        "Explore o desconhecido",
        "Ficção científica",
        "Crie uma tripulação e descubra os mistérios de uma estação abandonada. Conteúdo autoral demonstrativo.",
        "#54afcb",
      ],
      [
        "20000000-0000-4000-8000-000000000003",
        "O Arquivo da Meia-Noite",
        "Segredos que preferiam o silêncio",
        "Investigação",
        "Três pistas, um desaparecimento e uma cidade que não dorme. Proposta de cenário autoral demonstrativo.",
        "#c68b5a",
      ],
      [
        "20000000-0000-4000-8000-000000000004",
        "Atlas de Mundos Livres",
        "Ideias para a sua próxima campanha",
        "Sistema livre",
        "Perguntas e ganchos para criar lugares, culturas e histórias próprias. Material demonstrativo.",
        "#63b49e",
      ],
      [
        "20000000-0000-4000-8000-000000000005",
        "Entre Dados e Destinos",
        "Um guia para começar a jogar",
        "Sistema livre",
        "Reúna amigos, crie personagens e conte uma história em conjunto. Guia original de demonstração.",
        "#e098b7",
      ],
      [
        "20000000-0000-4000-8000-000000000006",
        "Ecos da Cidade Submersa",
        "Uma aventura além da superfície",
        "Fantasia",
        "As marés revelam ruínas antigas e um convite impossível. Cenário original de demonstração.",
        "#6379cf",
      ],
    ];
    for (const [id, title, subtitle, system, description, color] of products)
      await db.query(
        "INSERT INTO products(id,publisher_id,title,subtitle,system,description,color,price_cents,status) VALUES($1,$2,$3,$4,$5,$6,$7,0,'published') ON CONFLICT DO NOTHING",
        [id, pub, title, subtitle, system, description, color],
      );
    for (const product of products.slice(0, 3))
      await db.query(
        "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [randomUUID(), user, product[0], "development", `dev:${product[0]}`],
      );
    await db.query(
      "INSERT INTO tables(id,owner_id,title,system,description,next_session) VALUES('30000000-0000-4000-8000-000000000001',$1,'Os Guardiões do Horizonte','Fantasia','Uma campanha original de demonstração.',now()+interval '2 days') ON CONFLICT DO NOTHING",
      [user],
    );
    await db.query(
      'INSERT INTO sheets(id,table_id,owner_id,name,fields,secret_fields) VALUES(\'40000000-0000-4000-8000-000000000001\',\'30000000-0000-4000-8000-000000000001\',$1,\'Lira Ventolivre\',\'{"classe":"Exploradora","nivel":3,"vida":24,"vida_max":30,"forca":2,"agilidade":4}\',\'{"historia":"Procura o mapa de sua família"}\') ON CONFLICT DO NOTHING',
      [user],
    );
    await db.query(
      "INSERT INTO worlds(id,owner_id,title,description) VALUES('50000000-0000-4000-8000-000000000001',$1,'Arquipélago de Auralis','Ilhas flutuantes, antigas promessas e caminhos por descobrir.') ON CONFLICT DO NOTHING",
      [user],
    );
    await db.query(
      "INSERT INTO world_pages(id,world_id,title,kind,content,tags,visibility) VALUES('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Porto das Nuvens','location','Uma cidade construída entre pontes suspensas. O farol central indica a chegada de viajantes.','[\"cidade\",\"porto\"]','team') ON CONFLICT DO NOTHING",
    );
    await db.query(
      "INSERT INTO community_posts(id,author_id,title,body,category,system) VALUES('70000000-0000-4000-8000-000000000001',$1,'Bem-vindos ao ponto de encontro','Este espaço reúne discussões, relatos de mesa e criações autorais. Os dados atuais são sintéticos e restritos ao desenvolvimento.','discussion','Geral') ON CONFLICT DO NOTHING",
      [user],
    );
    await db.query(
      "INSERT INTO cosmetics(id,title,cost,style) VALUES('80000000-0000-4000-8000-000000000001','Moldura Aurora',100,'{\"accent\":\"#8e6cdb\"}') ON CONFLICT DO NOTHING",
    );
  });
  console.info(
    "Fixtures sintéticas de desenvolvimento carregadas; nenhum pagamento, envio ou serviço externo executado.",
  );
} finally {
  await pool.end();
}
