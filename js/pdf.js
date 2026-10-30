// Gera o PDF da contagem (mesma identidade visual do app) e compartilha
// pelo menu do celular, onde o gerente escolhe o WhatsApp.
(function () {
  'use strict';

  const LIBS = [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  ];
  const LARANJA = [192, 16, 18];
  const AZUL = [28, 28, 28];
  const TEXTO = [30, 21, 21];
  const SUAVE = [110, 91, 90];
  const VERMELHO = [180, 35, 24];

  let libsCarregadas = null;
  function carregarLibs() {
    if (!libsCarregadas) {
      libsCarregadas = LIBS.reduce((p, src) => p.then(() => new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => { libsCarregadas = null; falha(new Error('Sem conexão para gerar o PDF')); };
        document.head.appendChild(s);
      })), Promise.resolve());
    }
    return libsCarregadas;
  }

  function carregarLogo() {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        // Logo reduzida em JPEG sobre fundo branco deixa o PDF leve para o WhatsApp.
        const proporcao = img.naturalHeight / img.naturalWidth;
        const c = document.createElement('canvas');
        c.width = 400;
        c.height = Math.round(400 * proporcao);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ok({ dados: c.toDataURL('image/jpeg', 0.88), proporcao });
      };
      img.onerror = () => ok(null);
      img.src = 'img/logo.png';
    });
  }

  // As fontes padrão do PDF não têm alguns símbolos tipográficos.
  function limpar(t) {
    return String(t == null ? '' : t).replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  }
  function numero(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
  }
  function dataHora(iso) {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function nomeArquivo(dados) {
    const d = new Date(dados.enviadoEm);
    const dia = [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n) => String(n).padStart(2, '0')).join('-');
    const loja = dados.unidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, ' ').trim().replace(/[\s-]+/g, '-');
    return `Contagem-${loja}-${dia}.pdf`;
  }

  async function gerar(dados) {
    await carregarLibs();
    const logo = await carregarLogo();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const larg = doc.internal.pageSize.getWidth();
    const margem = 14;

    // Cabeçalho: logo, título e os dados da contagem.
    let y = 12;
    if (logo) {
      const w = 46;
      doc.addImage(logo.dados, 'JPEG', margem, y, w, w * logo.proporcao);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...LARANJA);
    doc.text('Contagem de estoque', larg - margem, y + 8, { align: 'right' });

    const linhas = [
      ['Data da contagem', dataHora(dados.enviadoEm)],
      ['Loja', dados.unidade],
      ['Preenchido por', dados.responsavel],
    ];
    doc.setFontSize(10);
    linhas.forEach(([rotulo, valor], i) => {
      const ly = y + 16 + i * 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...SUAVE);
      doc.text(rotulo + ':', larg - margem - 62, ly);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXTO);
      doc.text(limpar(valor), larg - margem, ly, { align: 'right', maxWidth: 60 });
    });

    y = 50;
    doc.setFillColor(...LARANJA);
    doc.rect(margem, y, (larg - margem * 2) / 2, 2.2, 'F');
    doc.setFillColor(...AZUL);
    doc.rect(margem + (larg - margem * 2) / 2, y, (larg - margem * 2) / 2, 2.2, 'F');

    const contados = dados.itens.filter((i) => i.situacao === 'Contada');
    const zerados = contados.filter((i) => i.totalUnidades === 0).length;
    const naoContadas = dados.categoriasNaoContadas || [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SUAVE);
    doc.text(limpar(`${contados.length} itens contados  ·  ${zerados} zerados (em vermelho)` +
      (naoContadas.length ? `  ·  ${naoContadas.length} categoria(s) não contada(s)` : '')), margem, y + 7);

    // Uma tabela por categoria, com o nome da categoria na faixa azul.
    const corpo = [];
    let categoriaAtual = null;
    dados.itens.forEach((i) => {
      if (i.categoria !== categoriaAtual) {
        categoriaAtual = i.categoria;
        corpo.push([{ content: limpar(i.categoria).toUpperCase(), colSpan: 3,
          styles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', fontSize: 10 } }]);
        if (i.situacao === 'Não contada') {
          corpo.push([{ content: 'NÃO CONTADA HOJE', colSpan: 3,
            styles: { halign: 'center', fontStyle: 'bold', textColor: SUAVE, fillColor: [240, 240, 240] } }]);
        }
      }
      if (i.situacao === 'Não contada') return;
      if (i.situacao === 'Não trabalha') {
        corpo.push([{ content: limpar(i.produto), styles: { textColor: SUAVE } },
          { content: 'Não trabalha com este produto' }, { content: '-', styles: { textColor: SUAVE } }]);
        return;
      }
      const zerado = i.totalUnidades === 0;
      const como = i.forma === 'Caixa/fardo/pacote' || i.forma === 'Pacote (kg)' ? i.descricao.split(' = ')[0] : i.forma;
      corpo.push([limpar(i.produto), { content: limpar(como), zerado },
        { content: zerado ? `0 ${i.medida || 'un'}` : `${numero(i.totalUnidades)} ${i.medida || 'un'}`, zerado }]);
    });

    doc.autoTable({
      startY: y + 11,
      margin: { left: margem, right: margem, bottom: 16 },
      head: [['Produto', 'Como contou', 'Total']],
      body: corpo,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: TEXTO, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 } },
      headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { textColor: SUAVE, fontSize: 8.5, cellWidth: 62 }, 2: { halign: 'right', fontStyle: 'bold', cellWidth: 26 } },
      alternateRowStyles: { fillColor: [255, 246, 239] },
      didParseCell: (c) => {
        if (c.section === 'body' && c.cell.raw && c.cell.raw.zerado) c.cell.styles.textColor = VERMELHO;
        if (c.section === 'head' && c.column.index === 2) c.cell.styles.halign = 'right';
      },
      didDrawPage: () => {
        const alt = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...SUAVE);
        doc.text(limpar(`O Barracão · ${dados.unidade} · ${dataHora(dados.enviadoEm)}`), margem, alt - 8);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, larg - margem, alt - 8, { align: 'right' });
      },
    });

    if (dados.observacoes) {
      let oy = doc.lastAutoTable.finalY + 8;
      const texto = doc.splitTextToSize(limpar(dados.observacoes), larg - margem * 2);
      if (oy + 8 + texto.length * 4.5 > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); oy = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...AZUL);
      doc.text('Observações', margem, oy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXTO);
      doc.text(texto, margem, oy + 6);
    }

    return new File([doc.output('blob')], nomeArquivo(dados), { type: 'application/pdf' });
  }

  function baixar(arquivo) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Abre o menu de compartilhar do celular com o PDF anexado. Onde isso não
  // existe (computador), baixa o PDF e abre o WhatsApp com um resumo em texto.
  async function compartilhar(arquivo, dados) {
    const texto = `Contagem de estoque O Barracão\nLoja: ${dados.unidade}\nPreenchido por: ${dados.responsavel}\nData: ${dataHora(dados.enviadoEm)}`;
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: arquivo.name, text: texto });
        return 'compartilhado';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelado';
      }
    }
    baixar(arquivo);
    window.open('https://wa.me/?text=' + encodeURIComponent(texto + '\n\n(PDF baixado no aparelho, anexe na conversa)'), '_blank');
    return 'baixado';
  }

  window.PDFContagem = { gerar, compartilhar, baixar, carregarLibs };
})();
