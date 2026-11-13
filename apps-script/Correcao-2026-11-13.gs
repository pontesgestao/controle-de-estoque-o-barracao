/**
 * Correção única do período 01/11 → 09/11/2026 (CMV negativo).
 *
 * Como usar: na planilha "Estoque O Barracão", abra Extensões > Apps Script,
 * crie um arquivo novo (+ > Script), cole este código, escolha a função
 * corrigirPeriodo0111 e clique em Executar. O registro de execução mostra o
 * que foi alterado. Pode rodar de novo sem problema: o que já foi corrigido
 * não muda. Depois de rodar, pode apagar este arquivo.
 */
function corrigirPeriodo0111() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];

  // Notas lançadas em dobro: fica uma de cada (a certa).
  const DUPLICADAS = ['aae2d6d1', 'e9e54e7b', 'b98fd570'];
  // Categorias que não são insumo (peças do carro, despesas do dono).
  const NAO_INSUMO = ['TRANSPORTE & FRETE', 'DESPESAS PROPRIETARIO (DRE)'];

  const compras = aba_(ss, 'Compras');
  const custos = aba_(ss, 'Custos');
  const contagens = aba_(ss, 'Contagens');
  const novos = aba_(ss, 'Produtos novos');

  // 1. Apaga as notas duplicadas (e os custos que elas criaram).
  log.push('Notas duplicadas apagadas: ' + apagarLinhas_(compras, 'ID compra', function (v) { return DUPLICADAS.indexOf(String(v)) >= 0; }) + ' linha(s)');
  log.push('Custos dessas notas apagados: ' + apagarLinhas_(custos, 'ID compra', function (v) { return DUPLICADAS.indexOf(String(v)) >= 0; }) + ' linha(s)');

  // 2. Itens que não são insumo viram "Fora do estoque" e saem do CMV.
  const idsNaoInsumo = {};
  let n = editar_(compras, function (r, c) { return NAO_INSUMO.indexOf(String(r[c['Categoria']])) >= 0; }, function (r, c) {
    idsNaoInsumo[String(r[c['ID compra']])] = true;
    r[c['Categoria']] = ''; r[c['Produto']] = ''; r[c['Situação']] = 'Fora do estoque';
    r[c['Total (unidades)']] = ''; r[c['Custo por unidade (R$)']] = '';
  });
  log.push('Itens que não são insumo marcados como "Fora do estoque": ' + n);
  log.push('Custos desses itens apagados: ' + apagarLinhas_(custos, 'Categoria', function (v) { return NAO_INSUMO.indexOf(String(v)) >= 0; }) + ' linha(s)');
  log.push('Produtos não-insumo tirados da lista da contagem: ' + apagarLinhas_(novos, 'Categoria', function (v) { return NAO_INSUMO.indexOf(String(v)) >= 0; }));

  // 3. Quantidades erradas nas notas: [ID compra, produto, unid. por embalagem].
  const AJUSTES = [
    ['258c8e74', 'Batata frita (congelada)', 1],   // 7 pacotes de 2 kg (contados em pacotes)
    ['f0c6ebca', 'MP BATERRABA', 20],               // 1/2 caixa = 10 kg
    ['f0c6ebca', 'Cenoura (kg)', 20],               // 1/2 caixa = 10 kg
    ['17f6bfa8', 'Sacola', 1000],                   // 2 pacotes de 1.000 sacolas
  ];
  AJUSTES.forEach(function (a) {
    let custo = null;
    const k = editar_(compras, function (r, c) { return String(r[c['ID compra']]) === a[0] && String(r[c['Produto']]) === a[1]; }, function (r, c) {
      const total = Number(r[c['Embalagens']]) * a[2];
      custo = Number(r[c['Valor total (R$)']]) / total;
      r[c['Unid. por embalagem']] = a[2]; r[c['Total (unidades)']] = total; r[c['Custo por unidade (R$)']] = custo;
    });
    if (custo != null) {
      editar_(custos, function (r, c) { return String(r[c['ID compra']]) === a[0] && String(r[c['Produto']]) === a[1]; },
        function (r, c) { r[c['Custo por unidade (R$)']] = custo; });
    }
    log.push(a[1] + ': ' + (k ? 'nota corrigida, custo R$ ' + custo.toFixed(4) : 'não encontrada'));
  });

  // 4. Contagem de 09/11.
  const CONTAGEM_0911 = '2ddb7d9d-82d7-46fb-8387-3503815978a9';
  n = editar_(contagens, function (r, c) { return String(r[c['ID']]) === CONTAGEM_0911 && String(r[c['Produto']]) === 'Margarina'; }, function (r, c) {
    r[c['Total (unidades)']] = Math.round(35 / 15 * 100) / 100;   // 35 kg = 2,33 baldes de 15 kg
  });
  log.push('Margarina 09/11 = 2,33 baldes (35 kg): ' + (n ? 'ok' : 'não encontrada'));
  n = editar_(contagens, function (r, c) { return String(r[c['ID']]) === CONTAGEM_0911 && String(r[c['Produto']]) === 'Azeitona'; }, function (r, c) {
    r[c['Forma de contagem']] = 'Unidade'; r[c['Embalagens fechadas']] = ''; r[c['Unidades por embalagem']] = '';
    r[c['Unidades soltas']] = ''; r[c['Total (unidades)']] = 8;   // 8 potes de 150 g
  });
  log.push('Azeitona 09/11 = 8 potes: ' + (n ? 'ok' : 'não encontrada'));

  log.forEach(function (l) { Logger.log(l); });
  return log.join('\n');
}

function aba_(ss, nome) {
  const aba = ss.getSheetByName(nome);
  if (!aba) throw new Error('Aba "' + nome + '" não encontrada.');
  return aba;
}

function colunas_(aba) {
  const cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  const c = {};
  cab.forEach(function (nome, i) { c[nome] = i; });
  return c;
}

// Apaga as linhas em que teste(valor da coluna) é verdadeiro. Devolve quantas.
function apagarLinhas_(aba, coluna, teste) {
  const c = colunas_(aba);
  if (c[coluna] == null) throw new Error('Coluna "' + coluna + '" não encontrada na aba ' + aba.getName());
  const valores = aba.getDataRange().getValues();
  let n = 0;
  for (let i = valores.length - 1; i >= 1; i--) {
    if (teste(valores[i][c[coluna]])) { aba.deleteRow(i + 1); n++; }
  }
  return n;
}

// Altera as linhas em que filtro(linha) é verdadeiro. Devolve quantas.
function editar_(aba, filtro, mudar) {
  const c = colunas_(aba);
  const rng = aba.getDataRange();
  const valores = rng.getValues();
  let n = 0;
  for (let i = 1; i < valores.length; i++) {
    if (filtro(valores[i], c)) { mudar(valores[i], c); n++; }
  }
  if (n) rng.setValues(valores);
  return n;
}
