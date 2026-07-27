(function (root, factory) {
  const formatter = (
    typeof module === 'object' && module.exports
      ? require('./latex-source-formatter.js')
      : root.FormulaOcrLatexFormatter
  );
  const tools = factory(formatter);
  if (typeof module === 'object' && module.exports) module.exports = tools;
  root.FormulaOcrTools = tools;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (formatter) {
  const raw = String.raw;
  const formatPreset = (value) => {
    const source = String(value ?? '');
    const result = formatter?.format?.(source);
    return result?.safe ? result.formatted : source;
  };
  const createSnippet = (source, formatted) => {
    let field = 0;
    let snippet = formatted.replace(/\{\}|\[\]/g, (emptyGroup) => {
      field += 1;
      const placeholder = '${' + field + '}';
      return emptyGroup === '{}' ? `{${placeholder}}` : `[${placeholder}]`;
    });
    const emptyDelimitedExpression = /^\\left(?:\\[A-Za-z]+|\\.|[^\s])\s+\\right(?:\\[A-Za-z]+|\\.|[^\s])$/;
    if (field === 0 && emptyDelimitedExpression.test(String(source).trim())) {
      const rightDelimiter = snippet.indexOf('\\right');
      if (rightDelimiter >= 0) {
        field = 1;
        snippet = `${snippet.slice(0, rightDelimiter)}\${1}${snippet.slice(rightDelimiter)}`;
      }
    }
    return field > 0 ? snippet : '';
  };
  const entry = (latex, preview = latex, label = '', layout = 'compact') => {
    const formattedLatex = formatPreset(latex);
    return {
      latex: formattedLatex,
      preview: formatPreset(preview),
      label,
      layout,
      snippet: createSnippet(latex, formattedLatex),
    };
  };
  const entries = (...values) => values.map((value) => (
    Array.isArray(value) ? entry(value[0], value[1], value[2] || '', value[3] || 'compact') : entry(value)
  ));
  const group = (label, items, layout = 'compact') => ({ label, items, layout });
  const category = (id, label, icon, groups) => ({ id, label, icon, groups });
  const formatTool = (id, label, groups) => ({ id, label, groups });

  const categories = [
    category('common', '常用符号', raw`\times\ \cap\ \alpha`, [
      group('二元运算符', entries(
        '+', '-', raw`\times`, raw`\div`, raw`\pm`, raw`\mp`, raw`\cdot`, raw`\star`, raw`\ast`,
        raw`\circ`, raw`\bullet`, raw`\setminus`, raw`\cup`, raw`\cap`, raw`\sqcup`, raw`\sqcap`,
        raw`\vee`, raw`\wedge`, raw`\uplus`, raw`\oplus`, raw`\ominus`, raw`\odot`, raw`\oslash`,
        raw`\otimes`, raw`\bigcirc`, raw`\triangleleft`, raw`\triangleright`, raw`\bigtriangleup`,
        raw`\bigtriangledown`, raw`\lhd`, raw`\rhd`, raw`\unlhd`, raw`\unrhd`, raw`\diamond`,
        raw`\amalg`, raw`\wr`, raw`\dagger`, raw`\ddagger`,
      )),
      group('二元关系符', entries(
        '<', '>', '=', raw`\le`, raw`\ge`, raw`\equiv`, raw`\ll`, raw`\gg`, raw`\doteq`, raw`\ne`,
        raw`\prec`, raw`\succ`, raw`\preceq`, raw`\succeq`, raw`\sim`, raw`\simeq`, raw`\approx`,
        raw`\asymp`, raw`\cong`, raw`\propto`, raw`\subset`, raw`\supset`, raw`\subseteq`,
        raw`\supseteq`, raw`\sqsubset`, raw`\sqsupset`, raw`\sqsubseteq`, raw`\sqsupseteq`,
        raw`\in`, raw`\ni`, raw`\notin`, raw`\mid`, raw`\parallel`, raw`\perp`, raw`\vdash`,
        raw`\dashv`, raw`\models`, raw`\Join`, raw`\bowtie`, raw`\smile`, raw`\frown`, ':',
      )),
      group('箭头符号', entries(
        raw`\gets`, raw`\to`, raw`\longleftarrow`, raw`\longrightarrow`, raw`\leftrightarrow`,
        raw`\longleftrightarrow`, raw`\uparrow`, raw`\downarrow`, raw`\updownarrow`, raw`\Uparrow`,
        raw`\Downarrow`, raw`\Updownarrow`, raw`\Leftarrow`, raw`\Rightarrow`, raw`\Leftrightarrow`,
        raw`\Longleftarrow`, raw`\Longrightarrow`, raw`\Longleftrightarrow`, raw`\mapsto`,
        raw`\longmapsto`, raw`\nearrow`, raw`\searrow`, raw`\swarrow`, raw`\nwarrow`,
        raw`\hookleftarrow`, raw`\hookrightarrow`, raw`\leftharpoonup`, raw`\rightharpoonup`,
        raw`\leftharpoondown`, raw`\rightharpoondown`, raw`\rightleftharpoons`, raw`\iff`,
      )),
      group('其他符号', entries(
        raw`\because`, raw`\therefore`, raw`\dots`, raw`\cdots`, raw`\vdots`, raw`\ddots`,
        raw`\forall`, raw`\exists`, raw`\nexists`, raw`\neg`, raw`\Finv`, raw`\prime`,
        raw`\emptyset`, raw`\infty`, raw`\nabla`, raw`\surd`, raw`\triangle`, raw`\Box`,
        raw`\Diamond`, raw`\bot`, raw`\top`, raw`\angle`, raw`\measuredangle`, raw`\sphericalangle`,
        raw`\diamondsuit`, raw`\heartsuit`, raw`\clubsuit`, raw`\spadesuit`, raw`\flat`,
        raw`\natural`, raw`\sharp`,
      )),
    ]),
    category('greek', '希腊字母', raw`\alpha\beta\gamma`, [
      group('小写', entries(
        raw`\alpha`, raw`\beta`, raw`\gamma`, raw`\delta`, raw`\epsilon`, raw`\varepsilon`,
        raw`\zeta`, raw`\eta`, raw`\theta`, raw`\vartheta`, raw`\iota`, raw`\kappa`,
        raw`\lambda`, raw`\mu`, raw`\nu`, raw`\xi`, 'o', raw`\pi`, raw`\varpi`, raw`\rho`,
        raw`\varrho`, raw`\sigma`, raw`\varsigma`, raw`\tau`, raw`\upsilon`, raw`\phi`,
        raw`\varphi`, raw`\chi`, raw`\psi`, raw`\omega`,
      )),
      group('大写', entries(
        raw`\Gamma`, raw`\Delta`, raw`\Theta`, raw`\Lambda`, raw`\Xi`, raw`\Pi`, raw`\Sigma`,
        raw`\Upsilon`, raw`\Phi`, raw`\Psi`, raw`\Omega`,
      )),
      group('其他', entries(
        raw`\hbar`, raw`\imath`, raw`\jmath`, raw`\ell`, raw`\Re`, raw`\Im`, raw`\aleph`,
        raw`\beth`, raw`\gimel`, raw`\daleth`, raw`\wp`, raw`\mho`, raw`\backepsilon`,
        raw`\partial`, raw`\eth`, raw`\Bbbk`, raw`\complement`, raw`\circledS`, raw`\S`,
        [raw`\mathbb{}`, raw`\mathbb{ABC}`, '黑板粗体'],
        [raw`\mathfrak{}`, raw`\mathfrak{ABC}`, 'Fraktur 体'],
        [raw`\mathcal{}`, raw`\mathcal{ABC}`, '手写体'],
        [raw`\mathrm{}`, raw`\mathrm{ABC}`, '罗马体'],
        raw`\mathrm{def}`,
      )),
    ]),
    category('fractions', '分数微分', raw`\frac{x}{y}`, [
      group('分数', entries(
        [raw`\frac{}{}`, raw`\frac{x}{y}`, '普通分数'],
        [raw`\tfrac{}{}`, raw`\tfrac{x}{y}`, '行内分数'],
        raw`\mathrm{d}t`,
        raw`\frac{\mathrm{d}y}{\mathrm{d}x}`,
        raw`\partial t`,
        raw`\frac{\partial y}{\partial x}`,
        raw`\nabla \psi`,
        raw`\frac{\partial^2 y}{\partial x_1\,\partial x_2}`,
      )),
      group('连续分式', entries(
        raw`\cfrac{1}{a+\cfrac{7}{b+\cfrac{2}{9}}}=c`,
        [
          raw`\cfrac{1}{a_0+\cfrac{1}{a_1+\cfrac{1}{a_2+\ddots}}}`,
          raw`\cfrac{1}{a_0+\cfrac{1}{a_1+\cfrac{1}{a_2+\ddots}}}`,
          '多层连分数',
        ],
      ), 'wide'),
      group('导数', entries(
        [raw`\dot{}`, raw`\dot{x}`],
        [raw`\ddot{}`, raw`\ddot{x}`],
        [raw`{}'`, raw`f'`],
        [raw`{}''`, raw`f''`],
        [raw`{}^{(n)}`, raw`f^{(n)}`],
      )),
      group('模算术', entries(
        raw`a \bmod b`,
        raw`a \equiv b \pmod{m}`,
        raw`\gcd(m,n)`,
        raw`\operatorname{lcm}(m,n)`,
      ), 'fill'),
    ]),
    category('roots', '根式角标', raw`\sqrt{e^x}`, [
      group('根式', entries(
        [raw`\sqrt{}`, raw`\sqrt{x}`],
        [raw`\sqrt[]{}`, raw`\sqrt[n]{x}`],
      )),
      group('上下标', entries(
        [raw`^{}`, raw`x^{n}`],
        [raw`_{}`, raw`x_{n}`],
        [raw`_{}^{}`, raw`x_a^b`],
        [raw`{}_{}^{}`, raw`{}_a^bX`],
        raw`\sideset{_1^2}{_3^4}X_a^b`,
      )),
      group('单字符重音', entries(
        [raw`\hat{}`, raw`\hat{x}`],
        [raw`\check{}`, raw`\check{x}`],
        [raw`\grave{}`, raw`\grave{x}`],
        [raw`\acute{}`, raw`\acute{x}`],
        [raw`\tilde{}`, raw`\tilde{x}`],
        [raw`\breve{}`, raw`\breve{x}`],
        [raw`\bar{}`, raw`\bar{x}`],
        [raw`\vec{}`, raw`\vec{x}`],
        [raw`\not{}`, raw`\not=`],
        [raw`^{\circ}`, raw`30^{\circ}`],
      )),
      group('宽重音、上下线和括注', entries(
        [raw`\widetilde{}`, raw`\widetilde{ABC}`],
        [raw`\widehat{}`, raw`\widehat{ABC}`],
        [raw`\overleftarrow{}`, raw`\overleftarrow{AB}`],
        [raw`\overrightarrow{}`, raw`\overrightarrow{AB}`],
        [raw`\overline{}`, raw`\overline{AB}`],
        [raw`\underline{}`, raw`\underline{AB}`],
        [raw`\overbrace{}`, raw`\overbrace{a+b}`],
        [raw`\underbrace{}`, raw`\underbrace{a+b}`],
      )),
      group('上下叠放与可扩展箭头', entries(
        [raw`\overset{}{}`, raw`\overset{a}{=}`],
        [raw`\underset{}{}`, raw`\underset{a}{=}`],
        [raw`\stackrel{\frown}{}`, raw`\stackrel{\frown}{AB}`],
        [raw`\overline{}`, raw`\overline{ABCDE}`],
        [raw`\overleftrightarrow{}`, raw`\overleftrightarrow{AB}`],
        [raw`\overset{}{\leftarrow}`, raw`\overset{a}{\leftarrow}`],
        [raw`\overset{}{\rightarrow}`, raw`\overset{a}{\rightarrow}`],
        [raw`\xleftarrow[]{}`, raw`\xleftarrow[n]{m}`],
        [raw`\xrightarrow[]{}`, raw`\xrightarrow[n]{m}`],
      )),
    ]),
    category('limits', '极限对数', raw`\lim_{n\to\infty}`, [
      group('极限', entries(
        raw`\lim`,
        raw`\lim_{x\to0}`,
        raw`\lim_{x\to\infty}`,
        raw`\textstyle\lim_{x\to0}`,
        [raw`\max_{}`, raw`\max_{x}`],
        [raw`\min_{}`, raw`\min_{x}`],
      )),
      group('对数指数', entries(
        [raw`\log_{}`, raw`\log_b x`],
        [raw`\lg_{}`, raw`\lg_b x`],
        [raw`\ln_{}`, raw`\ln_b x`],
        raw`\exp`,
      )),
      group('界限', entries(
        raw`\min x`, raw`\max y`, raw`\sup t`, raw`\inf s`, raw`\lim u`,
        raw`\limsup w`, raw`\liminf v`, raw`\dim p`, raw`\ker\phi`,
      )),
    ]),
    category('trigonometry', '三角函数', raw`\sin\alpha`, [
      group('基本三角函数', entries(
        raw`\sin`, raw`\cos`, raw`\tan`, raw`\cot`, raw`\sec`, raw`\csc`,
      )),
      group('反三角函数', entries(
        raw`\sin^{-1}`, raw`\cos^{-1}`, raw`\tan^{-1}`, raw`\cot^{-1}`, raw`\sec^{-1}`,
        raw`\csc^{-1}`, raw`\arcsin`, raw`\arccos`, raw`\arctan`, raw`\operatorname{arccot}`,
        raw`\operatorname{arcsec}`, raw`\operatorname{arccsc}`,
      )),
      group('双曲函数', entries(
        raw`\sinh`, raw`\cosh`, raw`\tanh`, raw`\coth`, raw`\operatorname{sech}`,
        raw`\operatorname{csch}`,
      )),
      group('反双曲函数', entries(
        raw`\sinh^{-1}`, raw`\cosh^{-1}`, raw`\tanh^{-1}`, raw`\coth^{-1}`,
        raw`\operatorname{sech}^{-1}`, raw`\operatorname{csch}^{-1}`,
      )),
    ]),
    category('integrals', '积分运算', raw`\int_a^b`, [
      group('单重积分', entries(
        raw`\int`,
        [raw`\int_{}^{}`, raw`\int_a^b`],
        [raw`\int\limits_{}^{}`, raw`\int\limits_a^b`],
      ), 'fill'),
      group('双重积分', entries(
        raw`\iint`,
        [raw`\iint_{}^{}`, raw`\iint_a^b`],
        [raw`\iint\limits_{}^{}`, raw`\iint\limits_a^b`],
      ), 'fill'),
      group('三重积分', entries(
        raw`\iiint`,
        [raw`\iiint_{}^{}`, raw`\iiint_a^b`],
        [raw`\iiint\limits_{}^{}`, raw`\iiint\limits_a^b`],
      ), 'fill'),
      group('闭合曲线积分', entries(
        raw`\oint`,
        [raw`\oint_{}^{}`, raw`\oint_a^b`],
      ), 'fill'),
    ]),
    category('large-operators', '大型运算', raw`\sum_{i=0}^{n}`, [
      group('求和', entries(
        raw`\sum`,
        [raw`\sum_{}^{}`, raw`\sum_{i=0}^{n}`],
        [raw`{\textstyle\sum_{}^{}}`, raw`{\textstyle\sum_{i=0}^{n}}`],
      ), 'fill'),
      group('连乘', entries(
        raw`\prod`,
        [raw`\prod_{}^{}`, raw`\prod_{i=0}^{n}`],
        [raw`{\textstyle\prod_{}^{}}`, raw`{\textstyle\prod_{i=0}^{n}}`],
      ), 'fill'),
      group('余积', entries(
        raw`\coprod`,
        [raw`\coprod_{}^{}`, raw`\coprod_{i=0}^{n}`],
        [raw`{\textstyle\coprod_{}^{}}`, raw`{\textstyle\coprod_{i=0}^{n}}`],
      ), 'fill'),
      group('大并集', entries(
        raw`\bigcup`,
        [raw`\bigcup_{}^{}`, raw`\bigcup_{i=0}^{n}`],
        [raw`{\textstyle\bigcup_{}^{}}`, raw`{\textstyle\bigcup_{i=0}^{n}}`],
      ), 'fill'),
      group('大交集', entries(
        raw`\bigcap`,
        [raw`\bigcap_{}^{}`, raw`\bigcap_{i=0}^{n}`],
        [raw`{\textstyle\bigcap_{}^{}}`, raw`{\textstyle\bigcap_{i=0}^{n}}`],
      ), 'fill'),
      group('大析取', entries(
        raw`\bigvee`,
        [raw`\bigvee_{}^{}`, raw`\bigvee_{i=0}^{n}`],
        [raw`{\textstyle\bigvee_{}^{}}`, raw`{\textstyle\bigvee_{i=0}^{n}}`],
      ), 'fill'),
      group('大合取', entries(
        raw`\bigwedge`,
        [raw`\bigwedge_{}^{}`, raw`\bigwedge_{i=0}^{n}`],
        [raw`{\textstyle\bigwedge_{}^{}}`, raw`{\textstyle\bigwedge_{i=0}^{n}}`],
      ), 'fill'),
    ]),
    category('brackets', '括号取整', raw`\left\{[(x)]\right\}`, [
      group('括号', entries(
        [raw`\left( \right)`, raw`\left( x \right)`],
        [raw`\left[ \right]`, raw`\left[ x \right]`],
        [raw`\left\langle \right\rangle`, raw`\left\langle x \right\rangle`],
        [raw`\left\{ \right\}`, raw`\left\{ x \right\}`],
        [raw`\left| \right|`, raw`\left| x \right|`],
        [raw`\left\| \right\|`, raw`\left\| x \right\|`],
        [raw`\left\lfloor \right\rfloor`, raw`\left\lfloor x \right\rfloor`],
        [raw`\left\lceil \right\rceil`, raw`\left\lceil x \right\rceil`],
      )),
      group('常用', entries(
        [raw`\binom{}{}`, raw`\binom{n}{k}`],
        raw`\left[0,1\right)`,
        raw`\left\langle\psi\right|`,
        raw`\left|\psi\right\rangle`,
        raw`\left\langle\psi|\psi\right\rangle`,
      )),
    ]),
    category('matrices', '数组矩阵', raw`\begin{matrix}0&1\\1&0\end{matrix}`, [
      group('矩阵', entries(
        [
          raw`\begin{matrix}a & b\\c & d\end{matrix}`,
          raw`\begin{matrix}a & b\\c & d\end{matrix}`,
          '无括号矩阵',
        ],
        [
          raw`\begin{bmatrix}a & b\\c & d\end{bmatrix}`,
          raw`\begin{bmatrix}a & b\\c & d\end{bmatrix}`,
          '方括号矩阵',
        ],
        [
          raw`\begin{pmatrix}a & b\\c & d\end{pmatrix}`,
          raw`\begin{pmatrix}a & b\\c & d\end{pmatrix}`,
          '圆括号矩阵',
        ],
        [
          raw`\begin{vmatrix}a & b\\c & d\end{vmatrix}`,
          raw`\begin{vmatrix}a & b\\c & d\end{vmatrix}`,
          '行列式',
        ],
        [
          raw`\begin{Vmatrix}a & b\\c & d\end{Vmatrix}`,
          raw`\begin{Vmatrix}a & b\\c & d\end{Vmatrix}`,
          '双竖线矩阵',
        ],
        [
          raw`\begin{Bmatrix}a & b\\c & d\end{Bmatrix}`,
          raw`\begin{Bmatrix}a & b\\c & d\end{Bmatrix}`,
          '花括号矩阵',
        ],
        [
          raw`\left\{\begin{matrix}a & b\\c & d\end{matrix}\right.`,
          raw`\left\{\begin{matrix}a & b\\c & d\end{matrix}\right.`,
          '仅左花括号',
        ],
        [
          raw`\left.\begin{matrix}a & b\\c & d\end{matrix}\right\}`,
          raw`\left.\begin{matrix}a & b\\c & d\end{matrix}\right\}`,
          '仅右花括号',
        ],
      ), 'formula'),
      group('多行结构', entries(
        [
          raw`\begin{cases}f_1(x), & \text{if } x<0\\f_2(x), & \text{if } x\ge 0\end{cases}`,
          raw`\begin{cases}f_1(x), & x<0\\f_2(x), & x\ge 0\end{cases}`,
          '分段函数',
        ],
        [
          raw`\begin{align*}a &= b+c\\d &= e+f\end{align*}`,
          raw`\begin{aligned}a &= b+c\\d &= e+f\end{aligned}`,
          '多行对齐公式',
        ],
      ), 'wide'),
    ]),
  ];

  const environmentOption = (id, label, preview, code = '') => ({
    id,
    label,
    preview: formatPreset(preview),
    latex: code,
    snippet: '',
    action: 'environment',
  });

  const formatTools = [
    formatTool('colors', '颜色', [
      group('标准颜色', entries(
        [raw`\color{black}{}`, raw`\color{black}{x}`, '黑色'],
        [raw`\color{darkgray}{}`, raw`\color{darkgray}{x}`, '深灰色'],
        [raw`\color{gray}{}`, raw`\color{gray}{x}`, '灰色'],
        [raw`\color{lightgray}{}`, raw`\color{lightgray}{x}`, '浅灰色'],
        [raw`\color{white}{}`, raw`\color{white}{x}`, '白色'],
        [raw`\color{red}{}`, raw`\color{red}{x}`, '红色'],
        [raw`\color{orange}{}`, raw`\color{orange}{x}`, '橙色'],
        [raw`\color{yellow}{}`, raw`\color{yellow}{x}`, '黄色'],
        [raw`\color{lime}{}`, raw`\color{lime}{x}`, '亮绿色'],
        [raw`\color{green}{}`, raw`\color{green}{x}`, '绿色'],
        [raw`\color{olive}{}`, raw`\color{olive}{x}`, '橄榄绿色'],
        [raw`\color{teal}{}`, raw`\color{teal}{x}`, '蓝绿色'],
        [raw`\color{cyan}{}`, raw`\color{cyan}{x}`, '青色'],
        [raw`\color{blue}{}`, raw`\color{blue}{x}`, '蓝色'],
        [raw`\color{purple}{}`, raw`\color{purple}{x}`, '紫色'],
        [raw`\color{violet}{}`, raw`\color{violet}{x}`, '紫罗兰色'],
        [raw`\color{magenta}{}`, raw`\color{magenta}{x}`, '洋红色'],
        [raw`\color{pink}{}`, raw`\color{pink}{x}`, '粉色'],
        [raw`\color{brown}{}`, raw`\color{brown}{x}`, '棕色'],
      )),
    ]),
    formatTool('fonts', '字体', [
      group('数学字体', entries(
        [raw`\mathrm{}`, raw`\mathrm{ABC}`, '罗马正体'],
        [raw`\mathit{}`, raw`\mathit{ABC}`, '数学斜体'],
        [raw`\mathbf{}`, raw`\mathbf{ABC}`, '数学粗体'],
        [raw`\boldsymbol{}`, raw`\boldsymbol{\alpha A}`, '数学粗斜体'],
        [raw`\mathsf{}`, raw`\mathsf{ABC}`, '无衬线体'],
        [raw`\mathtt{}`, raw`\mathtt{ABC}`, '等宽体'],
        [raw`\mathcal{}`, raw`\mathcal{ABC}`, '花写体'],
        [raw`\mathfrak{}`, raw`\mathfrak{ABC}`, 'Fraktur 体'],
        [raw`\mathbb{}`, raw`\mathbb{ABC}`, '黑板粗体'],
      )),
      group('文本字体', entries(
        [raw`\text{}`, raw`\text{说明文字}`, '公式内文本'],
        [raw`\textbf{}`, raw`\textbf{Bold}`, '文本粗体'],
        [raw`\textit{}`, raw`\textit{Italic}`, '文本斜体'],
      )),
    ]),
    formatTool('font-sizes', '字号', [
      group('局部字号', entries(
        [raw`{\tiny {}}`, raw`{\tiny x}`, '极小（tiny）'],
        [raw`{\scriptsize {}}`, raw`{\scriptsize x}`, '脚本大小（scriptsize）'],
        [raw`{\footnotesize {}}`, raw`{\footnotesize x}`, '脚注大小（footnotesize）'],
        [raw`{\small {}}`, raw`{\small x}`, '小号（small）'],
        [raw`{\normalsize {}}`, raw`{\normalsize x}`, '正常（normalsize）'],
        [raw`{\large {}}`, raw`{\large x}`, '大号（large）'],
        [raw`{\Large {}}`, raw`{\Large x}`, '较大（Large）'],
        [raw`{\LARGE {}}`, raw`{\LARGE x}`, '更大（LARGE）'],
        [raw`{\huge {}}`, raw`{\huge x}`, '特大（huge）'],
        [raw`{\Huge {}}`, raw`{\Huge x}`, '最大（Huge）'],
      )),
    ]),
    formatTool('environments', '环境', [
      group('整体公式环境', [
        environmentOption('none', '无环境（none）', raw`a + b = c`, '无额外环境'),
        environmentOption('eqnarray', 'eqnarray 环境', raw`\begin{eqnarray}a &= b + c\\d &= e + f\end{eqnarray}`, raw`\begin{eqnarray} … \end{eqnarray}`),
        environmentOption('align', 'align 环境', raw`\begin{align}a &= b + c\\d &= e + f\end{align}`, raw`\begin{align} … \end{align}`),
        environmentOption('aligned', 'aligned 环境', raw`\begin{aligned}a &= b + c\\d &= e + f\end{aligned}`, raw`\begin{aligned} … \end{aligned}`),
        environmentOption('gathered', 'gathered 环境', raw`\begin{gathered}a + b\\c + d\end{gathered}`, raw`\begin{gathered} … \end{gathered}`),
        environmentOption('cases', 'cases 环境', raw`\begin{cases}f_1(x), & x<0\\f_2(x), & x\geq0\end{cases}`, raw`\begin{cases} … \end{cases}`),
        environmentOption('split', 'split 环境', raw`\begin{split}a &= b + c\\&= d\end{split}`, raw`\begin{split} … \end{split}`),
        environmentOption('array', 'array 环境', raw`\begin{array}{cc}a & b\\c & d\end{array}`, raw`\begin{array}{cc} … \end{array}`),
      ]),
    ]),
  ];

  const templateHasExplicitRows = (preview) => String(preview ?? '').includes('\\\\');
  const template = (label, latex, preview = latex, layout = 'standard') => ({
    ...entry(latex, preview, label),
    layout,
    singleLine: !templateHasExplicitRows(preview),
    snippet: '',
  });
  const templateCategory = (id, label, icon, templates, singleColumn = false) => ({
    id, label, icon, templates, singleColumn,
  });

  const templateCategories = [
    templateCategory('algebra', '代数', raw`\sqrt{a^2+b^2}`, [
      template('多项式因式分解', raw`(x-1)(x+3)`),
      template('平方和根式', raw`\sqrt{a^2+b^2}`),
      template('分式幂法则', raw`\left(\frac{a}{b}\right)^n=\frac{a^n}{b^n}`),
      template('分式加减法', raw`\frac{a}{b}\pm\frac{c}{d}=\frac{ad\pm bc}{bd}`),
      template('双曲线标准方程', raw`\frac{x^2}{a^2}-\frac{y^2}{b^2}=1`),
      template('根式有理化', raw`\frac{1}{\sqrt a}=\frac{\sqrt a}{a},\qquad a>0`),
      template('n 次根式幂', raw`\sqrt[n]{a^n}=(\sqrt[n]{a})^n,\qquad a\geq0`),
      template('一元二次方程求根公式', raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`),
      template('直线点斜式方程', raw`y-y_1=k(x-x_1)`),
      template(
        '圆的参数方程',
        raw`\begin{cases}x=a+r\cos\theta\\y=b+r\sin\theta\end{cases}`,
      ),
      template(
        '三次单位根',
        raw`\begin{gathered}\text{对于方程 }x^3-1=0,\\\text{设 }\omega=\frac{-1+\sqrt3\,i}{2},\\x_1=1,\quad x_2=\omega=\frac{-1+\sqrt3\,i}{2},\\x_3=\omega^2=\frac{-1-\sqrt3\,i}{2}\end{gathered}`,
        undefined,
        'large',
      ),
      template(
        '二次方程判别式',
        raw`\begin{aligned}ax^2+bx+c&=0,\\\Delta&=b^2-4ac,\\&\begin{cases}\Delta>0,&\text{方程有两个不相等的实根}\\\Delta=0,&\text{方程有两个相等的实根}\\\Delta<0,&\text{方程无实根}\end{cases}\end{aligned}`,
        undefined,
        'large',
      ),
      template(
        '韦达定理',
        raw`\begin{aligned}ax^2+bx+c&=0,\quad a\neq0,\\x_{1,2}&=\frac{-b\pm\sqrt{b^2-4ac}}{2a},\\x_1+x_2&=-\frac{b}{a},\quad x_1x_2=\frac{c}{a}\end{aligned}`,
        undefined,
        'large',
      ),
    ]),
    templateCategory('geometry', '几何', raw`\triangle ABC`, [
      template('三角形 ABC', raw`\triangle ABC`),
      template(
        '平行线传递性',
        raw`a\parallel c,\quad b\parallel c\Longrightarrow a\parallel b`,
      ),
      template(
        '线面垂直推出面面垂直',
        raw`l\perp\beta,\quad l\subset\alpha\Longrightarrow\alpha\perp\beta`,
      ),
      template(
        '垂直于同一平面的两条直线平行',
        raw`\left.\begin{array}{l}a\perp\alpha\\b\perp\alpha\end{array}\right\}\Longrightarrow a\parallel b`,
      ),
      template(
        '两个平面的公共点在交线上',
        raw`P\in\alpha,\quad P\in\beta,\quad\alpha\cap\beta=l\Longrightarrow P\in l`,
      ),
      template(
        '平面垂直性质定理',
        raw`\alpha\perp\beta,\quad\alpha\cap\beta=l,\quad a\subset\alpha,\quad a\perp l\Longrightarrow a\perp\beta`,
        undefined,
        'wide',
      ),
      template(
        '面面平行判定定理',
        raw`\left.\begin{array}{l}a\subset\beta,\quad b\subset\beta,\quad a\cap b=P\\a\parallel\alpha,\quad b\parallel\alpha\end{array}\right\}\Longrightarrow\beta\parallel\alpha`,
        undefined,
        'wide',
      ),
      template(
        '平行平面截线平行',
        raw`\alpha\parallel\beta,\quad\alpha\cap\gamma=a,\quad\beta\cap\gamma=b\Longrightarrow a\parallel b`,
      ),
      template(
        '两点确定直线在平面内',
        raw`A\neq B,\quad A,B\in l,\quad A,B\in\alpha\Longrightarrow l\subset\alpha`,
      ),
      template(
        '线面垂直判定定理',
        raw`\left.\begin{array}{l}m\subset\alpha,\quad n\subset\alpha,\quad m\cap n=P\\a\perp m,\quad a\perp n\end{array}\right\}\Longrightarrow a\perp\alpha`,
        undefined,
        'wide',
      ),
      template(
        '勾股定理',
        raw`\angle C=90^\circ\Longrightarrow a^2+b^2=c^2`,
      ),
    ]),
    templateCategory('inequalities', '不等式', raw`a>b`, [
      template('不等式传递性', raw`a>b,\quad b>c\Longrightarrow a>c`),
      template('不等式加法性质', raw`a>b,\quad c>d\Longrightarrow a+c>b+d`),
      template('正数不等式乘法性质', raw`a>b>0,\quad c>d>0\Longrightarrow ac>bd`),
      template(
        '不等式同乘性质',
        raw`\begin{aligned}a>b,\ c>0&\Longrightarrow ac>bc,\\a>b,\ c<0&\Longrightarrow ac<bc.\end{aligned}`,
      ),
      template('绝对值反三角不等式', raw`\bigl|\lvert a\rvert-\lvert b\rvert\bigr|\leq\lvert a-b\rvert`),
      template('绝对值界限', raw`-\lvert a\rvert\leq a\leq\lvert a\rvert`),
      template(
        '绝对值不等式等价形式',
        raw`b\geq0,\quad\lvert a\rvert\leq b\Longleftrightarrow-b\leq a\leq b`,
      ),
      template('三角不等式', raw`\lvert a+b\rvert\leq\lvert a\rvert+\lvert b\rvert`),
      template(
        '幂与根的不等式性质',
        raw`a>b>0,\quad n\in\mathbb{N},\quad n>1\Longrightarrow a^n>b^n,\quad\sqrt[n]{a}>\sqrt[n]{b}`,
      ),
      template(
        '柯西-施瓦茨不等式',
        raw`\left(\sum_{i=1}^{n}a_i^2\right)\left(\sum_{i=1}^{n}b_i^2\right)\geq\left(\sum_{i=1}^{n}a_ib_i\right)^2`,
      ),
      template(
        '算术-几何平均不等式',
        raw`a,b\in\mathbb{R}_{\geq0}\Longrightarrow\frac{a+b}{2}\geq\sqrt{ab}`,
      ),
      template('平方非负不等式', raw`a,b\in\mathbb{R}\Longrightarrow a^2+b^2\geq2ab`),
      template(
        '平均值不等式链',
        raw`\begin{aligned}H_n&=\frac{n}{\sum_{i=1}^{n}\frac{1}{x_i}},&G_n&=\sqrt[n]{\prod_{i=1}^{n}x_i},\\A_n&=\frac{1}{n}\sum_{i=1}^{n}x_i,&Q_n&=\sqrt{\frac{1}{n}\sum_{i=1}^{n}x_i^2},\\H_n&\leq G_n\leq A_n\leq Q_n,\quad&x_i&>0\end{aligned}`,
      ),
    ]),
    templateCategory('calculus', '积分', raw`\frac{\partial y}{\partial x}`, [
      template('幂函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}x^n=nx^{n-1}`),
      template('指数函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}e^{ax}=a\,e^{ax}`),
      template('对数函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}\ln x=\frac{1}{x}`),
      template('正弦函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}\sin x=\cos x`),
      template('余弦函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}\cos x=-\sin x`),
      template('正切函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}\tan x=\sec^2x`),
      template('余切函数求导公式', raw`\frac{\mathrm{d}}{\mathrm{d}x}\cot x=-\csc^2x`),
      template('常数积分公式', raw`\int k\,\mathrm{d}x=kx+C`),
      template('倒数积分公式', raw`\int\frac{1}{x}\,\mathrm{d}x=\ln\lvert x\rvert+C`),
      template(
        '反正弦积分公式',
        raw`\int\frac{1}{\sqrt{1-x^2}}\,\mathrm{d}x=\arcsin x+C`,
      ),
      template(
        '反正切积分公式',
        raw`\int\frac{1}{1+x^2}\,\mathrm{d}x=\arctan x+C`,
      ),
      template('分部积分公式', raw`\int u\,\mathrm{d}v=uv-\int v\,\mathrm{d}u`),
      template(
        '傅里叶反演公式',
        raw`f(x)=\int_{-\infty}^{+\infty}\hat f(\xi)e^{2\pi i\xi x}\,\mathrm{d}\xi`,
      ),
      template(
        '幂函数积分公式',
        raw`\int x^\mu\,\mathrm{d}x=\frac{x^{\mu+1}}{\mu+1}+C,\qquad\mu\neq-1`,
      ),
    ]),
    templateCategory('matrix-templates', '矩阵', raw`\begin{pmatrix}1&0\\0&1\end{pmatrix}`, [
      template(
        '二阶单位矩阵',
        raw`\begin{pmatrix}1&0\\0&1\end{pmatrix}`,
      ),
      template(
        '三阶矩阵',
        raw`\begin{pmatrix}a_{11}&a_{12}&a_{13}\\a_{21}&a_{22}&a_{23}\\a_{31}&a_{32}&a_{33}\end{pmatrix}`,
      ),
      template(
        'm×n 矩阵',
        raw`\begin{pmatrix}a_{11}&a_{12}&\cdots&a_{1n}\\a_{21}&a_{22}&\cdots&a_{2n}\\\vdots&\vdots&\ddots&\vdots\\a_{m1}&a_{m2}&\cdots&a_{mn}\end{pmatrix}`,
        undefined,
        'large',
      ),
      template(
        '对称与反对称矩阵',
        raw`A=A^{\mathrm T},\qquad B=-B^{\mathrm T}`,
      ),
      template(
        '零矩阵',
        raw`O_{m\times n}=\begin{pmatrix}0&\cdots&0\\\vdots&\ddots&\vdots\\0&\cdots&0\end{pmatrix}`,
        undefined,
        'large',
      ),
      template('矩阵记号', raw`A_{m\times n}=[a_{ij}]_{m\times n}`),
      template(
        '矩阵乘法',
        raw`C_{m\times p}=A_{m\times n}B_{n\times p},\qquad c_{ij}=\sum_{k=1}^{n}a_{ik}b_{kj}`,
        undefined,
        'wide',
      ),
      template(
        '向量叉乘行列式',
        raw`\frac{\partial\mathbf r}{\partial u}\times\frac{\partial\mathbf r}{\partial v}=\begin{vmatrix}\mathbf i&\mathbf j&\mathbf k\\x_u&y_u&z_u\\x_v&y_v&z_v\end{vmatrix}`,
        raw`\begin{vmatrix}\mathbf i&\mathbf j&\mathbf k\\x_u&y_u&z_u\\x_v&y_v&z_v\end{vmatrix}`,
        'large',
      ),
    ]),
    templateCategory('trig-templates', '三角', raw`e^{i\theta}`, [
      template('欧拉公式', raw`e^{i\theta}=\cos\theta+i\sin\theta`),
      template(
        '半角正弦公式',
        raw`\sin^2\frac{\alpha}{2}=\frac{1-\cos\alpha}{2}`,
      ),
      template(
        '半角余弦公式',
        raw`\cos^2\frac{\alpha}{2}=\frac{1+\cos\alpha}{2}`,
      ),
      template(
        '半角正切公式',
        raw`\tan\frac{\alpha}{2}=\frac{\sin\alpha}{1+\cos\alpha}=\frac{1-\cos\alpha}{\sin\alpha}`,
      ),
      template(
        '正弦和化积公式',
        raw`\sin\alpha+\sin\beta=2\sin\frac{\alpha+\beta}{2}\cos\frac{\alpha-\beta}{2}`,
      ),
      template(
        '正弦差化积公式',
        raw`\sin\alpha-\sin\beta=2\cos\frac{\alpha+\beta}{2}\sin\frac{\alpha-\beta}{2}`,
      ),
      template(
        '余弦和化积公式',
        raw`\cos\alpha+\cos\beta=2\cos\frac{\alpha+\beta}{2}\cos\frac{\alpha-\beta}{2}`,
      ),
      template(
        '余弦差化积公式',
        raw`\cos\alpha-\cos\beta=-2\sin\frac{\alpha+\beta}{2}\sin\frac{\alpha-\beta}{2}`,
      ),
      template('余弦定理', raw`a^2=b^2+c^2-2bc\cos A`),
      template(
        '正弦定理',
        raw`\frac a{\sin A}=\frac b{\sin B}=\frac c{\sin C}=2R`,
      ),
      template(
        '余角正弦公式',
        raw`\sin\left(\frac{\pi}{2}-\alpha\right)=\cos\alpha`,
      ),
      template(
        '正弦移位公式',
        raw`\sin\left(\frac{\pi}{2}+\alpha\right)=\cos\alpha`,
      ),
    ]),
    templateCategory('statistics', '统计', raw`C_r^n`, [
      template('组合数', raw`\binom{n}{r}`),
      template('组合数公式', raw`\binom{n}{r}=\frac{n!}{r!(n-r)!}`),
      template('样本和', raw`\sum_{i=1}^{n}X_i`),
      template('平方和', raw`\sum_{i=1}^{n}X_i^2`),
      template('样本序列', raw`X_1,\cdots,X_n`),
      template('标准化变量', raw`Z=\frac{x-\mu}{\sigma}`),
      template('离差平方和', raw`\sum_{i=1}^{n}(X_i-\overline X)^2`),
      template('概率加法公式', raw`P(A\cup B)=P(A)+P(B)-P(A\cap B)`),
      template(
        '二项分布概率',
        raw`P(X=k)=\binom nkp^k(1-p)^{n-k}`,
      ),
      template('频率概率定义', raw`P(A)=\lim_{n\to\infty}f_n(A)`),
      template(
        '可列可加性',
        raw`\begin{aligned}A_i\cap A_j&=\varnothing,\quad i\neq j,\\P\left(\bigcup_{i=1}^{\infty}A_i\right)&=\sum_{i=1}^{\infty}P(A_i)\end{aligned}`,
        undefined,
        'wide',
      ),
      template('概率基本性质', raw`P(\varnothing)=0,\qquad P(S)=1`),
      template('概率非负性', raw`P(A)\geq0`),
      template(
        '独立事件条件概率',
        raw`P(AB)=P(A)P(B)\Longleftrightarrow P(A\mid B)=P(A)`,
        undefined,
        'wide',
      ),
      template(
        '超几何分布概率',
        raw`P(X=k)=\frac{\binom Mk\binom{N-M}{n-k}}{\binom Nn}`,
      ),
      template(
        '排列数公式',
        raw`P_n=n!,\qquad A_n^k=\frac{n!}{(n-k)!}`,
      ),
    ]),
    templateCategory('sequences', '数列', raw`a_n=2^n`, [
      template('等比数列通项公式', raw`a_n=a_1q^{n-1}`),
      template('等差数列通项公式', raw`a_n=a_1+(n-1)d`),
      template('等差数列求和公式一', raw`S_n=na_1+\frac{n(n-1)}2d`),
      template('等差数列求和公式二', raw`S_n=\frac{n(a_1+a_n)}2`),
      template(
        '裂项相消公式',
        raw`\frac{1}{n(n+k)}=\frac{1}{k}\left(\frac{1}{n}-\frac{1}{n+k}\right)`,
      ),
      template(
        '平方差裂项公式',
        raw`\frac{1}{n^2-1}=\frac{1}{2}\left(\frac{1}{n-1}-\frac{1}{n+1}\right)`,
      ),
      template(
        '分式裂项公式',
        raw`\frac{1}{4n^2-1}=\frac{1}{2}\left(\frac{1}{2n-1}-\frac{1}{2n+1}\right)`,
      ),
      template(
        '含 2^n 的裂项公式',
        raw`\frac{n+1}{n(n-1)2^n}=\frac{1}{(n-1)2^{n-1}}-\frac{1}{n2^n}`,
      ),
      template(
        '等差数列闭合性质',
        raw`\begin{gathered}\{a_n\},\{b_n\}\text{ 为等差数列}\\\Longrightarrow\{a_n+b_n\}\text{ 为等差数列}\end{gathered}`,
        undefined,
        'wide',
      ),
      template(
        '二项式展开',
        raw`(1+x)^n=1+\frac{nx}{1!}+\frac{n(n-1)x^2}{2!}+\cdots`,
      ),
    ]),
    templateCategory('physics', '物理', raw`E=mc^2`, [
      template(
        '牛顿第一定律',
        raw`\sum_i \mathbf{F}_i=0\Longrightarrow\frac{\mathrm{d}\mathbf{v}}{\mathrm{d}t}=0`,
      ),
      template(
        '牛顿第二定律',
        raw`\mathbf{F}=m \mathbf{a}=m \frac{\mathrm{d}^2\mathbf{r}}{\mathrm{d}t^2}`,
      ),
      template('牛顿第三定律', raw`\mathbf{F}_{12}=-\mathbf{F}_{21}`),
      template('引力势能', raw`E_{\mathrm{p}}=-\frac{GMm}{r}`),
      template(
        '库仑定律',
        raw`\mathbf{F}=k \frac{Qq}{r^2}\hat{\mathbf{r}}`,
      ),
      template(
        '静电场环路定理',
        raw`\oint_L \mathbf{E}\cdot\mathrm{d}\mathbf{l}=0`,
      ),
      template(
        '毕奥-萨伐尔定律',
        raw`\mathrm{d}\mathbf{B}=\frac{\mu_0}{4\pi}\frac{I\,\mathrm{d}\mathbf{l}\times\mathbf{r}}{r^3}`,
      ),
      template(
        '安培力公式',
        raw`\mathrm{d}\mathbf{F}=I\,\mathrm{d}\mathbf{l}\times\mathbf{B}`,
      ),
      template(
        '法拉第电磁感应定律',
        raw`\mathcal{E}=-N\frac{\mathrm{d}\Phi_B}{\mathrm{d}t}`,
      ),
      template(
        '高斯定律',
        raw`\Phi_E=\oiint_S \mathbf{E}\cdot\mathrm{d}\mathbf{S}=\frac{1}{\varepsilon_0}\sum_i q_i`,
      ),
      template(
        '法拉第定律积分形式',
        raw`\oint_C \mathbf{E}\cdot\mathrm{d}\mathbf{l}=-\frac{\mathrm{d}\Phi_B}{\mathrm{d}t}`,
      ),
      template(
        '安培-麦克斯韦定律',
        raw`\oint_C \mathbf{B}\cdot\mathrm{d}\mathbf{l}=\mu_0 I+\mu_0 \varepsilon_0 \frac{\mathrm{d}\Phi_E}{\mathrm{d}t}`,
      ),
      template('焦耳定律', raw`Q=I^2Rt`),
      template('万有引力定律', raw`F=G\frac{Mm}{r^2}`),
      template('光电效应方程', raw`E_{\mathrm{k}}=h\nu-W_0`),
      template('德布罗意波长', raw`\lambda=\frac{h}{mv}=\frac{h}{p}`),
      template(
        '海森堡不确定性原理',
        raw`\Delta x\,\Delta p\geq\frac{h}{4\pi}=\frac{\hbar}{2}`,
      ),
      template(
        '长度收缩公式',
        raw`l=l_0\sqrt{1-\frac{v^2}{c^2}}`,
      ),
      template('质能方程', raw`E=mc^2`),
      template(
        '爱因斯坦场方程',
        raw`G_{\mu\nu}+\Lambda g_{\mu\nu}=\frac{8\pi G}{c^4} T_{\mu\nu}`,
        undefined,
        'wide',
      ),
      template('简谐振动方程', raw`y(t)=A\cos(\omega t+\varphi_0)`),
      template(
        '简谐波方程',
        raw`y(x,t)=A\cos\left(\frac{2\pi x}{\lambda}-\omega t+\varphi\right)`,
      ),
      template(
        '麦克斯韦方程组微分形式',
        raw`\begin{aligned}\nabla\cdot\mathbf{E}&=\frac{\rho}{\varepsilon_0}\\\nabla\cdot\mathbf{B}&=0\\\nabla\times\mathbf{E}&=-\frac{\partial\mathbf{B}}{\partial t}\\\nabla\times\mathbf{B}&=\mu_0 \mathbf{J}+\mu_0 \varepsilon_0 \frac{\partial\mathbf{E}}{\partial t}\end{aligned}`,
        undefined,
        'large',
      ),
      template(
        '麦克斯韦方程组积分形式',
        raw`\begin{aligned}\oiint_S \mathbf{E}\cdot\mathrm{d}\mathbf{S}&=\frac{Q}{\varepsilon_0}\\\oiint_S \mathbf{B}\cdot\mathrm{d}\mathbf{S}&=0\\\oint_C \mathbf{E}\cdot\mathrm{d}\mathbf{l}&=-\frac{\mathrm{d}}{\mathrm{d}t}\iint_S \mathbf{B}\cdot\mathrm{d}\mathbf{S}\\\oint_C \mathbf{B}\cdot\mathrm{d}\mathbf{l}&=\mu_0 I+\mu_0 \varepsilon_0 \frac{\mathrm{d}}{\mathrm{d}t}\iint_S \mathbf{E}\cdot\mathrm{d}\mathbf{S}\end{aligned}`,
        undefined,
        'extra-tall',
      ),
      template(
        '介质中的麦克斯韦方程组微分形式',
        raw`\begin{aligned}\nabla\cdot\mathbf{D}&=\rho_{\mathrm{f}}\\\nabla\cdot\mathbf{B}&=0\\\nabla\times\mathbf{E}&=-\frac{\partial\mathbf{B}}{\partial t}\\\nabla\times\mathbf{H}&=\mathbf{J}_{\mathrm{f}}+\frac{\partial\mathbf{D}}{\partial t}\end{aligned}`,
        undefined,
        'large',
      ),
      template(
        '介质中的麦克斯韦方程组积分形式',
        raw`\begin{aligned}\oiint_S \mathbf{D}\cdot\mathrm{d}\mathbf{S}&=Q_{\mathrm{f}}\\\oiint_S \mathbf{B}\cdot\mathrm{d}\mathbf{S}&=0\\\oint_C \mathbf{E}\cdot\mathrm{d}\mathbf{l}&=-\frac{\mathrm{d}}{\mathrm{d}t}\iint_S \mathbf{B}\cdot\mathrm{d}\mathbf{S}\\\oint_C \mathbf{H}\cdot\mathrm{d}\mathbf{l}&=I_{\mathrm{f}}+\frac{\mathrm{d}}{\mathrm{d}t}\iint_S \mathbf{D}\cdot\mathrm{d}\mathbf{S}\end{aligned}`,
        undefined,
        'extra-tall',
      ),
    ]),
    templateCategory('chemistry', '化学', raw`\ce{H2O}`, [
      template('硫酸钡沉淀反应', raw`\ce{SO4^2- + Ba^2+ -> BaSO4 v}`),
      template(
        '反应箭头与沉淀符号',
        raw`\ce{A + B ->[加热] C v + D ^}`,
      ),
      template(
        '汞碘络合反应',
        raw`\ce{Hg^2+ ->[I-] HgI2 ->[I-] [HgI4]^2-}`,
      ),
      template(
        '锌氢氧化物两性反应',
        raw`\ce{Zn^2+ <=>[+2OH-][+2H+] Zn(OH)2 <=>[+2OH-][+2H+] [Zn(OH)4]^2-}`,
      ),
    ], true),
  ];

  const templateCategoryCounts = Object.freeze({
    algebra: 13,
    geometry: 11,
    inequalities: 13,
    calculus: 14,
    'matrix-templates': 8,
    'trig-templates': 12,
    statistics: 16,
    sequences: 10,
    physics: 26,
    chemistry: 4,
  });
  for (const candidate of templateCategories) {
    if (candidate.templates.length !== templateCategoryCounts[candidate.id]) {
      throw new Error(`Formula template count mismatch for ${candidate.id}`);
    }
  }
  const templates = templateCategories.flatMap((candidate) => candidate.templates);
  if (templates.length !== 127) throw new Error('Formula template total must be 127');

  return Object.freeze({
    categories,
    formatTools,
    templateCategories,
    templateCategoryCounts,
    templates,
  });
}));
