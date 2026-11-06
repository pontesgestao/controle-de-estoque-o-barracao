/**
 * Painel DRE / CMV O Barracão.
 *
 * Projeto Apps Script SEPARADO do app de contagem. Ele lê as contagens da
 * planilha "Estoque O Barracão", guarda compras, custos e faturamento em abas
 * próprias e mostra o painel. Publique como App da Web com
 * "Executar como: Eu" e "Quem pode acessar: Somente eu" (veja o README).
 */

const ABA_CONTAGENS = 'Contagens';
const ABA_COMPRAS = 'Compras';
const ABA_CUSTOS = 'Custos';
const ABA_FATURAMENTO = 'Faturamento';
const ABA_IGNORADAS = 'Contagens ignoradas';
const ABA_PRODUTOS = 'Produtos novos';

const CAB_COMPRAS = ['ID compra', 'Data da compra', 'Loja', 'Fornecedor', 'Nº documento', 'Descrição na nota',
  'Categoria', 'Produto', 'Situação', 'Embalagens', 'Unid. por embalagem', 'Total (unidades)',
  'Valor total (R$)', 'Custo por unidade (R$)', 'Fotos', 'Lançado em'];
const CAB_CUSTOS = ['Categoria', 'Produto', 'Custo por unidade (R$)', 'Vigente desde', 'Origem', 'ID compra', 'Registrado em'];
const CAB_FATURAMENTO = ['Loja', 'Contagem inicial (ID)', 'Contagem final (ID)', 'Início', 'Fim', 'Faturamento (R$)', 'Atualizado em'];
const CAB_IGNORADAS = ['ID contagem', 'Loja', 'Data', 'Ignorada em'];
const CAB_PRODUTOS = ['Categoria', 'Produto', 'Criado em'];
const ABA_CONTAS = 'Contas a pagar';
const CAB_CONTAS = ['ID', 'Vencimento', 'Beneficiário', 'Descrição', 'Valor (R$)', 'Linha digitável', 'Situação',
  'Pago em', 'Arquivo', 'Lançado em'];

const MODELO_IA = 'claude-opus-5-5';
const PASTA_FOTOS = 'O Barracão - Notas fiscais';

// Versão desta parte do código (a que fica colada no Google). A tela avisa
// quando precisa de uma versão mais nova.
const VERSAO_SERVIDOR = 4;

// A tela do painel vem do GitHub a cada abertura, assim as melhorias chegam
// sem precisar colar nada. Sem conexão com o GitHub, usa a cópia local "Painel".
const URL_TELA = 'https://raw.githubusercontent.com/pontesgestao/controle-de-estoque-o-barracao/painel-dre/painel-dre/Painel.html';

function doGet() {
  let saida;
  try {
    const r = UrlFetchApp.fetch(URL_TELA, { muteHttpExceptions: true, headers: { 'Cache-Control': 'no-cache' } });
    if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
    saida = HtmlService.createHtmlOutput(r.getContentText('UTF-8'));
  } catch (e) {
    saida = HtmlService.createHtmlOutputFromFile('Painel');
  }
  return saida.setTitle('Painel DRE · O Barracão').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Configuração ----------

function props_() { return PropertiesService.getScriptProperties(); }

function planilha_() {
  const id = props_().getProperty('PLANILHA_ID');
  if (!id) throw new Error('CONFIGURAR');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('SEM_ACESSO: a conta ' + (Session.getActiveUser().getEmail() || 'Google usada neste aparelho') +
      ' não tem acesso à planilha "Estoque O Barracão". Peça ao responsável para compartilhar a planilha com ela como Editor.');
  }
}

// Só quem é dono ou editor deste projeto do Google muda as configurações
// (planilha, chave da API, Telegram), para quem só usa o painel não trocar
// a planilha ou a chave de todo mundo.
function podeConfigurar_() {
  try {
    const eu = Session.getActiveUser().getEmail();
    const arquivo = DriveApp.getFileById(ScriptApp.getScriptId());
    return !!eu && (arquivo.getOwner().getEmail() === eu || arquivo.getEditors().some(function (u) { return u.getEmail() === eu; }));
  } catch (e) {
    return false;
  }
}
function exigirConfigurador_() {
  if (!podeConfigurar_()) throw new Error('Só o responsável pelo painel pode mudar as configurações.');
}

function obterConfig() {
  const p = props_();
  let nome = '';
  if (p.getProperty('PLANILHA_ID')) {
    try { nome = planilha_().getName(); } catch (e) { nome = ''; }
  }
  return { planilha: nome, temPlanilha: !!nome, temChave: !!p.getProperty('ANTHROPIC_API_KEY'), telegram: estadoTelegram_(),
    podeConfigurar: podeConfigurar_(), conta: Session.getActiveUser().getEmail() };
}

