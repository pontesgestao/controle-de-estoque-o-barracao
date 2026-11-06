#!/usr/bin/env python3
"""Gera painel-dre/Painel.html a partir de painel-dre/Painel.fonte.html.

O Google (HtmlService) altera trechos do HTML ao montar a página e, com isso,
quebrava o código da tela. Aqui o último <script> da fonte (o código principal)
vai em base64 — só letras e números — e é decodificado no navegador.

Sempre edite Painel.fonte.html e rode:  python3 painel-dre/montar.py
"""
import base64
import pathlib

pasta = pathlib.Path(__file__).resolve().parent
fonte = (pasta / 'Painel.fonte.html').read_text(encoding='utf-8')

inicio = fonte.rindex('<script>')
fim = fonte.index('</script>', inicio)
codigo = fonte[inicio + len('<script>'):fim]
b64 = base64.b64encode(codigo.encode('utf-8')).decode('ascii')

carregador = (
    '<script>\n'
    '// Codigo da tela em base64. O original legivel esta em Painel.fonte.html;\n'
    '// esta pagina e gerada por montar.py. Nao edite este bloco a mao.\n'
    '(function () {\n'
    "  var b64 = '" + b64 + "';\n"
    '  var texto = new TextDecoder().decode(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }));\n'
    '  try {\n'
    '    (new Function(texto))();\n'
    '  } catch (e) {\n'
    '    if (!(e instanceof EvalError)) throw e;\n'
    "    var s = document.createElement('script');\n"
    "    s.src = 'data:text/javascript;base64,' + b64;\n"
    '    document.body.appendChild(s);\n'
    '  }\n'
    '})();\n'
)
saida = fonte[:inicio] + carregador + fonte[fim:]
(pasta / 'Painel.html').write_text(saida, encoding='utf-8')
print('Painel.html gerado:', len(saida), 'caracteres; código principal com', len(codigo), 'caracteres')
