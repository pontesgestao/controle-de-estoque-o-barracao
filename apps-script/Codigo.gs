/**
 * Recebe as contagens do app O Barracão e grava na planilha.
 * Cole este código em Extensões > Apps Script da sua planilha (veja o README).
 */

// Coloque seu e-mail para receber um aviso a cada contagem enviada (ou deixe vazio).
const EMAIL_AVISO = '';

const ABA_RESUMO = 'Resumo';
const ABA_CONTAGENS = 'Contagens';
const ABA_PRODUTOS_NOVOS = 'Produtos novos';
const CABECALHO_RESUMO = ['Data/hora', 'Unidade', 'Responsável', 'Itens contados', 'Itens zerados', 'Observações',
  'Início da contagem', 'ID', 'Categorias não contadas'];
const CABECALHO_PRODUTOS_NOVOS = ['Categoria', 'Produto', 'Criado em'];
// Mesmas colunas que o Painel DRE usa na aba "Custos".
const ABA_CUSTOS = 'Custos';
const CABECALHO_CUSTOS = ['Categoria', 'Produto', 'Custo por unidade (R$)', 'Vigente desde', 'Origem', 'ID compra', 'Registrado em'];
const ORIGEM_APROVACAO = 'Aprovação inicial';
const VIGENCIA_CUSTOS_INICIAIS = '2026-10-31';
const CABECALHO_CONTAGENS = ['Data/hora', 'Unidade', 'Responsável', 'Categoria', 'Produto', 'Situação',
  'Forma de contagem', 'Embalagens fechadas', 'Unidades por embalagem', 'Unidades soltas', 'Total (unidades)', 'ID'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d && d.acao === 'custos') return responder(gravarCustosAprovados(d));
    if (!d || !d.id || !d.unidade || !Array.isArray(d.itens) || d.itens.length === 0) {
      return responder({ ok: false, erro: 'Dados incompletos' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resumo = obterAba(ss, ABA_RESUMO, CABECALHO_RESUMO);
    const contagens = obterAba(ss, ABA_CONTAGENS, CABECALHO_CONTAGENS);

    // Se o gerente tocar em "enviar" duas vezes, grava só uma.
    const repetido = resumo.getRange('H:H').createTextFinder(texto(d.id)).matchEntireCell(true).findNext();
    if (repetido) return responder({ ok: true, repetido: true });

    const quando = new Date(d.enviadoEm || Date.now());
    const unidade = texto(d.unidade);
    const responsavel = texto(d.responsavel);

    const linhas = d.itens.map(function (i) {
      return [quando, unidade, responsavel, texto(i.categoria), texto(i.produto), texto(i.situacao),
        texto(i.forma), numero(i.embalagens), numero(i.unidadesPorEmbalagem), numero(i.unidadesSoltas),
        numero(i.totalUnidades), texto(d.id)];
    });
    contagens.getRange(contagens.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);

    // Produtos que o gerente incluiu na contagem passam a valer para todos os
    // aparelhos e para o Painel DRE.
    if (Array.isArray(d.produtosIncluidos) && d.produtosIncluidos.length) {
      const abaNovos = obterAba(ss, ABA_PRODUTOS_NOVOS, CABECALHO_PRODUTOS_NOVOS);
      const ja = abaNovos.getLastRow() < 2 ? [] : abaNovos.getRange(2, 1, abaNovos.getLastRow() - 1, 2).getValues()
        .map(function (r) { return (String(r[0]) + '|' + String(r[1])).toLowerCase(); });
      d.produtosIncluidos.forEach(function (p) {
        if (!p || !p.categoria || !p.produto) return;
        const k = (String(p.categoria) + '|' + String(p.produto)).toLowerCase();
        if (ja.indexOf(k) >= 0) return;
        ja.push(k);
        abaNovos.appendRow([texto(p.categoria), texto(p.produto), quando]);
      });
    }

    const contados = d.itens.filter(function (i) { return i.situacao === 'Contada'; });
    const zerados = contados.filter(function (i) { return i.totalUnidades === 0; });
    const naoContadas = (d.categoriasNaoContadas || []).join(', ');
    resumo.appendRow([quando, unidade, responsavel, contados.length, zerados.length, texto(d.observacoes),
      d.iniciadoEm ? new Date(d.iniciadoEm) : '', texto(d.id), texto(naoContadas)]);

    if (EMAIL_AVISO) {
      MailApp.sendEmail(EMAIL_AVISO,
        'Contagem de estoque enviada: ' + d.unidade,
        'Unidade: ' + d.unidade + '\nResponsável: ' + d.responsavel +
        (naoContadas ? '\nCategorias não contadas: ' + naoContadas : '') +
        '\nItens zerados (' + zerados.length + '): ' + zerados.map(function (i) { return i.produto; }).join(', ') +
        (d.observacoes ? '\nObservações: ' + d.observacoes : '') +
        '\n\nPlanilha: ' + ss.getUrl());
    }

    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Permite testar o endereço no navegador.
// ?acao=produtos devolve os produtos criados no Painel DRE (aba
// "Produtos novos"), para o app de contagem incluir na lista.
// Sem parâmetro, só confirma que o endereço funciona.
function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'produtos') {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_PRODUTOS_NOVOS);
    const produtos = !aba || aba.getLastRow() < 2 ? [] : aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues()
      .filter(function (r) { return r[0] && r[1]; })
      .map(function (r) { return { categoria: String(r[0]).trim(), produto: String(r[1]).trim() }; });
    return responder({ ok: true, produtos: produtos });
  }
  if (e && e.parameter && e.parameter.acao === 'custos') {
    return responder({ ok: true, custos: custosAprovados() });
  }
  return responder({ ok: true, app: 'Contagem O Barracão' });
}