function salvarConfig(cfg) {
  exigirConfigurador_();
  const p = props_();
  if (cfg.planilha) {
    const m = String(cfg.planilha).match(/\/d\/([a-zA-Z0-9-_]+)/);
    const id = m ? m[1] : String(cfg.planilha).trim();
    SpreadsheetApp.openById(id); // falha aqui se o link estiver errado
    p.setProperty('PLANILHA_ID', id);
  }
  if (cfg.chave) p.setProperty('ANTHROPIC_API_KEY', String(cfg.chave).trim());
  return obterConfig();
}

// ---------- Leitura de tudo que o painel precisa ----------

function carregarDados() {
  const ss = planilha_();
  const tz = ss.getSpreadsheetTimeZone();
  const fmt = function (d, padrao) {
    return d instanceof Date ? Utilities.formatDate(d, tz, padrao || "yyyy-MM-dd'T'HH:mm") : String(d || '');
  };

  // Contagens: lê a aba "Contagens" e as abas "Contagens (formato antigo …)".
  const contagens = {};
  ss.getSheets().forEach(function (aba) {
    const nome = aba.getName();
    if ((nome !== ABA_CONTAGENS && nome.indexOf(ABA_CONTAGENS + ' (formato antigo') !== 0) || aba.getLastRow() < 2) return;
    lerContagens_(aba.getDataRange().getValues(), fmt).forEach(function (c) {
      if (!contagens[c.id]) contagens[c.id] = c;
    });
  });

  const ignoradas = linhas_(ss, ABA_IGNORADAS, CAB_IGNORADAS).map(function (r) { return String(r[0]); });
  const produtosNovos = linhas_(ss, ABA_PRODUTOS, CAB_PRODUTOS).map(function (r) { return { categoria: String(r[0]), produto: String(r[1]) }; });

  const compras = linhas_(ss, ABA_COMPRAS, CAB_COMPRAS).map(function (r) {
    return { id: String(r[0]), dia: fmt(r[1], 'yyyy-MM-dd'), loja: String(r[2]), fornecedor: String(r[3]), documento: String(r[4]),
      descricao: String(r[5]), categoria: String(r[6]), produto: String(r[7]), situacao: String(r[8]),
      embalagens: num_(r[9]), porEmbalagem: num_(r[10]), unidades: num_(r[11]), valor: num_(r[12]), fotos: String(r[14]) };
  });

  const custos = linhas_(ss, ABA_CUSTOS, CAB_CUSTOS).map(function (r) {
    return { categoria: String(r[0]), produto: String(r[1]), custo: num_(r[2]), desde: fmt(r[3], 'yyyy-MM-dd'),
      origem: String(r[4]), compra: String(r[5]) };
  });

  const faturamento = linhas_(ss, ABA_FATURAMENTO, CAB_FATURAMENTO).map(function (r) {
    return { loja: String(r[0]), inicial: String(r[1]), final: String(r[2]), valor: num_(r[5]) };
  });

  const contas = linhas_(ss, ABA_CONTAS, CAB_CONTAS).map(function (r) {
    return { id: String(r[0]), vencimento: fmt(r[1], 'yyyy-MM-dd'), beneficiario: String(r[2]), descricao: String(r[3]),
      valor: num_(r[4]), linha: String(r[5]), situacao: String(r[6]), pagoEm: fmt(r[7], 'yyyy-MM-dd'), arquivo: String(r[8]) };
  });

  return {
    contas: contas,
    telegram: estadoTelegram_(),
    contagens: Object.keys(contagens).map(function (k) { return contagens[k]; }),
    ignoradas: ignoradas, produtosNovos: produtosNovos, compras: compras, custos: custos, faturamento: faturamento,
    temChave: !!props_().getProperty('ANTHROPIC_API_KEY'),
    versaoServidor: VERSAO_SERVIDOR,
  };
}

/**
 * Converte as linhas de uma aba de contagens em contagens agrupadas por ID.
 * Formato atual: tem as colunas "Situação" e "Total (unidades)".
 * Formato anterior: tem "Quantidade" e "Medida". Só são aproveitadas as
 * contagens em que tudo veio em unidades ("un"), ou seja, as enviadas pelo
 * app novo antes de o script da planilha ser atualizado.
 */
