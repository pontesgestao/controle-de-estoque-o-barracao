(function () {
  'use strict';

  const CHAVE_RASCUNHO = 'obarracao-contagem-v2';
  const CHAVE_EMBALAGENS = 'obarracao-embalagens-v1';
  const CHAVE_NAO_TRABALHA = 'obarracao-nao-trabalha-v1';
  const CHAVE_PERFIL = 'obarracao-perfil-v1';
  const CHAVE_ULTIMA = 'obarracao-ultima-v1';
  const CHAVE_PRODUTOS_NOVOS = 'obarracao-produtos-novos-v1';
  const app = document.getElementById('app');

  // Produtos criados no Painel DRE (aba "Produtos novos" da planilha) entram
  // no fim da categoria deles, ou numa categoria nova no fim da lista.
  // Cada item ganha um id pelo nome (categoria + produto), assim incluir ou
  // reordenar produtos não embaralha uma contagem que já estava em andamento.
  function montarCategorias(extras) {
    const lista = window.CATEGORIAS.map((cat) => ({ nome: cat.nome, itens: cat.itens.slice() }));
    (extras || []).forEach((p) => {
      let cat = lista.find((c) => c.nome.toLowerCase() === p.categoria.toLowerCase());
      if (!cat) { cat = { nome: p.categoria, itens: [] }; lista.push(cat); }
      if (!cat.itens.some((it) => it.nome.toLowerCase() === p.produto.toLowerCase())) cat.itens.push({ nome: p.produto, medida: 'un' });
    });
    return lista.map((cat) => ({
      nome: cat.nome,
      itens: cat.itens.map((item) => ({ ...item, id: cat.nome + '|' + item.nome })),
    }));
  }
  let produtosNovos = carregar(CHAVE_PRODUTOS_NOVOS) || [];
  let categorias = montarCategorias(produtosNovos);
  let totalItens = categorias.reduce((s, c) => s + c.itens.length, 0);

  // Busca a lista atualizada de produtos novos. Ela vale a partir da próxima
  // contagem iniciada, para não mudar uma contagem em andamento.
  function buscarProdutosNovos() {
    const url = (window.CONFIG.URL_PLANILHA || '').trim();
    if (!url) return Promise.resolve();
    return fetch(url + (url.includes('?') ? '&' : '?') + 'acao=produtos')
      .then((r) => r.json())
      .then((json) => {
        if (!json || !Array.isArray(json.produtos)) return;
        produtosNovos = json.produtos.filter((p) => p && p.categoria && p.produto);
        guardar(CHAVE_PRODUTOS_NOVOS, produtosNovos);
      })
      .catch(() => { /* sem internet: usa a última lista guardada */ });
  }

  let estado = carregar(CHAVE_RASCUNHO) || null;

  // ---------- Utilidades ----------
  function carregar(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ }
  }
  function apagar(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ }
  }
  function salvar() { guardar(CHAVE_RASCUNHO, estado); }

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Aceita "2", "2,5", "2.5" e "1/2".
  function lerNumero(texto) {
    const t = String(texto || '').trim().replace(',', '.');
    if (t === '') return null;
    if (/^\d+\s*\/\s*\d+$/.test(t)) {
      const [a, b] = t.split('/').map(Number);
      return b ? a / b : null;
    }
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function formatar(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
  }

  // Cada item guarda: modo ('un' | 'cx' | 'zero'), q (unidades),
  // por (unidades por embalagem), cx (embalagens fechadas) e s (soltas).
  function valor(id) { return estado.valores[id] || {}; }
  function pulada(ci) { return !!(estado.puladas && estado.puladas[categorias[ci].nome]); }

  function itemCompleto(id) {
    const v = valor(id);
    if (v.modo === 'zero' || v.modo === 'nt') return true;
    if (v.modo === 'un') return lerNumero(v.q) !== null;
    if (v.modo === 'cx') return lerNumero(v.por) > 0 && lerNumero(v.cx) !== null;
    return false;
  }
  function totalUnidades(v) {
    if (v.modo === 'zero') return 0;
    if (v.modo === 'un') return lerNumero(v.q);
    if (v.modo === 'cx') return (lerNumero(v.cx) || 0) * (lerNumero(v.por) || 0) + (lerNumero(v.s) || 0);
    return null;
  }

  const EMBALAGENS = { caixa: 'caixas', pacote: 'pacotes', fardo: 'fardos', 'pacote grande': 'pacotes grandes' };
  function embalagem(it) { return EMBALAGENS[it.medida] ? it.medida : 'caixa/pacote'; }
  function embalagens(it) { return EMBALAGENS[it.medida] || 'caixas/pacotes'; }

  function perguntaFechadas(it) {
    if (it.medida === 'caixa') return 'Quantas <strong>caixas fechadas</strong>?';
    if (EMBALAGENS[it.medida]) return `Quantos <strong>${embalagens(it)} fechados</strong>?`;
    return 'Quantas <strong>caixas ou pacotes fechados</strong>?';
  }

  // Texto da contagem de um item, usado na revisão e no PDF.
  function descrever(it, v) {
    if (v.modo === 'zero') return 'Zero';
    if (v.modo === 'nt') return 'Não trabalha com este produto';
    if (v.modo === 'un') return `${formatar(lerNumero(v.q))} un`;
    if (v.modo === 'cx') {
      const cx = lerNumero(v.cx) || 0;
      const s = lerNumero(v.s) || 0;
      return `${formatar(cx)} ${cx === 1 ? embalagem(it) : embalagens(it)} × ${formatar(lerNumero(v.por))}` +
        (s ? ` + ${formatar(s)} soltas` : '') + ` = ${formatar(totalUnidades(v))} un`;
    }
    return '';
  }

  function categoriaCompleta(ci) { return pulada(ci) || categorias[ci].itens.every((it) => itemCompleto(it.id)); }
  function liberada(ci) {
    for (let i = 0; i < ci; i++) if (!categoriaCompleta(i)) return false;
    return true;
  }
  // Categoria marcada como não contada conta como concluída no progresso.
  function contarPreenchidos() {
    let n = 0;
    categorias.forEach((c, ci) => c.itens.forEach((it) => { if (pulada(ci) || itemCompleto(it.id)) n++; }));
    return n;
  }
  function porcentagem() { return Math.round((contarPreenchidos() / totalItens) * 100); }

  function gerarId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------- Tela inicial ----------
  function telaInicio() {
    const perfil = carregar(CHAVE_PERFIL) || {};
    const temRascunho = estado && estado.valores && Object.keys(estado.valores).length > 0;
    const ultima = carregar(CHAVE_ULTIMA);
    const unidades = (window.CONFIG.UNIDADES || []).filter(Boolean);

    const campoUnidade = unidades.length
      ? `<select id="unidade" required>
           <option value="">Selecione a unidade</option>
           ${unidades.map((u) => `<option ${u === perfil.unidade ? 'selected' : ''}>${esc(u)}</option>`).join('')}
         </select>`
      : `<input id="unidade" type="text" autocomplete="organization" placeholder="Ex.: Loja Centro" value="${esc(perfil.unidade || '')}" required>`;

    app.innerHTML = `
      <section class="inicio">
        <img class="logo" src="img/logo.png" alt="O Barracão">
        <div class="faixa-titulo">
          <h1>Contagem de estoque</h1>
          <p>Preencha categoria por categoria. Seu progresso fica salvo neste aparelho.</p>
        </div>

        ${temRascunho ? `
          <div class="cartao pilha">
            <p class="aviso">Você tem uma contagem em andamento de <strong>${esc(estado.unidade)}</strong>
              (${porcentagem()}% concluída).</p>
            <button class="btn btn-primario btn-bloco" id="continuar">Continuar contagem</button>
            <button class="btn btn-texto" id="descartar">Descartar e começar outra</button>
          </div>` : `
          <form class="cartao" id="form-inicio" novalidate>
            <div class="campo">
              <label for="unidade">Unidade</label>
              ${campoUnidade}
            </div>
            <div class="campo">
              <label for="responsavel">Seu nome</label>
              <input id="responsavel" type="text" autocomplete="name" placeholder="Nome do gerente" value="${esc(perfil.responsavel || '')}" required>
            </div>
            <p class="aviso aviso-erro" id="erro-inicio" hidden></p>
            <button class="btn btn-primario btn-bloco" type="submit">Iniciar contagem</button>
          </form>`}
        ${ultima ? `
          <button class="btn btn-texto" id="ver-ultima">Compartilhar a última contagem enviada
            (${esc(new Date(ultima.enviadoEm).toLocaleDateString('pt-BR'))})</button>` : ''}
      </section>`;

    if (ultima) document.getElementById('ver-ultima').onclick = () => telaSucesso(ultima);

    if (temRascunho) {
      document.getElementById('continuar').onclick = () => telaContagem(estado.passo || 0);
      document.getElementById('descartar').onclick = () => {
        if (!confirm('Descartar a contagem em andamento? Os números digitados serão perdidos.')) return;
        estado = null;
        apagar(CHAVE_RASCUNHO);
        telaInicio();
      };
      return;
    }

    document.getElementById('form-inicio').onsubmit = async (e) => {
      e.preventDefault();
      const unidade = document.getElementById('unidade').value.trim();
      const responsavel = document.getElementById('responsavel').value.trim();
      const erro = document.getElementById('erro-inicio');
      if (!unidade || !responsavel) {
        erro.textContent = 'Informe a unidade e o seu nome para começar.';
        erro.hidden = false;
        return;
      }
      guardar(CHAVE_PERFIL, { unidade, responsavel });
      // Busca de novo os produtos criados no painel, para a contagem já sair
      // com a lista mais recente (espera no máximo 5 segundos).
      const botao = e.target.querySelector('button[type=submit]');
      botao.disabled = true;
      botao.innerHTML = '<span class="carregando"></span> Preparando a contagem…';
      await Promise.race([buscarProdutosNovos(), new Promise((ok) => setTimeout(ok, 5000))]);
      // Já deixa marcados os produtos que esta loja informou não trabalhar.
      categorias = montarCategorias(produtosNovos);
      totalItens = categorias.reduce((s, c) => s + c.itens.length, 0);
      const valores = {};
      Object.keys((carregar(CHAVE_NAO_TRABALHA) || {})[unidade] || {}).forEach((id) => { valores[id] = { modo: 'nt' }; });
      estado = { id: gerarId(), unidade, responsavel, iniciadoEm: new Date().toISOString(), valores, puladas: {}, passo: 0, observacoes: '' };
      salvar();
      telaContagem(0);
    };
  }

  // ---------- Topo com progresso e etapas ----------
  function htmlTopo(passoAtual) {
    const etapas = categorias.map((c, ci) => {
      let classe = 'etapa';
      if (ci === passoAtual) classe += ' atual';
      else if (pulada(ci)) classe += ' pulada';
      else if (categoriaCompleta(ci)) classe += ' feita';
      else if (!liberada(ci)) classe += ' bloqueada';
      const marca = ci === passoAtual ? ci + 1 : (pulada(ci) ? '–' : (categoriaCompleta(ci) ? '✓' : ci + 1));
      return `<button class="${classe}" data-passo="${ci}" ${liberada(ci) ? '' : 'aria-disabled="true"'}>
                <span class="num">${marca}</span>${esc(c.nome)}</button>`;
    }).join('');
    const revisaoLiberada = liberada(categorias.length);
    const revisao = `<button class="etapa ${passoAtual === 'revisao' ? 'atual' : ''} ${revisaoLiberada ? '' : 'bloqueada'}" data-passo="revisao">
                       <span class="num">★</span>Revisar e enviar</button>`;
    const p = porcentagem();
    return `
      <header class="topo">
        <div class="topo-linha">
          <div class="marca"><span>FAST</span><span class="tag-azul">SHAKE</span><span class="loja">· ${esc(estado.unidade)}</span></div>
          <div class="porcentagem" id="pct">${p}%</div>
        </div>
        <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" id="barra"><div style="width:${p}%"></div></div>
        <div class="topo-sub"><span id="itens-feitos">${contarPreenchidos()} de ${totalItens} itens</span><span>${esc(estado.responsavel)}</span></div>
      </header>
      <nav class="etapas" aria-label="Categorias">${etapas}${revisao}</nav>`;
  }

  function ligarEtapas() {
    app.querySelectorAll('.etapa').forEach((b) => {
      b.onclick = () => {
        const alvo = b.dataset.passo;
        if (alvo === 'revisao') { if (liberada(categorias.length)) telaRevisao(); return; }
        const ci = Number(alvo);
        if (liberada(ci)) telaContagem(ci);
      };
    });
    const atual = app.querySelector('.etapa.atual');
    if (atual) atual.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function atualizarProgresso() {
    const p = porcentagem();
    document.getElementById('pct').textContent = p + '%';
    const barra = document.getElementById('barra');
    barra.setAttribute('aria-valuenow', p);
    barra.firstElementChild.style.width = p + '%';
    document.getElementById('itens-feitos').textContent = `${contarPreenchidos()} de ${totalItens} itens`;
  }

  // ---------- Contagem de uma categoria ----------
  function htmlContador(campo, rotulo, valorCampo) {
    return `
      <div class="contador-qtd">
        <button type="button" data-acao="menos" aria-label="Diminuir ${esc(rotulo)}">−</button>
        <input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
               aria-label="${esc(rotulo)}" placeholder="–" value="${esc(valorCampo || '')}" data-campo="${campo}">
        <button type="button" data-acao="mais" aria-label="Aumentar ${esc(rotulo)}">+</button>
      </div>`;
  }

  function htmlItem(it) {
    const v = valor(it.id);
    const modo = v.modo || 'nenhum';
    const opcao = (m, texto) =>
      `<button type="button" role="radio" data-modo="${m}" aria-checked="${v.modo === m}">${texto}</button>`;
    return `
      <li class="item modo-${modo} ${itemCompleto(it.id) ? 'preenchido' : ''}" data-id="${esc(it.id)}">
        <div class="item-nome"><span class="ok" aria-hidden="true">✓</span>${esc(it.nome)}</div>
        <div class="pergunta-linha">
          <p class="pergunta">Como você contou?</p>
          <button type="button" class="link-nt" data-nt="sim">Não trabalho com este produto</button>
        </div>
        <div class="forma" role="radiogroup" aria-label="Como você contou ${esc(it.nome)}?">
          ${opcao('un', 'Unidade')}
          ${opcao('cx', 'Caixa, fardo<br>ou pacote')}
          ${opcao('zero', 'Não tem<br>(zero)')}
        </div>

        <div class="campos campos-un">
          <div class="linha">
            <label>Quantas <strong>unidades</strong>?</label>
            ${htmlContador('q', `Unidades de ${it.nome}`, v.q)}
          </div>
        </div>

        <div class="campos campos-cx">
          <div class="linha">
            <label>Quantas unidades vêm em <strong>cada ${esc(embalagem(it))}</strong>?</label>
            <input class="campo-curto" type="text" inputmode="numeric" autocomplete="off" placeholder="?"
                   value="${esc(v.por || '')}" data-campo="por" aria-label="Unidades em cada ${esc(embalagem(it))} de ${esc(it.nome)}">
          </div>
          <div class="linha">
            <label>${perguntaFechadas(it)}</label>
            ${htmlContador('cx', `${embalagens(it)} fechados de ${it.nome}`, v.cx)}
          </div>
          <div class="linha">
            <label>Unidades <strong>soltas</strong> <small>(se tiver)</small></label>
            <input class="campo-curto" type="text" inputmode="numeric" autocomplete="off" placeholder="0"
                   value="${esc(v.s || '')}" data-campo="s" aria-label="Unidades soltas de ${esc(it.nome)}">
          </div>
          <p class="conta" data-conta></p>
        </div>
        <p class="nt-aviso">Sua loja não trabalha com este produto.
          <button type="button" class="btn-texto" data-nt="nao">Desfazer</button></p>
      </li>`;
  }

  function telaContagem(ci) {
    if (!liberada(ci)) ci = 0;
    estado.passo = ci;
    salvar();
    const cat = categorias[ci];
    const ultima = ci === categorias.length - 1;
    const naoContada = pulada(ci);

    app.innerHTML = `
      ${htmlTopo(ci)}
      <section class="conteudo">
        <div class="cabecalho-categoria">
          <h2>${esc(cat.nome)}</h2>
          <span class="contador" id="contador-cat"></span>
        </div>
        ${naoContada ? `
          <div class="cartao aviso-pulada">
            <p><strong>Categoria não contada hoje.</strong><br>Ela não entra nesta contagem.</p>
            <button class="btn btn-secundario btn-bloco" id="desfazer-pular">Desfazer, vou contar esta categoria</button>
          </div>` : `
          <button class="btn-pular" id="pular">
            <span class="icone" aria-hidden="true">⏭</span>
            <span><strong>Não contei esta categoria hoje</strong><small>Toque aqui para pular para a próxima</small></span>
          </button>
          <p class="dica">Para cada item, escolha <strong>como contou</strong>. Se contou em caixa, fardo ou pacote, informe quantas unidades vêm em cada um.</p>
          <ul class="itens">${cat.itens.map(htmlItem).join('')}</ul>`}
      </section>
      <footer class="rodape">
        <div class="rodape-interno">
          <button class="btn btn-secundario" id="voltar">${ci === 0 ? 'Início' : '← Anterior'}</button>
          <button class="btn btn-primario" id="avancar">${ultima ? 'Revisar →' : 'Próxima →'}</button>
          <p class="falta" id="falta"></p>
        </div>
      </footer>`;

    ligarEtapas();

    const btnAvancar = document.getElementById('avancar');
    const irParaProxima = () => (ultima ? telaRevisao() : telaContagem(ci + 1));
    document.getElementById('voltar').onclick = () => (ci === 0 ? telaInicio() : telaContagem(ci - 1));
    btnAvancar.onclick = () => { if (categoriaCompleta(ci)) irParaProxima(); };

    function atualizarCategoria() {
      const feitos = cat.itens.filter((it) => itemCompleto(it.id)).length;
      const falta = naoContada ? 0 : cat.itens.length - feitos;
      document.getElementById('contador-cat').textContent = naoContada ? 'Não contada' : `${feitos}/${cat.itens.length}`;
      btnAvancar.disabled = falta > 0;
      document.getElementById('falta').textContent = falta > 0
        ? `Falta${falta > 1 ? 'm' : ''} ${falta} ${falta > 1 ? 'itens' : 'item'} para liberar a próxima etapa`
        : (naoContada ? 'Categoria não contada hoje' : 'Categoria completa!');
      atualizarProgresso();
      // Atualiza as bolinhas das etapas sem redesenhar a tela.
      app.querySelectorAll('.etapa').forEach((b) => {
        const alvo = b.dataset.passo;
        const idx = alvo === 'revisao' ? categorias.length : Number(alvo);
        const ok = liberada(idx);
        b.classList.toggle('bloqueada', !ok && idx !== ci);
        if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
        if (alvo !== 'revisao' && idx !== ci) {
          b.classList.toggle('feita', categoriaCompleta(idx) && !pulada(idx));
          b.classList.toggle('pulada', pulada(idx));
          b.querySelector('.num').textContent = pulada(idx) ? '–' : (categoriaCompleta(idx) ? '✓' : idx + 1);
        }
      });
    }

    if (naoContada) {
      document.getElementById('desfazer-pular').onclick = () => {
        delete estado.puladas[cat.nome];
        salvar();
        telaContagem(ci);
      };
      atualizarCategoria();
      window.scrollTo(0, 0);
      return;
    }

    document.getElementById('pular').onclick = () => {
      if (!confirm(`Marcar "${cat.nome}" como NÃO CONTADA hoje?\n\nEla não vai entrar nesta contagem.`)) return;
      estado.puladas = estado.puladas || {};
      estado.puladas[cat.nome] = true;
      salvar();
      irParaProxima();
    };

    const lista = app.querySelector('.itens');
    const memoria = carregar(CHAVE_EMBALAGENS) || {};

    function atualizarItem(li) {
      const id = li.dataset.id;
      const it = cat.itens.find((x) => x.id === id);
      const v = valor(id);
      li.className = `item modo-${v.modo || 'nenhum'} ${itemCompleto(id) ? 'preenchido' : ''}`;
      li.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modo === v.modo)));
      const conta = li.querySelector('[data-conta]');
      if (v.modo === 'cx') {
        if (!(lerNumero(v.por) > 0)) conta.innerHTML = `Informe quantas unidades vêm em cada ${esc(embalagem(it))}.`;
        else if (lerNumero(v.cx) === null) conta.innerHTML = `Informe quantas embalagens fechadas você contou.`;
        else conta.innerHTML = `Total: <strong>${formatar(totalUnidades(v))} unidades</strong><br><small>${esc(descrever(it, v))}</small>`;
        conta.classList.toggle('pronta', itemCompleto(id));
      }
    }

    function gravar(li, mudancas) {
      const id = li.dataset.id;
      estado.valores[id] = { ...valor(id), ...mudancas };
      salvar();
      atualizarItem(li);
      atualizarCategoria();
    }

    lista.addEventListener('input', (e) => {
      const input = e.target;
      if (!input.dataset.campo) return;
      // Mantém só números, vírgula, ponto e barra.
      const limpo = input.value.replace(/[^\d.,/]/g, '');
      if (limpo !== input.value) input.value = limpo;
      const li = input.closest('.item');
      if (input.dataset.campo === 'por' && lerNumero(limpo) > 0) {
        memoria[li.dataset.id] = limpo;
        guardar(CHAVE_EMBALAGENS, memoria);
      }
      gravar(li, { [input.dataset.campo]: limpo });
    });

    lista.addEventListener('click', (e) => {
      const li = e.target.closest('.item');
      if (!li) return;

      const nt = e.target.closest('[data-nt]');
      if (nt) {
        const marcar = nt.dataset.nt === 'sim';
        const lista = carregar(CHAVE_NAO_TRABALHA) || {};
        const daLoja = lista[estado.unidade] || {};
        if (marcar) daLoja[li.dataset.id] = true; else delete daLoja[li.dataset.id];
        lista[estado.unidade] = daLoja;
        guardar(CHAVE_NAO_TRABALHA, lista);
        gravar(li, { modo: marcar ? 'nt' : undefined });
        return;
      }

      const opcao = e.target.closest('[data-modo]');
      if (opcao) {
        const mudancas = { modo: opcao.dataset.modo };
        // Sugere a quantidade por embalagem usada na última vez neste aparelho.
        if (mudancas.modo === 'cx' && !valor(li.dataset.id).por && memoria[li.dataset.id]) {
          mudancas.por = memoria[li.dataset.id];
          li.querySelector('[data-campo="por"]').value = mudancas.por;
        }
        gravar(li, mudancas);
        const primeiro = li.querySelector(mudancas.modo === 'un' ? '[data-campo="q"]' : '[data-campo="por"]');
        if (mudancas.modo !== 'zero' && primeiro && !primeiro.value) primeiro.focus();
        return;
      }

      const botao = e.target.closest('button[data-acao]');
      if (!botao) return;
      const input = botao.parentElement.querySelector('input');
      const atual = lerNumero(input.value);
      let novo;
      if (botao.dataset.acao === 'mais') novo = atual === null ? 1 : Math.floor(atual) + 1;
      else novo = atual === null ? 0 : Math.max(0, Math.ceil(atual) - 1);
      input.value = formatar(novo);
      gravar(li, { [input.dataset.campo]: input.value });
    });

    // "Enter"/"próximo" do teclado leva ao próximo campo visível vazio.
    lista.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const campos = [...lista.querySelectorAll('input')].filter((c) => c.offsetParent !== null);
      const i = campos.indexOf(e.target);
      const proximo = campos.slice(i + 1).find((c) => c.value === '') || campos[i + 1];
      if (proximo) proximo.focus(); else e.target.blur();
    });

    lista.addEventListener('focusin', (e) => {
      if (e.target.matches('input')) setTimeout(() => e.target.select(), 0);
    });

    lista.querySelectorAll('.item').forEach(atualizarItem);
    atualizarCategoria();
    window.scrollTo(0, 0);
  }

  // ---------- Revisão e envio ----------
  function montarEnvio() {
    const FORMAS = { un: 'Unidade', cx: 'Caixa/fardo/pacote', zero: 'Zero' };
    const itens = [];
    categorias.forEach((c, ci) => c.itens.forEach((it) => {
      const v = pulada(ci) ? {} : valor(it.id);
      const total = pulada(ci) ? '' : totalUnidades(v);
      itens.push({
        categoria: c.nome,
        produto: it.nome,
        situacao: pulada(ci) ? 'Não contada' : (v.modo === 'nt' ? 'Não trabalha' : 'Contada'),
        forma: FORMAS[v.modo] || '',
        descricao: pulada(ci) ? 'Não contada hoje' : descrever(it, v),
        embalagem: v.modo === 'cx' ? embalagem(it) : '',
        embalagens: v.modo === 'cx' ? lerNumero(v.cx) : '',
        unidadesPorEmbalagem: v.modo === 'cx' ? lerNumero(v.por) : '',
        unidadesSoltas: v.modo === 'cx' ? (lerNumero(v.s) || 0) : '',
        totalUnidades: total,
        // Campos do formato anterior, para a planilha não quebrar antes de o
        // Apps Script ser atualizado.
        quantidade: total,
        medida: 'un',
        avulsas: '',
      });
    }));
    return {
      id: estado.id,
      unidade: estado.unidade,
      responsavel: estado.responsavel,
      iniciadoEm: estado.iniciadoEm,
      enviadoEm: new Date().toISOString(),
      observacoes: estado.observacoes || '',
      categoriasNaoContadas: categorias.filter((c, ci) => pulada(ci)).map((c) => c.nome),
      itens,
    };
  }

  function telaRevisao() {
    if (!liberada(categorias.length)) return telaContagem(estado.passo || 0);
    estado.passo = categorias.length - 1;
    salvar();

    const blocos = categorias.map((c, ci) => `
      <article class="cartao revisao-cat ${pulada(ci) ? 'nao-contada' : ''}">
        <header>
          <h3>${esc(c.nome)}</h3>
          <button class="btn btn-texto" data-editar="${ci}">Corrigir</button>
        </header>
        ${pulada(ci) ? '<p class="selo-pulada">Não contada hoje</p>' : `
        <dl>${c.itens.map((it) => {
          const v = valor(it.id);
          const total = totalUnidades(v);
          return `<dt>${esc(it.nome)}${v.modo === 'cx' ? `<small>${esc(descrever(it, v).split(' = ')[0])}</small>` : ''}</dt>
                  <dd class="${total === 0 ? 'zero' : ''}${v.modo === 'nt' ? 'nt' : ''}">${
                    v.modo === 'zero' ? 'Zero' : v.modo === 'nt' ? 'Não trabalha' : `${formatar(total)} un`}</dd>`;
        }).join('')}</dl>`}
      </article>`).join('');

    app.innerHTML = `
      ${htmlTopo('revisao')}
      <section class="conteudo">
        <div class="cabecalho-categoria"><h2>Revisar e enviar</h2></div>
        <p class="dica">Confira os totais <strong>em unidades</strong>. Itens zerados aparecem em vermelho. Toque em <strong>Corrigir</strong> para ajustar.</p>
        ${blocos}
        <div class="cartao">
          <div class="campo">
            <label for="obs">Observações (opcional)</label>
            <textarea id="obs" placeholder="Ex.: produto vencido, embalagem avariada…">${esc(estado.observacoes || '')}</textarea>
          </div>
        </div>
      </section>
      <footer class="rodape">
        <div class="rodape-interno">
          <button class="btn btn-secundario" id="voltar">← Voltar</button>
          <button class="btn btn-azul" id="enviar">Enviar contagem</button>
          <p class="falta" id="status-envio">Depois de enviada, a contagem não pode ser alterada.</p>
        </div>
      </footer>`;

    ligarEtapas();
    app.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => telaContagem(Number(b.dataset.editar)); });
    document.getElementById('obs').oninput = (e) => { estado.observacoes = e.target.value; salvar(); };
    document.getElementById('voltar').onclick = () => telaContagem(categorias.length - 1);
    document.getElementById('enviar').onclick = enviar;
    window.PDFContagem.carregarLibs().catch(() => {});
    window.scrollTo(0, 0);
  }

  async function enviar() {
    const botao = document.getElementById('enviar');
    const status = document.getElementById('status-envio');
    const url = (window.CONFIG.URL_PLANILHA || '').trim();
    if (!url) {
      status.innerHTML = '<span class="aviso-erro">A planilha ainda não foi configurada. Avise o responsável.</span>';
      return;
    }
    if (!confirm('Enviar a contagem agora?')) return;

    botao.disabled = true;
    botao.innerHTML = '<span class="carregando"></span> Enviando…';
    status.textContent = 'Enviando, não feche esta página…';

    const dados = montarEnvio();
    try {
      // text/plain evita a verificação prévia (CORS) que o Apps Script não suporta.
      const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dados),
      });
      const json = await resposta.json();
      if (!json.ok) throw new Error(json.erro || 'Erro na planilha');
      apagar(CHAVE_RASCUNHO);
      guardar(CHAVE_ULTIMA, dados);
      estado = null;
      telaSucesso(dados);
    } catch (err) {
      botao.disabled = false;
      botao.textContent = 'Tentar enviar de novo';
      status.innerHTML = '<span class="aviso-erro">Não foi possível enviar. Verifique a internet e tente de novo — nada foi perdido.</span>';
    }
  }

  function telaSucesso(dados) {
    const data = new Date(dados.enviadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    app.innerHTML = `
      <section class="sucesso">
        <img class="logo" src="img/logo.png" alt="O Barracão">
        <div class="selo" aria-hidden="true">✓</div>
        <h1>Contagem enviada!</h1>
        <p><strong>${esc(dados.unidade)}</strong> · ${esc(dados.responsavel)}<br>${data}</p>
        <div class="cartao pilha compartilhar">
          <button class="btn btn-whatsapp btn-bloco" id="whatsapp" disabled>
            <span class="carregando"></span> Preparando PDF…
          </button>
          <button class="btn btn-texto" id="baixar" hidden>Só baixar o PDF</button>
          <p class="aviso" id="status-pdf">Envie o PDF da contagem pelo WhatsApp.</p>
        </div>
        <button class="btn btn-secundario" id="nova">Fazer nova contagem</button>
      </section>`;
    document.getElementById('nova').onclick = telaInicio;
    window.scrollTo(0, 0);

    // O PDF é gerado antes do toque: o celular só abre o menu de compartilhar
    // se o arquivo já estiver pronto no momento do clique.
    const botao = document.getElementById('whatsapp');
    const baixar = document.getElementById('baixar');
    const status = document.getElementById('status-pdf');
    window.PDFContagem.gerar(dados).then((arquivo) => {
      botao.disabled = false;
      botao.innerHTML = `${ICONE_WHATSAPP} Compartilhar no WhatsApp`;
      baixar.hidden = false;
      botao.onclick = async () => {
        const r = await window.PDFContagem.compartilhar(arquivo, dados);
        if (r === 'baixado') status.textContent = 'PDF baixado. Anexe o arquivo na conversa do WhatsApp que abriu.';
      };
      baixar.onclick = () => window.PDFContagem.baixar(arquivo);
    }).catch(() => {
      botao.innerHTML = 'Não foi possível gerar o PDF';
      status.innerHTML = '<span class="aviso-erro">Verifique a internet e toque em "Compartilhar a última contagem" na tela inicial. A contagem já está na planilha.</span>';
    });
  }

  const ICONE_WHATSAPP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';

  // Avisa antes de fechar a página no meio de um envio não concluído.
  window.addEventListener('beforeunload', (e) => {
    const botao = document.getElementById('enviar');
    if (botao && botao.disabled) { e.preventDefault(); e.returnValue = ''; }
  });

  buscarProdutosNovos();
  telaInicio();
})();
