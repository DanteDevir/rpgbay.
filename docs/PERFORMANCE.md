# Desempenho e metodologia

Não foram medidos bateria, RAM/CPU nativa em repouso ou PDF editorial grande; isso continua critério de aceite. Sem números inventados. Ambiente local observado: Ubuntu26.04 cloud, Node24, Chromium compartilhado; não representa hardware do comprador.

Metas propostas para homologação: desktop4núcleos/8GB com SSD, Android intermediário4GB; biblioteca preparada em2s, leitor primeira página em3s para PDF100MB e paginação interativa; CPU ociosa média<3% após60s; nenhuma captura/chamada sem ação. São metas, não resultados.

Protocolo: medir cold/warm start5execuções, p50/p95, RSS, CPU60s, arquivo original e hash/tamanho, rede normal/latência/perda/offline, retomada após interrupção/reinício, integridade e consumo. Registrar versão SO/WebView/dispositivo/artefato e separar resultados web/nativo. Listas API são paginadas; UI ainda precisa virtualização para bibliotecas grandes. Reader renderiza uma página e limita busca a200p por execução; isso não satisfaz pesquisa integral de livro grande nem OCR. Voz/calls não inicializadas no boot.