function lerContagens_(valores, fmt) {
  const cab = valores[0];
  const col = function (nome) { return cab.indexOf(nome); };
  const c = { data: col('Data/hora'), loja: col('Unidade'), resp: col('Responsável'), cat: col('Categoria'), prod: col('Produto'),
    sit: col('Situação'), total: col('Total (unidades)'), qtd: col('Quantidade'), medida: col('Medida'), id: col('ID') };
  const novo = c.sit >= 0 && c.total >= 0;
  const antigo = !novo && c.qtd >= 0 && c.medida >= 0;
  if (c.id < 0 || (!novo && !antigo)) return [];

  const grupos = {};
  const soUnidades = {};
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    const id = String(v[c.id]);
    if (!id) continue;
    if (!grupos[id]) {
      grupos[id] = { id: id, loja: String(v[c.loja]), data: fmt(v[c.data]), responsavel: String(v[c.resp]), itens: [] };
      soUnidades[id] = true;
    }
    if (novo) {
      grupos[id].itens.push([String(v[c.cat]), String(v[c.prod]), String(v[c.sit]), v[c.total] === '' ? null : Number(v[c.total])]);
    } else {
      if (String(v[c.medida]) !== 'un') soUnidades[id] = false;
      grupos[id].itens.push([String(v[c.cat]), String(v[c.prod]), 'Contada', v[c.qtd] === '' ? 0 : Number(v[c.qtd])]);
    }
  }
  return Object.keys(grupos).filter(function (id) { return novo || soUnidades[id]; }).map(function (id) { return grupos[id]; });
}

// ---------- Gravações ----------

function salvarFaturamento(f) {
  const ss = planilha_();
  const aba = aba_(ss, ABA_FATURAMENTO, CAB_FATURAMENTO);
  const valores = aba.getDataRange().getValues();
  const linha = [texto_(f.loja), texto_(f.inicial), texto_(f.final), texto_(f.inicio), texto_(f.fim),
    f.valor === '' || f.valor == null ? '' : Number(f.valor), new Date()];
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][1]) === f.inicial && String(valores[i][2]) === f.final) {
      aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
      return true;
    }
  }
  aba.appendRow(linha);
  return true;
}

function salvarCusto(c) {
  const aba = aba_(planilha_(), ABA_CUSTOS, CAB_CUSTOS);
  aba.appendRow([texto_(c.categoria), texto_(c.produto), Number(c.custo), c.desde ? new Date(c.desde + 'T12:00:00') : new Date(),
    'Manual', '', new Date()]);
  return true;
}

// Cadastra um produto que ainda não existe na contagem (vindo de uma nota).
function criarProduto(p) {
  const categoria = String(p.categoria || '').trim();
  const produto = String(p.produto || '').trim();
  if (!categoria || !produto) throw new Error('Informe a categoria e o nome do produto.');
  const aba = aba_(planilha_(), ABA_PRODUTOS, CAB_PRODUTOS);
  const existe = linhas_(planilha_(), ABA_PRODUTOS, CAB_PRODUTOS).some(function (r) {
    return String(r[0]).toLowerCase() === categoria.toLowerCase() && String(r[1]).toLowerCase() === produto.toLowerCase();
  });
  if (!existe) aba.appendRow([texto_(categoria), texto_(produto), new Date()]);
  return { categoria: categoria, produto: produto };
}

function alternarContagemIgnorada(c) {
  const aba = aba_(planilha_(), ABA_IGNORADAS, CAB_IGNORADAS);
  const valores = aba.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]) === c.id) { aba.deleteRow(i + 1); return false; }
  }
  aba.appendRow([texto_(c.id), texto_(c.loja), texto_(c.data), new Date()]);
  return true;
}

/**
 * Grava uma compra: uma linha por item, as fotos/PDFs no Google Drive e, para
 * cada item de estoque, o novo custo por unidade (última compra).
 */
