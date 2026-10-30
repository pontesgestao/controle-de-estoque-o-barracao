# Painel DRE / CMV — O Barracão

Painel separado do app de contagem. **Só você acessa**, entrando com a sua conta Google. O app de contagem usado pelos gerentes continua igual.

## O que ele faz

- **Resultado:** para cada loja, monta os períodos entre uma contagem e a seguinte e calcula:

  ```
  CMV   = estoque inicial + compras − estoque final
  CMV % = CMV ÷ faturamento
  Lucro bruto = faturamento − CMV
  ```

  O estoque é valorizado pelo custo por unidade vigente na data de cada contagem. Mostra o gráfico de CMV % por período (as duas lojas), o CMV por categoria, o detalhe por produto e alertas (produto sem custo, categoria não contada, consumo negativo).
- **Compras:** envie a foto da nota ou do cupom fiscal. A IA (Claude) lê os itens, associa aos produtos da contagem e você confere antes de salvar. As fotos ficam guardadas numa pasta do seu Google Drive.
- **Custos:** cada compra lançada atualiza o custo por unidade do produto (última compra). Nessa aba você cadastra o custo inicial ou corrige um valor.
- **Contagens:** lista as contagens recebidas. Desmarque contagens de teste ou repetidas para elas não formarem períodos.
- **Faturamento:** digitado direto na tabela de períodos da aba Resultado.

### Regras do cálculo

- Compras entram no período quando a data da compra é **igual ou posterior** ao dia da contagem inicial e **anterior** ao dia da contagem final.
- Contagem feita **a partir das 14h** já inclui as compras daquele dia na prateleira. Por isso, nesse caso, o corte passa para o dia seguinte: as compras do próprio dia ficam no período anterior.
- O painel lê tanto a aba **Contagens** atual quanto as abas **Contagens (formato antigo …)**. Das antigas, só aproveita as contagens enviadas pelo app novo (tudo em unidades).
- Categoria marcada como **"Não contei esta categoria hoje"** em qualquer uma das duas contagens fica **fora do cálculo** daquele período (produtos e compras), com aviso.
- Produto marcado como **"Não trabalho com este produto"** conta como zero.
- O valor de cada item da nota inclui o **IPI e o ICMS-ST** daquele item, porque a loja paga esses impostos e não os recupera. Se sobrar diferença de frete ou de impostos que não estão nos itens, o botão **"Distribuir … entre os itens"** reparte o valor proporcionalmente.
- Nota com **mais de uma folha**: envie as fotos de todas as folhas juntas antes de ler.
- **"Unid./emb."** é quantas unidades *contadas na loja* vêm em cada embalagem (ex.: pacote com 6 frascos = 6; galão = 1). Peso (7 kg, 1 kg) não entra nesse campo.
- Itens da nota marcados como **"Fora do estoque"** (sacola, guardanapo, etc.) são guardados, mas não entram no CMV.

## Instalação (uma vez, ~10 minutos)

### 1. Criar o projeto
1. Acesse [script.google.com](https://script.google.com) com a **mesma conta Google da planilha** e clique em **Novo projeto**.
2. Renomeie o projeto para **Painel DRE O Barracão**.
3. Apague o conteúdo de `Código.gs` e cole todo o arquivo [`Codigo.gs`](Codigo.gs).
4. Clique em **+** (Arquivos) → **HTML**, dê o nome **Painel** e cole todo o arquivo [`Painel.html`](Painel.html).
5. Clique em **Salvar**.

### 2. Publicar só para você
1. **Implantar → Nova implantação** → engrenagem → **App da Web**.
2. **Executar como:** Eu · **Quem pode acessar:** **Somente eu**.
3. **Implantar** e autorize o acesso (Planilhas, Drive e conexão externa para a leitura das notas). Se aparecer "app não verificado": **Avançado → Acessar**.
4. Copie o **URL do app da Web**: esse é o link do seu painel. Salve nos favoritos.

### 3. Configurar no próprio painel
Abra o link e, na aba **Configurações**:
1. Cole o **link da planilha "Estoque O Barracão"** (a mesma que recebe as contagens).
2. Cole a **chave da API da Anthropic**, para a leitura das notas:
   - crie uma conta em [console.anthropic.com](https://console.anthropic.com), adicione créditos em **Billing** e gere a chave em **API Keys**;
   - custo estimado: alguns centavos de dólar por nota lida (cerca de R$ 0,50).

A chave fica guardada nas propriedades do seu projeto do Google e nunca aparece no painel.

### 4. Cadastrar os custos iniciais
Na aba **Custos**, preencha o custo por unidade dos produtos (os sem custo aparecem primeiro). Depois disso, cada nota lançada mantém os custos atualizados.

## Rotina semanal

1. **Segunda:** cada loja envia a contagem pelo app (como hoje).
2. **Durante a semana:** lance as notas e cupons na aba **Compras**.
3. **Segunda seguinte:** a nova contagem fecha o período. Na aba **Resultado**, digite o faturamento da loja no período e veja o CMV %.

## Atualizações

A **tela** do painel (`Painel.html`) é carregada do GitHub toda vez que você abre o link. Por isso, as melhorias de tela, gráficos, compras e leitura de notas chegam sozinhas, sem colar nada. O arquivo `Painel` colado no Google fica só como reserva, para quando o GitHub não responder.

Só o **`Codigo.gs`** precisa ser colado de novo, e raramente. Quando for necessário, o painel mostra um aviso vermelho no topo. Nesse caso, cole o arquivo novo e use **Implantar → Gerenciar implantações → Editar → Nova versão**. O link continua o mesmo.

## Planilha

O painel cria estas abas na planilha "Estoque O Barracão" (as abas do app de contagem não são alteradas):

| Aba | Conteúdo |
| --- | --- |
| **Compras** | Uma linha por item de nota: loja, data, fornecedor, produto, embalagens, unidades, valor e custo por unidade. |
| **Custos** | Histórico de custo por unidade de cada produto (origem: nota ou manual). |
| **Faturamento** | Faturamento de cada loja por período. |
| **Contagens ignoradas** | Contagens que você desmarcou no painel. |