// ---------- Aprovação dos custos iniciais (página aprovar-custos.html) ----------

// Cada aprovação entra como uma linha nova na aba "Custos", que o Painel DRE
// lê. Aprovar de novo o mesmo produto acrescenta outra linha; vale a última.
function gravarCustosAprovados(d) {
  if (!Array.isArray(d.itens) || d.itens.length === 0 || d.itens.length > 400) return { ok: false, erro: 'Dados incompletos' };
  const quem = texto(d.responsavel).slice(0, 60);
  if (!quem) return { ok: false, erro: 'Informe quem está aprovando' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = obterAba(ss, ABA_CUSTOS, CABECALHO_CUSTOS);
  const vigente = new Date(VIGENCIA_CUSTOS_INICIAIS + 'T12:00:00');
  const agora = new Date();
  const linhas = [];
  d.itens.forEach(function (i) {
    const custo = Number(i && i.custo);
    if (!i || !i.categoria || !i.produto || !isFinite(custo) || custo < 0 || custo > 100000) return;
    linhas.push([texto(i.categoria), texto(i.produto), custo, vigente, ORIGEM_APROVACAO + ' · ' + quem, '', agora]);
  });
  if (!linhas.length) return { ok: false, erro: 'Nenhum custo válido' };
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CABECALHO_CUSTOS.length).setValues(linhas);
  aba.getRange(2, 4, aba.getLastRow() - 1, 1).setNumberFormat('dd/MM/yyyy');
  return { ok: true, gravados: linhas.length };
}

// Último custo aprovado de cada produto, para a página mostrar o que já foi feito.
function custosAprovados() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_CUSTOS);
  if (!aba || aba.getLastRow() < 2) return [];
  const ultimos = {};
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_CUSTOS.length).getValues().forEach(function (r) {
    const origem = String(r[4]);
    if (origem.indexOf(ORIGEM_APROVACAO) !== 0) return;
    ultimos[String(r[0]) + '|' + String(r[1])] = {
      categoria: String(r[0]), produto: String(r[1]), custo: Number(r[2]),
      por: origem.slice(ORIGEM_APROVACAO.length + 3),
      em: r[6] instanceof Date ? r[6].toISOString() : '',
    };
  });
  return Object.keys(ultimos).map(function (k) { return ultimos[k]; });
}

// Rode uma vez pelo editor para criar as abas formatadas.
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  obterAba(ss, ABA_RESUMO, CABECALHO_RESUMO);
  obterAba(ss, ABA_CONTAGENS, CABECALHO_CONTAGENS);
}

// Cria a aba se não existir. Se ela existir num formato antigo, guarda a
// antiga com outro nome e cria uma nova, para não misturar colunas.
function obterAba(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (aba) {
    const atual = aba.getRange(1, 1, 1, cabecalho.length).getValues()[0];
    const igual = cabecalho.every(function (c, i) { return atual[i] === c; });
    if (igual) return aba;
    if (nome === ABA_RESUMO && atual.slice(0, 8).every(function (c, i) { return c === cabecalho[i] || i === 3; })) {
      // Resumo antigo: só acrescenta a coluna nova no fim.
      aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
        .setFontWeight('bold').setBackground('#C01012').setFontColor('#FFFFFF');
      return aba;
    }
    aba.setName(nome + ' (formato antigo ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd-MM-yyyy') + ')');
  }
  aba = ss.insertSheet(nome, 0);
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight('bold').setBackground('#C01012').setFontColor('#FFFFFF').setWrap(true);
  aba.setFrozenRows(1);
  aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  aba.setColumnWidths(1, cabecalho.length, 130);
  aba.getRange(1, 1, 1, cabecalho.length).createFilter();
  return aba;
}

// Evita que um texto digitado vire fórmula na planilha.
function texto(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function numero(v) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