function salvarCompra(compra) {
  const ss = planilha_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = Utilities.getUuid().slice(0, 8);
    const dia = new Date(compra.dia + 'T12:00:00');
    const agora = new Date();

    // A foto é só um comprovante: se o Google Drive recusar (armazenamento
    // cheio, limite do dia), a compra é salva mesmo assim, com um aviso.
    let fotos = '';
    let avisoFotos = '';
    if (compra.fotos && compra.fotos.length) {
      try {
        const pasta = pastaFotos_();
        fotos = compra.fotos.map(function (arq, i) {
          const pdf = arq.tipo === 'application/pdf';
          const blob = Utilities.newBlob(Utilities.base64Decode(arq.dados), pdf ? 'application/pdf' : 'image/jpeg',
            compra.dia + ' ' + compra.loja + ' ' + (compra.fornecedor || 'nota') + ' ' + (i + 1) + (pdf ? '.pdf' : '.jpg'));
          return pasta.createFile(blob).getUrl();
        }).join(' ');
      } catch (e) {
        fotos = '';
        avisoFotos = 'o Google Drive recusou a foto (' + String(e && e.message || e) + ').';
      }
    }

    const linhas = compra.itens.map(function (it) {
      const unidades = it.situacao === 'Estoque' ? Number(it.embalagens) * Number(it.porEmbalagem) : '';
      const custo = unidades ? Number(it.valor) / unidades : '';
      return [id, dia, texto_(compra.loja), texto_(compra.fornecedor), texto_(compra.documento), texto_(it.descricao),
        texto_(it.categoria), texto_(it.produto), it.situacao, Number(it.embalagens) || '', Number(it.porEmbalagem) || '',
        unidades, Number(it.valor) || 0, custo, fotos, agora];
    });
    const abaCompras = aba_(ss, ABA_COMPRAS, CAB_COMPRAS);
    abaCompras.getRange(abaCompras.getLastRow() + 1, 1, linhas.length, CAB_COMPRAS.length).setValues(linhas);

    const custos = linhas.filter(function (l) { return l[8] === 'Estoque' && l[13] > 0; }).map(function (l) {
      return [l[6], l[7], l[13], dia, 'Nota ' + (compra.fornecedor || '') + (compra.documento ? ' nº ' + compra.documento : ''), id, agora];
    });
    if (custos.length) {
      const abaCustos = aba_(ss, ABA_CUSTOS, CAB_CUSTOS);
      abaCustos.getRange(abaCustos.getLastRow() + 1, 1, custos.length, CAB_CUSTOS.length).setValues(custos);
    }
    return { id: id, avisoFotos: avisoFotos };
  } finally {
    lock.releaseLock();
  }
}

function excluirCompra(id) {
  const ss = planilha_();
  [[ABA_COMPRAS, CAB_COMPRAS, 0], [ABA_CUSTOS, CAB_CUSTOS, 5]].forEach(function (a) {
    const aba = aba_(ss, a[0], a[1]);
    const valores = aba.getDataRange().getValues();
    for (let i = valores.length - 1; i >= 1; i--) {
      if (String(valores[i][a[2]]) === id) aba.deleteRow(i + 1);
    }
  });
  return true;
}

// ---------- Contas a pagar (boletos) ----------

/** Lê boletos (foto ou PDF; um PDF pode ter vários, como um carnê). */
function lerBoleto(fotos) {
  const instrucoes =
    'Você lê fotos e PDFs de boletos bancários brasileiros recebidos por um restaurante (O Barracão) ' +
    'e extrai os dados para a lista de contas a pagar. Um arquivo pode ter mais de um boleto (carnê, parcelas): ' +
    'devolva um item por boleto.\n\n' +
    'Para cada boleto, informe:\n' +
    '- beneficiario: quem recebe (campo "Beneficiário" ou "Cedente"), nome curto, sem CNPJ.\n' +
    '- descricao: o que é, em poucas palavras, se der para saber (ex.: "Nota 384070", "Parcela 2/3"); senão vazio.\n' +
    '- valor: o valor do documento em reais (use o "Valor cobrado" se houver desconto ou juros já calculados).\n' +
    '- vencimento: a data de vencimento no formato AAAA-MM-DD.\n' +
    '- linhaDigitavel: a linha digitável completa, só os números (47 dígitos para boleto bancário, 48 para ' +
    'contas de consumo/convênio). Confira dígito a dígito; deixe vazio se não estiver legível.\n' +
    '- confianca: "alta", "media" ou "baixa".\n\n' +
    'Em "aviso", escreva em português, numa frase curta, o que a pessoa precisa saber (ex.: linha ilegível, ' +
    'não parece um boleto). Deixe vazio quando não houver nada. Não invente valores.';
  const conteudo = anexos_(fotos);
  conteudo.push({ type: 'text', text: 'Extraia os dados deste(s) boleto(s).' });
  const esquema = {
    type: 'object',
    additionalProperties: false,
    required: ['aviso', 'boletos'],
    properties: {
      aviso: { type: 'string' },
      boletos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['beneficiario', 'descricao', 'valor', 'vencimento', 'linhaDigitavel', 'confianca'],
          properties: {
            beneficiario: { type: 'string' },
            descricao: { type: 'string' },
            valor: { type: 'number' },
            vencimento: { type: 'string' },
            linhaDigitavel: { type: 'string' },
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          },
        },
      },
    },
  };
  const r = chamarIA_(instrucoes, conteudo, esquema, 'o boleto');
  (r.boletos || []).forEach(function (b) { b.linhaDigitavel = String(b.linhaDigitavel || '').replace(/\D/g, ''); });
  return r;
}

