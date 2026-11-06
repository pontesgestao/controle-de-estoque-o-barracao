# Replicar este sistema para um novo cliente

Este arquivo tem tudo o que é preciso para levar o sistema de **contagem de estoque + painel de DRE/CMV** para outro cliente, sem misturar nada com a Fast Shake.

- **Parte 1:** o que **você** faz (uns 10 minutos).
- **Parte 2:** o roteiro para o **agente (Claude)** do cliente novo seguir.

---

## Como o sistema funciona (resumo)

| Peça | Onde fica | O que faz |
| --- | --- | --- |
| **App de contagem** | GitHub Pages (ramo `main`: `index.html`, `css/`, `js/`, `img/`) | Os gerentes contam o estoque no celular, categoria por categoria, e enviam. Gera o PDF para o WhatsApp. |
| **Script da planilha** | Google Apps Script dentro da planilha (`apps-script/Codigo.gs`) | Recebe as contagens e grava nas abas **Resumo** e **Contagens**. Também entrega ao app a lista de **Produtos novos**. |
| **Painel DRE/CMV** | Projeto Apps Script separado, publicado como "Somente eu" (ramo `painel-dre`, pasta `painel-dre/`) | CMV por loja e período, compras lidas da nota fiscal por IA, custos e faturamento. |

```
Celular do gerente ──▶ Script da planilha ──▶ Planilha Google ◀── Painel DRE (só o dono)
                                                    ▲
                                    Foto/PDF da nota ──▶ IA (Claude) ──┘
```

---

## Parte 1 — O que você faz

### 1. Copiar o código para um repositório novo
1. No repositório **controle-de-estoque-fast-shake**, abra **Settings** e marque **Template repository** (só na primeira vez).
2. Na página inicial do repositório, clique em **Use this template → Create a new repository**.
3. Preencha:
   - **Nome:** `controle-de-estoque-NOMEDOCLIENTE`
   - **Public** (o GitHub Pages gratuito exige)
   - Marque **Include all branches**, para levar o ramo `painel-dre`.
4. Libere o acesso do Claude ao repositório novo: https://github.com/apps/claude/installations/select_target

### 2. Criar o agente do cliente novo
1. Em **claude.ai/code**, comece uma **sessão nova** e selecione **somente o repositório novo**.
2. Envie como primeira mensagem:

> Este repositório é uma cópia de um sistema que fiz para outro cliente. Agora ele é do cliente **[NOME DO CLIENTE]**. Leia o arquivo `REPLICAR-PARA-NOVO-CLIENTE.md` e siga a Parte 2. Comece me pedindo as informações do cliente.

3. Envie a **logo** do cliente quando o agente pedir.

### 3. Manter os clientes separados
- **Uma sessão do Claude por cliente.** Para voltar à Fast Shake, abra a sessão dela (ou uma sessão nova com o repositório `controle-de-estoque-fast-shake`).
- **Planilha, script e painel do Google novos para cada cliente.** Nunca reaproveite os da Fast Shake.
- De preferência, use a **conta Google do cliente** ou uma conta separada.
- Uma **chave da API da Anthropic por cliente** deixa o custo da leitura de notas separado.

---

## Parte 2 — Roteiro para o agente do cliente novo

> Agente: este repositório foi copiado do sistema da **Fast Shake** (sorveteria com 2 lojas). Adapte tudo ao novo cliente seguindo os passos abaixo, **sem perder nenhuma funcionalidade**. Converse em português e em linguagem simples: o usuário não é programador. Faça um commit por etapa e publique (`git push`) ao final de cada uma.

### Passo 0 — Pedir as informações do cliente
Pergunte ao usuário, de uma vez:
1. **Nome do cliente** e **segmento** (ex.: sorveteria, açaiteria, lanchonete).
2. **Logo** (imagem ou PDF). A identidade visual sai dela.
3. **Nomes das lojas/unidades**, exatamente como devem aparecer.
4. **Lista de produtos por categoria**, com a unidade em que cada um é contado (un, pacote, caixa, fardo, galão, balde…). Corrija a ortografia da lista e mostre ao usuário as correções e suposições que fizer.
5. Se cada loja tem uma **lista de produtos diferente** ou se todas usam a mesma.

### Passo 1 — Identidade visual
- Gere `img/logo.png` (fundo transparente, ~600 px de largura) e os ícones `img/icon-180.png`, `img/icon-192.png` e `img/icon-512.png` (logo centralizada sobre fundo branco). Comprima os PNGs.
- Extraia as **cores da marca** da logo e substitua as cores da Fast Shake (laranja `#ED4400` e azul `#273393`) em:
  - `css/estilo.css` (bloco `:root`)
  - `index.html` (`theme-color`) e `manifest.webmanifest` (`theme_color`, `background_color`)
  - `js/pdf.js` (constantes `LARANJA` e `AZUL`)
  - `apps-script/Codigo.gs` (cor do cabeçalho das abas)
  - no ramo `painel-dre`: `painel-dre/Painel.html` (bloco `:root`, cores dos gráficos `CORES_LOJA` e a cor das barras) e `painel-dre/Codigo.gs` (cor do cabeçalho das abas)
- As cores das lojas nos gráficos (`CORES_LOJA`) devem passar no validador de paleta (skill **dataviz**, `scripts/validate_palette.js`). Uma cor por loja, sempre na mesma ordem.
- Troque as fontes (Fredoka/Nunito) só se combinarem mal com a marca.

### Passo 2 — Textos, nomes e chaves (ramo `main`)
Troque **"Fast Shake"** pelo nome do cliente em:

