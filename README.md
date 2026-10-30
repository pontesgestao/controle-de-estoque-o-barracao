# Controle de estoque O Barracão

App de contagem de estoque para os gerentes das unidades. Funciona no navegador do celular ou do computador, sem instalar nada.

- O gerente escolhe a unidade, informa o nome e conta os itens **categoria por categoria**.
- Em cada item, ele escolhe **como contou**: por unidade, por caixa/fardo/pacote (informando quantas unidades vêm em cada um) ou "não tem". O app converte tudo para **unidades**.
- Se uma categoria não foi contada no dia, o botão **"Não contei esta categoria hoje"** pula para a próxima, e ela aparece como "Não contada" na planilha e no PDF.
- A próxima categoria só libera quando a atual está completa, e dá para voltar e corrigir a qualquer momento.
- A porcentagem no topo mostra quanto da contagem já foi feito.
- O progresso fica salvo no aparelho: se o celular travar ou a página fechar, a contagem continua de onde parou.
- No final, o gerente revisa tudo e envia. **Os resultados vão para uma planilha Google que só você acessa.**
- Depois do envio, o gerente pode compartilhar um **PDF da contagem pelo WhatsApp** (com data, loja e nome de quem preencheu).

## Como os resultados chegam até você

```
Celular do gerente  ──envia──▶  Apps Script (seu)  ──grava──▶  Planilha Google (só sua)
```

O app só **envia** dados; ninguém consegue ler a planilha pelo app. O código deste repositório é público, mas não contém nenhuma contagem.

A planilha recebe duas abas:

| Aba | O que tem |
| --- | --- |
| **Resumo** | Uma linha por contagem enviada: data, unidade, responsável, quantos itens zerados, observações. |
| **Contagens** | Uma linha por produto de cada contagem: situação (contada / não contada), forma de contagem, embalagens fechadas, unidades por embalagem, unidades soltas e **total em unidades**. Use o filtro para ver uma unidade ou data. |

## Configuração (uma vez só, ~5 minutos)

### 1. Criar a planilha
1. Acesse [sheets.new](https://sheets.new) com a sua conta Google e dê o nome **Estoque O Barracão**.
2. Menu **Extensões → Apps Script**.

### 2. Colar o código e publicar
1. Apague o conteúdo do editor e cole todo o arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
2. (Opcional) Na linha `const EMAIL_AVISO = '';` coloque seu e-mail entre as aspas para receber um aviso a cada contagem.
3. Clique em **Salvar** (ícone de disquete).
4. Selecione a função **configurar** no menu de cima e clique em **Executar**. O Google vai pedir autorização: escolha sua conta → **Avançado** → **Acessar (não seguro)** → **Permitir**. (O aviso aparece porque o script é seu e não foi verificado pelo Google; é normal.)
5. Clique em **Implantar → Nova implantação** → engrenagem → **App da Web**:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
6. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).

### 3. Ligar o app à planilha
Abra [`js/config.js`](js/config.js) e cole o endereço:

```js
URL_PLANILHA: 'https://script.google.com/macros/s/.../exec',
```

Na mesma tela, preencha os nomes das lojas em `UNIDADES` (ex.: `['Loja Centro', 'Loja Shopping']`) para os gerentes escolherem numa lista.

> Se você alterar o código do Apps Script depois, use **Implantar → Gerenciar implantações → Editar → Nova versão** para manter o mesmo endereço.

## Editar a lista de produtos

Todos os produtos estão em [`js/produtos.js`](js/produtos.js), na ordem do passo a passo. Para incluir, remover ou renomear um item, edite só esse arquivo.

Carnes, laticínios, hortifrúti e preparos são contados **por peso**: o nome termina em **(kg)** e o item usa `medida: 'kg'`. No app, o gerente escolhe "Peso (kg)" ou "Pacote fechado" (informando quantos kg vêm em cada pacote). Na planilha, a coluna "Total (unidades)" desses itens fica em kg. Um produto criado no Painel DRE com "(kg)" no fim do nome também é contado por peso.

## Estrutura

```
index.html            página do app
css/estilo.css        identidade visual (vermelho #C01012 e preto #1C1C1C da marca)
js/config.js          endereço da planilha e lista de unidades
js/produtos.js        categorias e produtos
js/app.js             passo a passo, progresso e envio
js/pdf.js             PDF da contagem e compartilhamento no WhatsApp
apps-script/Codigo.gs código que grava na planilha
img/                  logo e ícones
```