/** Grava uma ou mais contas. lote: { contas: [...], fotos: [...] }. */
function salvarContas(lote) {
  const ss = planilha_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const agora = new Date();
    let arquivo = '';
    let avisoFotos = '';
    if (lote.fotos && lote.fotos.length) {
      try {
        const pasta = pastaFotos_();
        arquivo = lote.fotos.map(function (arq, i) {
          const pdf = arq.tipo === 'application/pdf';
          const blob = Utilities.newBlob(Utilities.base64Decode(arq.dados), pdf ? 'application/pdf' : 'image/jpeg',
            'Boleto ' + (lote.contas[0] ? lote.contas[0].beneficiario : '') + ' ' + (i + 1) + (pdf ? '.pdf' : '.jpg'));
          return pasta.createFile(blob).getUrl();
        }).join(' ');
      } catch (e) {
        arquivo = '';
        avisoFotos = 'o Google Drive recusou o arquivo (' + String(e && e.message || e) + ').';
      }
    }
    const linhas = (lote.contas || []).map(function (c) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.vencimento))) throw new Error('Informe o vencimento de todas as contas.');
      const valor = Number(c.valor);
      if (!isFinite(valor) || valor <= 0) throw new Error('Informe o valor de todas as contas.');
      return [Utilities.getUuid().slice(0, 8), new Date(c.vencimento + 'T12:00:00'), texto_(c.beneficiario), texto_(c.descricao),
        valor, "'" + String(c.linha || '').replace(/\D/g, ''), 'A pagar', '', arquivo, agora];
    });
    if (!linhas.length) throw new Error('Nenhuma conta para salvar.');
    const aba = aba_(ss, ABA_CONTAS, CAB_CONTAS);
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CAB_CONTAS.length).setValues(linhas);
    aba.getRange(2, 2, aba.getLastRow() - 1, 1).setNumberFormat('dd/MM/yyyy');
    return { gravadas: linhas.length, avisoFotos: avisoFotos };
  } finally {
    lock.releaseLock();
  }
}

/** Marca (ou desmarca) uma conta como paga. */
function marcarContaPaga(id, paga) {
  const aba = aba_(planilha_(), ABA_CONTAS, CAB_CONTAS);
  const valores = aba.getDataRange().getValues();
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][0]) === String(id)) {
      aba.getRange(i + 1, 7, 1, 2).setValues([[paga ? 'Paga' : 'A pagar', paga ? new Date() : '']]);
      if (paga) aba.getRange(i + 1, 8).setNumberFormat('dd/MM/yyyy');
      return true;
    }
  }
  throw new Error('Conta não encontrada. Recarregue o painel.');
}

function excluirConta(id) {
  const aba = aba_(planilha_(), ABA_CONTAS, CAB_CONTAS);
  const valores = aba.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]) === String(id)) aba.deleteRow(i + 1);
  }
  return true;
}

// ---------- Aviso de vencimentos pelo Telegram ----------

function estadoTelegram_() {
  const p = props_();
  const chats = JSON.parse(p.getProperty('TELEGRAM_CHATS') || '[]');
  const hora = p.getProperty('AVISO_HORA');
  const ativo = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'avisarVencimentos'; });
  return { temToken: !!p.getProperty('TELEGRAM_TOKEN'), robo: p.getProperty('TELEGRAM_ROBO') || '',
    chats: chats.map(function (c) { return c.nome; }), ativo: ativo, hora: hora ? Number(hora) : null };
}

function telegram_(metodo, dados) {
  const token = props_().getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Cadastre o token do robô do Telegram.');
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + metodo, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(dados || {}), muteHttpExceptions: true,
  });
  const json = JSON.parse(r.getContentText() || '{}');
  if (!json.ok) {
    if (r.getResponseCode() === 401 || r.getResponseCode() === 404) throw new Error('Token do Telegram inválido. Confira com o @BotFather.');
    throw new Error('Telegram: ' + (json.description || 'HTTP ' + r.getResponseCode()));
  }
  return json.result;
}

/**
 * Guarda o token (se vier) e cadastra quem mandou mensagem para o robô.
 * Cada pessoa que vai receber o aviso manda /start para o robô antes.
 */