| Arquivo | O que trocar |
| --- | --- |
| `index.html` | `<title>` |
| `manifest.webmanifest` | `name` e `short_name` |
| `js/app.js` | `alt` das imagens da logo; **prefixo `fastshake-` das chaves do `localStorage`** (use o nome do cliente, para nunca misturar dados se o mesmo celular abrir os dois apps) |
| `js/pdf.js` | rodapé do PDF e texto da mensagem do WhatsApp |
| `apps-script/Codigo.gs` | comentário do topo e o nome no `doGet` |
| `js/config.js` | **apague** o `URL_PLANILHA` da Fast Shake (deixe `''`) e preencha `UNIDADES` com as lojas do cliente |
| `js/produtos.js` | substitua toda a lista pelas categorias e produtos do cliente. Use `medida` com a unidade de contagem e `avulsas: true` só onde fizer sentido |
| `README.md` | reescreva para o cliente (nome da planilha, links do repositório novo) |

Confira com `git grep -i "fast shake\|fastshake\|fast-shake\|pontesgestao\|violim\|vivi xavier"` que não sobrou nada.

### Passo 3 — Painel (ramo `painel-dre`)

| Arquivo | O que trocar |
| --- | --- |
| `painel-dre/Codigo.gs` | `URL_TELA` (apontar para o **repositório novo**); `PASTA_FOTOS`; título no `doGet`; no prompt da IA em `lerNota`, o **segmento e o nome** do cliente; comentários do topo |
| `painel-dre/Painel.fonte.html` (depois rode `python3 painel-dre/montar.py`, que gera o `Painel.html`) | `<title>`; endereço da **logo** (GitHub Pages do repositório novo); texto "Link da planilha …"; link do aviso de atualização (repositório novo) |
| `painel-dre/README.md` | nome do cliente e da planilha |

Não mude `VERSAO_SERVIDOR`/`VERSAO_SERVIDOR_MINIMA` sem motivo. Quando alterar o `painel-dre/Codigo.gs` de um jeito que a tela dependa, aumente os dois juntos: assim o painel avisa o usuário para colar o código novo.

### Passo 4 — Testar antes de entregar
- Abra o app num **celular simulado** (Playwright, que já vem no ambiente) e teste o fluxo inteiro: início → categorias → as três formas de contagem (unidade, caixa/fardo/pacote, zero) → "Não contei esta categoria" → "Não trabalho com este produto" → revisão → envio (simule o Apps Script com `page.route`) → PDF.
- Teste o painel com `google.script.run` simulado e dados fictícios. Confira à mão o CMV de um produto (estoque inicial + compras − estoque final).
- Olhe as capturas de tela em celular pequeno (iPhone SE) e normal. Nada pode transbordar a largura da tela.

### Passo 5 — Guiar o usuário na parte do Google (nesta ordem)
1. **Planilha:** criar em sheets.new, colar `apps-script/Codigo.gs` em **Extensões → Apps Script**, executar a função **configurar** uma vez, publicar como **App da Web** (Executar como: Eu · Quem pode acessar: **Qualquer pessoa**) e pedir o URL `/exec`. Coloque esse URL em `js/config.js` e publique.
2. **GitHub Pages:** Settings → Pages → Branch `main` / `(root)` → Save. Link: `https://USUARIO.github.io/NOME-DO-REPOSITORIO/`. Peça para o usuário abrir no celular.
3. **Teste real:** o usuário faz uma contagem de teste e confirma que ela chegou na planilha. Depois, apaga as linhas de teste.
4. **Painel:** em script.google.com, criar um **projeto novo e separado** (nunca dentro da planilha). Colar `painel-dre/Codigo.gs` e criar o arquivo HTML **`Painel`** com `painel-dre/Painel.html`. Publicar como App da Web (Executar como: Eu · Quem pode acessar: **Somente eu**). Abrir o link, ir em **Configurações** e colar o link da planilha e a **chave da API da Anthropic** (console.anthropic.com → Billing → API Keys). Peça para o usuário **não** enviar a chave na conversa.
5. **Custos iniciais:** cadastrar na aba **Custos** do painel.

### Lições aprendidas (evite repetir)
- **Repositório:** o Claude não consegue criar repositórios nem ativar o GitHub Pages; o usuário faz isso. Push só funciona depois que o app do Claude tem acesso ao repositório.
- **Rede do ambiente:** o ambiente do Claude não acessa sites do Google nem o `github.io`. Teste tudo com simulações e peça ao usuário para conferir os resultados reais.
- **Cache do navegador:** a cada mudança no app, aumente o `?v=N` dos arquivos no `index.html`.
- **"Não foi possível abrir o arquivo" no painel:** acontece com várias contas Google logadas (`/u/1/` no endereço). O usuário deve abrir em janela anônima com a conta dona, ou trocar `/u/1/` por `/u/0/`.
- **Link colado errado:** já aconteceu de colarem HTML no campo do link. Peça para copiar direto da barra de endereço.
- **Unidade por embalagem ≠ peso:** galão de 7 kg = **1** unidade; "PK C/6" = 6. A IA foi instruída sobre isso, mas confira sempre na tela de conferência.
- **Impostos e folhas da nota:** IPI e ICMS-ST do item entram no custo. Nota com "Folha 1/2" precisa das fotos de todas as folhas. A diferença entre a soma dos itens e o total da nota quase sempre vem de uma dessas duas coisas.
- **Contagem à noite:** contagem feita a partir das 14h já inclui as compras do dia, então o painel corta as compras no dia seguinte.
- **Mudanças no script da planilha** exigem **Implantar → Gerenciar implantações → Editar → Nova versão** para manter o mesmo URL. Implantação nova muda o URL, e aí o `config.js` precisa ser atualizado.
- **Dados sensíveis:** o repositório é público. Nunca coloque chaves, senhas ou dados de vendas no código.
