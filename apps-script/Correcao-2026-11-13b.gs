/**
 * Segunda correção do período 01/11 → 09/11/2026: custo do palito de dente.
 *
 * O custo aprovado do palito foi o da caixa com 2.000 (R$ 18,88), mas a
 * contagem converte caixas em palitos (3 caixas = 6.000 palitos). O custo
 * passa a ser por palito (R$ 18,88 ÷ 2.000). A contagem de 09/11, feita no
 * produto duplicado "Palito de Dente" (Embalagens), vai para o produto certo.
 *
 * Como usar: na planilha, Extensões > Apps Script, arquivo Correcao (pode
 * apagar o conteúdo anterior), cole este código, escolha corrigirPalito e
 * clique em Executar. Pode rodar de novo sem problema.
 */
function corrigirPalito() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];
  const custoPalito = 18.88 / 2000;

  let n = editar_(aba_(ss, 'Custos'), function (r, c) {
    return String(r[c['Produto']]) === 'Palito de dente' && Number(r[c['Custo por unidade (R$)']]) > 1;
  }, function (r, c) { r[c['Custo por unidade (R$)']] = custoPalito; });
  log.push('Custo do palito por unidade (R$ 0,00944): ' + n + ' linha(s)');

  // Contagem de 09/11: copia o "Palito de Dente" (Embalagens) para o "Palito de dente" original.
  const CONTAGEM_0911 = '2ddb7d9d-82d7-46fb-8387-3503815978a9';
  const contagens = aba_(ss, 'Contagens');
  let copia = null;
  const cc = colunas_(contagens);
  contagens.getDataRange().getValues().forEach(function (r) {
    if (String(r[cc['ID']]) === CONTAGEM_0911 && String(r[cc['Produto']]) === 'Palito de Dente') copia = r.slice();
  });
  if (copia) {
    n = editar_(contagens, function (r, c) {
      return String(r[c['ID']]) === CONTAGEM_0911 && String(r[c['Produto']]) === 'Palito de dente';
    }, function (r, c) {
      ['Situação', 'Forma de contagem', 'Embalagens fechadas', 'Unidades por embalagem', 'Unidades soltas', 'Total (unidades)']
        .forEach(function (col) { r[c[col]] = copia[c[col]]; });
    });
    log.push('Contagem de 09/11 passada para "Palito de dente": ' + (n ? copia[cc['Total (unidades)']] + ' palitos' : 'não encontrada'));
    log.push('Linha duplicada apagada: ' + apagarLinhas_(contagens, 'Produto', function (v, r) {
      return String(v) === 'Palito de Dente' && String(r[cc['ID']]) === CONTAGEM_0911;
    }));
  } else {
    log.push('Contagem do "Palito de Dente" duplicado já tinha sido acertada.');
  }

  log.push('Produto duplicado tirado da lista da contagem: ' + apagarLinhas_(aba_(ss, 'Produtos novos'), 'Produto', function (v) {
    return String(v) === 'Palito de Dente';
  }));

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

function apagarLinhas_(aba, coluna, teste) {
  const c = colunas_(aba);
  if (c[coluna] == null) throw new Error('Coluna "' + coluna + '" não encontrada na aba ' + aba.getName());
  const valores = aba.getDataRange().getValues();
  let n = 0;
  for (let i = valores.length - 1; i >= 1; i--) {
    if (teste(valores[i][c[coluna]], valores[i])) { aba.deleteRow(i + 1); n++; }
  }
  return n;
}

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