function conectarTelegram(token) {
  exigirConfigurador_();
  const p = props_();
  if (token) {
    // Guarda o token e o nome do robô dono dele, para o painel mostrar o
    // link do robô certo (getMe falha se o token estiver errado).
    const limpo = String(token).replace(/\s+/g, '');
    p.setProperty('TELEGRAM_TOKEN', limpo);
    p.deleteProperty('TELEGRAM_CHATS');
    p.setProperty('TELEGRAM_ROBO', telegram_('getMe').username || '');
  }
  // Um webhook ligado no robô impede a leitura das mensagens; desligar não
  // apaga nada (as mensagens pendentes continuam guardadas).
  try { telegram_('deleteWebhook', { drop_pending_updates: false }); } catch (e) { /* segue */ }
  const atualizacoes = telegram_('getUpdates', { allowed_updates: ['message'] }) || [];
  const chats = JSON.parse(p.getProperty('TELEGRAM_CHATS') || '[]');
  atualizacoes.forEach(function (u) {
    const chat = u.message && u.message.chat;
    if (!chat || chat.type !== 'private') return;
    if (chats.some(function (c) { return c.id === chat.id; })) return;
    chats.push({ id: chat.id, nome: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || 'Contato' });
  });
  p.setProperty('TELEGRAM_CHATS', JSON.stringify(chats));
  if (!chats.length) {
    const robo = p.getProperty('TELEGRAM_ROBO') ? '@' + p.getProperty('TELEGRAM_ROBO') : 'deste token';
    throw new Error('O token salvo é do robô ' + robo + ', e ninguém mandou mensagem para ele ainda. ' +
      'Toque em "Abrir no Telegram", aperte Iniciar e depois toque em Conectar de novo.');
  }
  chats.forEach(function (c) {
    telegram_('sendMessage', { chat_id: c.id, text: '✅ Avisos de contas a pagar do O Barracão conectados.' });
  });
  return estadoTelegram_();
}

/**
 * Conecta uma pessoa pelo número de usuário do Telegram (o @userinfobot
 * mostra), sem depender das mensagens guardadas no robô. A pessoa precisa
 * ter apertado Iniciar no robô antes.
 */
function adicionarChatTelegram(id) {
  exigirConfigurador_();
  const chatId = Number(String(id || '').replace(/[^\d-]/g, ''));
  if (!chatId) throw new Error('Digite o número (Id) que o @userinfobot mostrou.');
  let nome = 'Contato';
  try {
    const chat = telegram_('getChat', { chat_id: chatId });
    nome = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || nome;
  } catch (e) {
    throw new Error('O robô não consegue falar com esse número. Abra o robô no Telegram, aperte Iniciar e confira o Id no @userinfobot.');
  }
  telegram_('sendMessage', { chat_id: chatId, text: '✅ Avisos de contas a pagar do O Barracão conectados.' });
  const p = props_();
  const chats = JSON.parse(p.getProperty('TELEGRAM_CHATS') || '[]');
  if (!chats.some(function (c) { return c.id === chatId; })) chats.push({ id: chatId, nome: nome });
  p.setProperty('TELEGRAM_CHATS', JSON.stringify(chats));
  return estadoTelegram_();
}

function desconectarTelegram() {
  exigirConfigurador_();
  const p = props_();
  p.deleteProperty('TELEGRAM_CHATS');
  ativarAvisoDiario(-1);
  return estadoTelegram_();
}

/** Liga o aviso diário na hora pedida (fuso da planilha), ou desliga com -1. */
function ativarAvisoDiario(hora) {
  exigirConfigurador_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'avisarVencimentos') ScriptApp.deleteTrigger(t);
  });
  const h = Number(hora);
  if (h >= 0 && h <= 23) {
    ScriptApp.newTrigger('avisarVencimentos').timeBased().atHour(h).nearMinute(0).everyDays(1)
      .inTimezone(planilha_().getSpreadsheetTimeZone()).create();
    props_().setProperty('AVISO_HORA', String(h));
  } else {
    props_().deleteProperty('AVISO_HORA');
  }
  return estadoTelegram_();
}

