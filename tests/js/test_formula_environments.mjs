import assert from 'node:assert/strict';
import {
  createFormulaEnvironmentSwitcher,
  switchFormulaEnvironment,
} from '../../frontend/app/features/formula-environments.mjs';

const formula = String.raw`\sum_{i = 1}^{n}{(X_i - \overline{X})^2}`;
let switched = formula;
for (const environment of ['array', 'split', 'cases', 'aligned']) {
  switched = switchFormulaEnvironment(switched, environment);
}
assert.equal(switched, String.raw`\begin{aligned}
${formula}
\end{aligned}`);
assert.equal(switchFormulaEnvironment(switched, 'gathered'), String.raw`\begin{gathered}
${formula}
\end{gathered}`);
assert.equal(switchFormulaEnvironment(formula, 'array'), String.raw`\begin{array}{c}
${formula}
\end{array}`);
assert.equal(switchFormulaEnvironment(formula, 'array', 'lr'), String.raw`\begin{array}{lr}
${formula}
\end{array}`);

const switchForPage = createFormulaEnvironmentSwitcher();
assert.equal(switchForPage(formula, 'array'), String.raw`\begin{array}{c}
${formula}
\end{array}`);
const leftArray = String.raw`\begin{array}{l}
${formula}
\end{array}`;
const alignedAfterLeftArray = switchForPage(leftArray, 'aligned');
assert.equal(switchForPage(alignedAfterLeftArray, 'array'), leftArray);
const switchForNewPage = createFormulaEnvironmentSwitcher();
assert.match(switchForNewPage(formula, 'array'), /^\\begin\{array\}\{c\}/);

const legacyNested = String.raw`\begin{aligned}
\begin{cases}\begin{split}\begin{array}{cc}${formula} & \end{array} & \end{split} & \end{cases} &
\end{aligned}`;
assert.equal(switchFormulaEnvironment(legacyNested, 'align'), String.raw`\begin{align}
${formula}
\end{align}`);
assert.equal(switchFormulaEnvironment(legacyNested, 'none'), formula);
const mathLiveNested = String.raw`\begin{array}{cc}
\begin{split}\begin{cases}\begin{gathered}\begin{aligned}${formula} & \\  & \end{aligned}\\ \end{gathered} & \end{cases} & \end{split} &
\end{array}`;
assert.equal(switchFormulaEnvironment(mathLiveNested, 'align'), String.raw`\begin{align}
${formula}
\end{align}`);
assert.equal(switchFormulaEnvironment(mathLiveNested, 'none'), formula);
assert.equal(switchFormulaEnvironment(String.raw`x + \begin{cases}a & b\end{cases}`, 'gathered'), String.raw`\begin{gathered}
x + \begin{cases}a & b\end{cases}
\end{gathered}`);

const formattedMatrix = String.raw`\begin{pmatrix}
  1 & 0 \\
  0 & 1
\end{pmatrix}`;
assert.equal(
  switchFormulaEnvironment(formattedMatrix, 'eqnarray'),
  String.raw`\begin{eqnarray}
${formattedMatrix}
\end{eqnarray}`,
);

const formattedMaxwell = String.raw`\begin{aligned}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \nabla \cdot \mathbf{B} &= 0 \\
  \nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
  \nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}`;
assert.equal(
  switchFormulaEnvironment(formattedMaxwell, 'split'),
  String.raw`\begin{split}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \nabla \cdot \mathbf{B} &= 0 \\
  \nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
  \nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{split}`,
);

const intentionalNestedEnvironment = String.raw`\begin{aligned}
  f(x) &= \begin{cases}
    x, & x > 0 \\
    0, & x \leq 0
  \end{cases}
\end{aligned}`;
assert.equal(
  switchFormulaEnvironment(intentionalNestedEnvironment, 'gathered'),
  String.raw`\begin{gathered}
  f(x) &= \begin{cases}
    x, & x > 0 \\
    0, & x \leq 0
  \end{cases}
\end{gathered}`,
);
