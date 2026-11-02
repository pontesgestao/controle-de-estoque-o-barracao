// Página de aprovação dos custos iniciais. Lê os custos sugeridos
// (custos-sugeridos.js), mostra o que já foi aprovado na planilha e grava
// cada aprovação na aba "Custos" pelo mesmo Apps Script da contagem.
(function () {
  'use strict';

  const CHAVE_NOME = 'obarracao-aprovador-v1';
  const CHAVE_RASCUNHO = 'obarracao-custos-rascunho-v1';
  const url = (window.CONFIG.URL_PLANILHA || '').trim();
  const lista = document.getElementById('lista');
  const faixa = document.getElementById('faixa');
  const aviso = document.getElementById('aviso');
  const campoNome = document.getElementById('responsavel');

  const itens = window.CUSTOS_SUGERIDOS.map((x, i) => ({
    i, chave: x.c + '|' + x.p, categoria: x.c, produto: x.p, unidade: x.u, sugerido: x.s,
    origem: x.o, obs: x.n || '', atencao: !!x.a,
  }));
  const categorias = [];
  itens.forEach((it) => { if (!categorias.includes(it.categoria)) categorias.push(it.categoria); });

  let aprovados = {};     // chave -> { custo, por, em }
  let rascunho = carregar(CHAVE_RASCUNHO) || {};   // chave -> valor digitado e ainda não aprovado
  let filtro = 'pendentes';
  let busca = '';
  let carregou = false;
  const enviando = new Set();

  function carregar(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function guardar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }

  const dinheiro = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  function lerValor(t) {
    const s = String(t == null ? '' : t).trim().replace(/[^\d,.]/g, '');
    if (!s) return null;
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
  }
  function el(tag, props, filhos) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    (filhos || []).forEach((f) => e.append(f));
    return e;
  }
  let avisoTimer = null;
  function mostrarAviso(texto, erro) {
    aviso.textContent = texto;
    aviso.classList.toggle('erro', !!erro);
    aviso.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.hidden = true; }, erro ? 6000 : 2000);
  }

  function valorAtual(it) {
    if (rascunho[it.chave] != null) return rascunho[it.chave];
    if (aprovados[it.chave]) return aprovados[it.chave].custo;
    return it.sugerido;
  }
  function aprovado(it) { return !!aprovados[it.chave]; }
  function mudou(it) { return aprovado(it) && rascunho[it.chave] != null && rascunho[it.chave] !== aprovados[it.chave].custo; }
  function visivel(it) {
    if (busca && !it.produto.toLowerCase().includes(busca)) return false;
    if (filtro === 'pendentes') return !aprovado(it) || mudou(it);
    if (filtro === 'aprovados') return aprovado(it);
    if (filtro === 'atencao') return it.atencao;
    return true;
  }

  function nomeOk() {
    const nome = campoNome.value.trim();
    if (nome) { guardar(CHAVE_NOME, nome); return nome; }
    campoNome.focus();
    campoNome.scrollIntoView({ block: 'center' });
    mostrarAviso('Digite seu nome antes de aprovar.', true);
    return null;
  }

  async function enviar(lote, msg) {
    if (!url) { mostrarAviso('A planilha ainda não foi configurada no app.', true); return; }
    const nome = nomeOk();
    if (!nome) return;
    lote.forEach((it) => enviando.add(it.chave));
    render();
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao: 'custos', responsavel: nome,
          itens: lote.map((it) => ({ categoria: it.categoria, produto: it.produto, custo: valorAtual(it) })) }),
      });
      const json = await r.json();
      if (!json.ok) throw new Error(json.erro || 'erro');
      const agora = new Date().toISOString();
      lote.forEach((it) => {
        aprovados[it.chave] = { custo: valorAtual(it), por: nome, em: agora };
        delete rascunho[it.chave];
      });
      guardar(CHAVE_RASCUNHO, rascunho);
      mostrarAviso(msg);
    } catch (e) {
      mostrarAviso('Não consegui gravar na planilha. Confira a internet e tente de novo.', true);
    } finally {
      lote.forEach((it) => enviando.delete(it.chave));
      render();
    }
  }

  function linhaItem(it) {
    const ok = aprovado(it);
    const ocupado = enviando.has(it.chave);
    const li = el('div', { className: 'item' + (ok ? ' aprovado' : '') + (mudou(it) ? ' mudou' : '') + (it.atencao ? ' atencao' : '') });
    const input = el('input', { type: 'text', inputMode: 'decimal', value: dinheiro(valorAtual(it)), id: 'v' + it.i, className: 'num' });
    input.setAttribute('aria-label', 'Custo de ' + it.produto);
    const btn = el('button', { type: 'button', className: 'btn-ok', disabled: ocupado || !carregou });
    if (ocupado) btn.append(el('span', { className: 'carregando' }));
    else btn.textContent = mudou(it) ? 'Atualizar' : ok ? 'Aprovado ✓' : 'Aprovar';

    input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('change', () => {
      const v = lerValor(input.value);
      if (v === null) { input.value = dinheiro(valorAtual(it)); mostrarAviso('Digite um valor como 12,50.', true); return; }
      const base = ok ? aprovados[it.chave].custo : it.sugerido;
      if (v === base) delete rascunho[it.chave]; else rascunho[it.chave] = v;
      guardar(CHAVE_RASCUNHO, rascunho);
      render();
    });
    btn.addEventListener('click', () => {
      if (ok && !mudou(it)) { mostrarAviso('Já aprovado. Para mudar, digite outro valor e toque em Atualizar.'); return; }
      enviar([it], `${it.produto}: aprovado`);
    });

    const nome = el('div', { className: 'nome' }, [it.produto, el('br'),
      el('span', { className: 'un', textContent: it.unidade === 'kg' ? 'por kg' : '1 un. = ' + it.unidade })]);
    const preco = el('label', { className: 'preco', htmlFor: input.id }, [el('span', { textContent: 'R$' }), input]);
    const meta = el('div', { className: 'meta' });
    if (ok) {
      const a = aprovados[it.chave];
      meta.append(el('span', { className: 'feito', textContent: `Aprovado${a.por ? ' por ' + a.por : ''}: R$ ${dinheiro(a.custo)}` }), ' · ');
    }
    if (valorAtual(it) !== it.sugerido) meta.append(`Sugerido: R$ ${dinheiro(it.sugerido)} · `);
    meta.append(it.origem);
    if (it.obs) { meta.append(' · '); meta.append(it.atencao ? el('b', { textContent: it.obs }) : it.obs); }
    li.append(nome, el('div', { className: 'acoes' }, [preco, btn]), meta);
    return li;
  }

  function render() {
    const total = itens.length;
    const feitos = itens.filter(aprovado).length;
    const atencao = itens.filter((it) => it.atencao && !aprovado(it)).length;
    document.getElementById('contagem').textContent = carregou ? `${feitos} de ${total} aprovados` : `${total} produtos`;
    document.getElementById('barra').style.width = (feitos / total * 100) + '%';
    document.getElementById('f-atencao').textContent = atencao ? `Atenção (${atencao})` : 'Atenção';

    const foco = document.activeElement && document.activeElement.id;
    lista.replaceChildren();
    let algum = false;
    categorias.forEach((cat) => {
      const daCat = itens.filter((it) => it.categoria === cat);
      const vis = daCat.filter(visivel);
      if (!vis.length) return;
      algum = true;
      const pend = daCat.filter((it) => !aprovado(it) || mudou(it));
      const cab = el('div', { className: 'cat-cab' }, [
        el('div', {}, [el('h2', { textContent: cat }),
          el('span', { className: 'resumo num', textContent: `${daCat.length - daCat.filter((it) => !aprovado(it)).length} de ${daCat.length} aprovados` })]),
      ]);
      if (pend.length && carregou) {
        const b = el('button', { type: 'button', className: 'btn-cat', textContent: `Aprovar ${pend.length} pendente${pend.length > 1 ? 's' : ''}` });
        b.disabled = pend.some((it) => enviando.has(it.chave));
        b.addEventListener('click', () => enviar(pend, `${cat}: ${pend.length} aprovado${pend.length > 1 ? 's' : ''}`));
        cab.append(b);
      }
      lista.append(el('section', { className: 'cat' }, [cab, ...vis.map(linhaItem)]));
    });
    if (!algum) {
      const msg = filtro === 'pendentes' && !busca ? 'Tudo aprovado! Os custos já estão na planilha e no Painel DRE.' : 'Nenhum produto neste filtro.';
      lista.append(el('div', { className: 'faixa info', textContent: msg }));
    }
    if (foco) { const f = document.getElementById(foco); if (f && f.tagName === 'INPUT') f.focus({ preventScroll: true }); }
  }

  async function buscarAprovados() {
    faixa.className = 'faixa info';
    faixa.hidden = false;
    faixa.replaceChildren(el('span', { className: 'carregando' }), ' Buscando o que já foi aprovado…');
    if (!url) {
      faixa.className = 'faixa erro';
      faixa.textContent = 'A planilha ainda não foi ligada ao app. Dá para conferir os valores, mas não para aprovar.';
      return;
    }
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'acao=custos');
      const json = await r.json();
      if (!json.ok || !Array.isArray(json.custos)) throw new Error('resposta');
      aprovados = {};
      json.custos.forEach((c) => { aprovados[c.categoria + '|' + c.produto] = { custo: Number(c.custo), por: c.por, em: c.em }; });
      carregou = true;
      faixa.hidden = true;
    } catch (e) {
      faixa.className = 'faixa erro';
      faixa.replaceChildren('Não consegui falar com a planilha, então ainda não dá para aprovar. ',
        el('button', { type: 'button', className: 'btn-texto', textContent: 'Tentar de novo', onclick: () => buscarAprovados().then(render) }));
    }
  }

  campoNome.value = carregar(CHAVE_NOME) || '';
  document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  let buscaTimer = null;
  document.getElementById('busca').addEventListener('input', (e) => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { busca = e.target.value.trim().toLowerCase(); render(); }, 150);
  });
  // Ao voltar para a página, atualiza o que o sócio já aprovou.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && carregou && !enviando.size) buscarAprovados().then(render);
  });

  render();
  buscarAprovados().then(render);
})();