/** Roda todo dia pelo acionador. teste = true manda mesmo sem contas. */
function avisarVencimentos(teste) {
  const ss = planilha_();
  const tz = ss.getSpreadsheetTimeZone();
  const dia = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  const agora = new Date();
  const hoje = dia(agora);
  const amanha = dia(new Date(agora.getTime() + 24 * 3600 * 1000));
  const contas = linhas_(ss, ABA_CONTAS, CAB_CONTAS)
    .filter(function (r) { return String(r[6]) !== 'Paga' && r[1] instanceof Date; })
    .map(function (r) { return { venc: dia(r[1]), benef: String(r[2]), desc: String(r[3]), valor: Number(r[4]) || 0, linha: String(r[5]) }; })
    .sort(function (a, b) { return a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0; });
  const grupos = [
    ['🔴 VENCIDAS', contas.filter(function (c) { return c.venc < hoje; }), false],
    ['🟠 VENCEM HOJE', contas.filter(function (c) { return c.venc === hoje; }), true],
    ['🟡 VENCEM AMANHÃ', contas.filter(function (c) { return c.venc === amanha; }), true],
  ].filter(function (g) { return g[1].length; });
  const chats = JSON.parse(props_().getProperty('TELEGRAM_CHATS') || '[]');
  if (!chats.length) throw new Error('Conecte o Telegram primeiro.');
  if (!grupos.length && !teste) return 0;

  const brl = function (v) { return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  const html = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const ddmm = function (d) { return d.slice(8, 10) + '/' + d.slice(5, 7); };
  let texto = '<b>📅 O Barracão · contas a pagar · ' + ddmm(hoje) + '</b>\n';
  if (!grupos.length) texto += '\nNenhuma conta vencida, para hoje ou para amanhã. Este é um teste do aviso. ✅';
  let total = 0;
  grupos.forEach(function (g) {
    const soma = g[1].reduce(function (s, c) { return s + c.valor; }, 0);
    total += soma;
    texto += '\n<b>' + g[0] + ' (' + g[1].length + ') · ' + brl(soma) + '</b>\n';
    g[1].forEach(function (c) {
      texto += '• ' + ddmm(c.venc) + ' ' + html(c.benef) + (c.desc ? ' (' + html(c.desc) + ')' : '') + ' · ' + brl(c.valor) + '\n';
      if (g[2] && c.linha) texto += '<code>' + html(c.linha) + '</code>\n';
    });
  });
  if (grupos.length) texto += '\n<b>Total: ' + brl(total) + '</b>\nToque na linha digitável para copiar.';
  chats.forEach(function (c) {
    telegram_('sendMessage', { chat_id: c.id, text: texto.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true });
  });
  return grupos.length;
}

function testarTelegram() { avisarVencimentos(true); return true; }

// ---------- Leitura da nota com IA ----------

/**
 * Envia as fotos e/ou PDFs da nota para o Claude e devolve os itens lidos, já
 * associados aos produtos do catálogo da contagem.
 * catalogo: lista de "Categoria | Produto" (o índice é usado na resposta).
 */
function lerNota(fotos, catalogo) {
  const chave = props_().getProperty('ANTHROPIC_API_KEY');
  if (!chave) throw new Error('Cadastre a chave da API na aba Configurações.');

  const listaProdutos = catalogo.map(function (p, i) { return i + ' | ' + p; }).join('\n');
  const instrucoes =
    'Você lê fotos e PDFs de notas fiscais (DANFE) e cupons fiscais brasileiros de compras de um restaurante e hamburgueria com marmitas mineiras (O Barracão) ' +
    'e extrai os itens comprados para dar entrada no estoque.\n\n' +
    'Para cada item da nota, informe:\n' +
    '- descricao: o texto do item como está na nota.\n' +
    '- quantidade: a quantidade comprada, na unidade da nota.\n' +
    '- unidadeNota: a unidade da nota (UN, CX, FD, PCT, KG, L etc.).\n' +
    '- unidadesPorEmbalagem: quantas unidades CONTÁVEIS (frascos, latas, potes, galões, pacotinhos) vêm em cada ' +
    'embalagem comprada, quando a descrição deixar claro (ex.: "PK C/6" = 6, "CX C/12" = 12, "FD 6X2L" = 6). ' +
    'Peso e volume NÃO são unidades: "7,0 KG", "1,3 KG", "2 L" descrevem o tamanho de uma unidade. ' +
    'Use 1 quando a unidade da nota já é a própria unidade contada (UN, GL/galão, BD/balde, LT/lata, FR/frasco). ' +
    'Use 0 quando não der para saber.\n' +
    'EXCEÇÃO — produtos por peso: os produtos do catálogo com "(kg)" no fim do nome são controlados em QUILOS. ' +
    'Para eles, unidadesPorEmbalagem é quantos kg vêm em cada embalagem da nota: use 1 quando a nota já vende em KG ' +
    '(ex.: "ALCATRA KG", 3,250 KG → quantidade 3,25 e unidadesPorEmbalagem 1); quando a nota vende em pacotes, caixas ' +
    'ou fardos, informe os kg de cada um (ex.: "ARROZ 5KG", 4 UN → unidadesPorEmbalagem 5; "FD 6X5KG", 2 FD → 30).\n' +
    '- valorTotal: o valor total do item na nota (coluna de valor total do produto, com descontos do item), em reais, sem impostos destacados.\n' +
    '- ipi: o valor de IPI do item, se estiver na linha do item; senão 0.\n' +
    '- icmsSt: o valor de ICMS-ST (substituição tributária) do item, se estiver na linha ou na descrição do item ' +
    '(ex.: "VLR ST (R$: 81,63)"); senão 0.\n' +
    '- produto: o número do produto do catálogo abaixo que corresponde ao item, ou -1 quando nenhum corresponde ' +
    '(por exemplo, itens que não são controlados no estoque).\n' +
    '- confianca: "alta", "media" ou "baixa" para a associação com o produto.\n\n' +
    'Informe também o fornecedor (nome do emitente), o número do documento, a data de emissão (AAAA-MM-DD), o ' +
    'valor total dos produtos e o valor total da nota. Deixe vazio (ou 0) o que não estiver legível; não invente valores.\n' +
    'Em "aviso", escreva em português, numa frase curta, qualquer coisa que a pessoa precise saber: por exemplo, ' +
    'se a nota tem mais de uma folha (ex.: "Folha 1/2") e alguma folha não foi enviada, se há frete, seguro ou ' +
    'outras despesas, ou se algum item ficou ilegível. Deixe vazio quando não houver nada.\n\n' +
    'Catálogo de produtos do estoque (número | categoria | produto):\n' + listaProdutos;

  const conteudo = anexos_(fotos);
  conteudo.push({ type: 'text', text: 'Extraia os itens desta nota/cupom fiscal.' });

  const esquema = {
    type: 'object',
    additionalProperties: false,
    required: ['fornecedor', 'documento', 'data', 'valorProdutos', 'valorNota', 'aviso', 'itens'],
    properties: {
      fornecedor: { type: 'string' },
      documento: { type: 'string' },
      data: { type: 'string' },
      valorProdutos: { type: 'number' },
      valorNota: { type: 'number' },
      aviso: { type: 'string' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['descricao', 'quantidade', 'unidadeNota', 'unidadesPorEmbalagem', 'valorTotal', 'ipi', 'icmsSt', 'produto', 'confianca'],
          properties: {
            descricao: { type: 'string' },
            quantidade: { type: 'number' },
            unidadeNota: { type: 'string' },
            unidadesPorEmbalagem: { type: 'number' },
            valorTotal: { type: 'number' },
            ipi: { type: 'number' },
            icmsSt: { type: 'number' },
            produto: { type: 'integer' },
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          },
        },
      },
    },
  };

  return chamarIA_(instrucoes, conteudo, esquema, 'a nota');
}

// Chama o Claude com as instruções, os arquivos e o formato de resposta
// esperado (JSON). oQue entra nas mensagens de erro ("a nota", "o boleto").
function chamarIA_(instrucoes, conteudo, esquema, oQue) {
  const chave = props_().getProperty('ANTHROPIC_API_KEY');
  if (!chave) throw new Error('Cadastre a chave da API na aba Configurações.');
  const corpo = {
    model: MODELO_IA,
    max_tokens: 16000,
    // Leitura de nota é uma extração direta: esforço baixo responde mais
    // rápido e cabe no tempo limite do Apps Script.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
    // Se o modelo recusar a solicitação, a própria API tenta outro modelo.
    fallbacks: 'default',
    system: instrucoes,
    messages: [{ role: 'user', content: conteudo }],
  };

  const resposta = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': chave,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });

  const status = resposta.getResponseCode();
  const json = JSON.parse(resposta.getContentText() || '{}');
  if (status !== 200) {
    const msg = json.error && json.error.message ? json.error.message : 'HTTP ' + status;
    if (status === 401) throw new Error('Chave da API inválida. Confira em Configurações.');
    if (status === 429 || status === 529) throw new Error('Serviço da IA ocupado no momento. Tente de novo em instantes.');
    throw new Error('Erro ao ler ' + oQue + ': ' + msg);
  }
  if (json.stop_reason === 'refusal') throw new Error('A IA não conseguiu processar esta imagem. Lance manualmente.');
  if (json.stop_reason === 'max_tokens') throw new Error('O arquivo é longo demais para uma leitura só. Envie em partes (menos arquivos por vez).');

  const texto = (json.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return JSON.parse(texto);
}

// Fotos e PDFs no formato que a API do Claude recebe.
function anexos_(fotos) {
  return fotos.map(function (arq) {
    if (arq.tipo === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.dados } };
    }
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: arq.dados } };
  });
}

// ---------- Utilidades ----------

function aba_(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#1C1C1C').setFontColor('#FFFFFF').setWrap(true);
    aba.setFrozenRows(1);
  }
  return aba;
}

function linhas_(ss, nome, cabecalho) {
  const aba = aba_(ss, nome, cabecalho);
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, cabecalho.length).getValues();
}

function pastaFotos_() {
  const p = props_();
  const id = p.getProperty('PASTA_FOTOS_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* pasta apagada: cria outra */ }
  }
  const pasta = DriveApp.createFolder(PASTA_FOTOS);
  p.setProperty('PASTA_FOTOS_ID', pasta.getId());
  return pasta;
}

function num_(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Evita que um texto vire fórmula na planilha.
function texto_(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
