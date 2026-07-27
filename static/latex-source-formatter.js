(function (root, factory) {
  const formatter = factory();
  if (typeof module === 'object' && module.exports) module.exports = formatter;
  root.FormulaOcrLatexFormatter = formatter;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STRUCTURED_ENVIRONMENTS = new Set([
    'align', 'align*', 'aligned', 'alignedat', 'alignedat*', 'array', 'bmatrix',
    'Bmatrix', 'cases', 'dcases', 'dcases*', 'eqnarray', 'eqnarray*', 'gather',
    'gather*', 'gathered', 'matrix', 'multline', 'multline*', 'pmatrix',
    'smallmatrix', 'split', 'subarray', 'Vmatrix', 'vmatrix',
  ]);
  const ENVIRONMENT_ARGUMENT_COUNTS = new Map([
    ['alignedat', 1],
    ['alignedat*', 1],
    ['array', 1],
    ['subarray', 1],
  ]);

  const OPAQUE_COMMANDS = new Set([
    '\\bbox', '\\ce', '\\colorbox', '\\fbox', '\\hbox', '\\href', '\\htmlClass',
    '\\htmlData', '\\htmlId', '\\htmlStyle', '\\mbox', '\\operatorname', '\\pu',
    '\\style', '\\text', '\\textbf', '\\textit', '\\textmd', '\\textnormal',
    '\\textrm', '\\textsf', '\\textsl', '\\texttt', '\\textup', '\\unicode', '\\url',
  ]);

  const UNSAFE_COMMANDS = new Set([
    '\\catcode', '\\char', '\\csname', '\\def', '\\edef', '\\futurelet', '\\gdef',
    '\\hskip', '\\kern', '\\let', '\\mathchar', '\\mkern', '\\newcommand',
    '\\renewcommand', '\\rule', '\\skip', '\\vskip', '\\xdef',
  ]);

  const BINARY_COMMANDS = new Set([
    '\\amalg', '\\ast', '\\bigcirc', '\\bigtriangledown', '\\bigtriangleup',
    '\\bullet', '\\cap', '\\cdot', '\\circ', '\\cup', '\\dagger', '\\ddagger',
    '\\diamond', '\\div', '\\lhd', '\\mp', '\\odot', '\\ominus', '\\oplus',
    '\\oslash', '\\otimes', '\\pm', '\\rhd', '\\setminus', '\\sqcap', '\\sqcup',
    '\\star', '\\times', '\\triangleleft', '\\triangleright', '\\unlhd', '\\unrhd',
    '\\uplus', '\\vee', '\\wedge', '\\wr',
  ]);

  const RELATION_COMMANDS = new Set([
    '\\approx', '\\asymp', '\\bowtie', '\\cong', '\\dashv', '\\doteq', '\\equiv',
    '\\ge', '\\geq', '\\gets', '\\gg', '\\hookleftarrow', '\\hookrightarrow',
    '\\iff', '\\in', '\\Join', '\\le', '\\leftarrow', '\\Leftrightarrow',
    '\\leftrightarrow', '\\leq', '\\ll', '\\longleftarrow',
    '\\Longleftarrow', '\\longleftrightarrow', '\\Longleftrightarrow',
    '\\longmapsto', '\\longrightarrow', '\\Longrightarrow', '\\mapsto', '\\mid',
    '\\models', '\\ne', '\\neq', '\\ni', '\\notin', '\\parallel', '\\perp',
    '\\prec', '\\preceq', '\\propto', '\\rightarrow', '\\Rightarrow',
    '\\rightleftharpoons', '\\sim', '\\simeq', '\\smile', '\\sqsubset',
    '\\sqsubseteq', '\\sqsupset', '\\sqsupseteq', '\\subset', '\\subseteq',
    '\\succ', '\\succeq', '\\supset', '\\supseteq', '\\to', '\\vdash',
  ]);

  const FUNCTION_COMMANDS = new Set([
    '\\arccos', '\\arcsin', '\\arctan', '\\arg', '\\cos', '\\cosh', '\\cot',
    '\\coth', '\\csc', '\\deg', '\\det', '\\dim', '\\exp', '\\gcd', '\\hom',
    '\\inf', '\\ker', '\\lg', '\\lim', '\\liminf', '\\limsup', '\\ln', '\\log',
    '\\max', '\\min', '\\Pr', '\\sec', '\\sin', '\\sinh', '\\sup', '\\tan',
    '\\tanh',
  ]);

  const COMPACT_SPACING_COMMANDS = new Set(['\\ ', '\\!', '\\,', '\\:', '\\;']);
  const WIDE_SPACING_COMMANDS = new Set(['\\enspace', '\\quad', '\\qquad']);
  const DELIMITER_COMMANDS = new Set([
    '\\Big', '\\Bigg', '\\Biggl', '\\Biggm', '\\Biggr', '\\Bigl', '\\Bigm',
    '\\Bigr', '\\big', '\\bigg', '\\biggl', '\\biggm', '\\biggr', '\\bigl',
    '\\bigm', '\\bigr', '\\left', '\\middle', '\\right',
  ]);
  const ATTACHED_COMMAND_MODIFIERS = new Set([
    '\\displaylimits', '\\limits', '\\nolimits',
  ]);

  const isControlWordCharacter = (character) => /[A-Za-z@]/.test(character || '');
  const isWhitespace = (character) => /\s/.test(character || '');

  function readCommand(source, start) {
    let end = start + 1;
    if (end >= source.length) return { value: '\\', end };
    if (isControlWordCharacter(source[end])) {
      end += 1;
      while (end < source.length && isControlWordCharacter(source[end])) end += 1;
    } else {
      end += 1;
    }
    return { value: source.slice(start, end), end };
  }

  function readBalancedGroup(source, start) {
    if (source[start] !== '{') return null;
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (character === '\\') {
        const command = readCommand(source, index);
        index = command.end - 1;
        continue;
      }
      if (character === '%') return null;
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    return null;
  }

  function readEnvironment(source, command, commandEnd) {
    if (command !== '\\begin' && command !== '\\end') return null;
    let index = commandEnd;
    while (index < source.length && isWhitespace(source[index])) index += 1;
    if (source[index] !== '{') return null;
    const close = source.indexOf('}', index + 1);
    if (close < 0) return null;
    const name = source.slice(index + 1, close);
    if (!/^[A-Za-z*]+$/.test(name)) return null;
    let end = close + 1;
    let value = `${command}{${name}}`;
    let missingArgument = false;
    const argumentCount = command === '\\begin'
      ? (ENVIRONMENT_ARGUMENT_COUNTS.get(name) || 0)
      : 0;
    for (let argument = 0; argument < argumentCount; argument += 1) {
      let groupStart = end;
      while (groupStart < source.length && isWhitespace(source[groupStart])) groupStart += 1;
      const groupEnd = readBalancedGroup(source, groupStart);
      if (groupEnd === null) {
        missingArgument = true;
        break;
      }
      value += source.slice(groupStart, groupEnd);
      end = groupEnd;
    }
    return {
      type: command === '\\begin' ? 'beginEnvironment' : 'endEnvironment',
      value,
      environment: name,
      end,
      missingArgument,
    };
  }

  function tokenize(source) {
    const tokens = [];
    let hasComment = false;
    let hasUnsupportedDelimiter = false;
    let hasUnsafeCommand = false;
    let hasMalformedEnvironmentHeader = false;
    let index = 0;

    while (index < source.length) {
      const character = source[index];
      if (isWhitespace(character)) {
        let end = index + 1;
        while (end < source.length && isWhitespace(source[end])) end += 1;
        tokens.push({ type: 'whitespace', value: source.slice(index, end) });
        index = end;
        continue;
      }
      if (character === '%') {
        hasComment = true;
        let end = source.indexOf('\n', index);
        if (end < 0) end = source.length;
        else end += 1;
        tokens.push({ type: 'comment', value: source.slice(index, end) });
        index = end;
        continue;
      }
      if (character === '$') {
        hasUnsupportedDelimiter = true;
        tokens.push({ type: 'character', value: character });
        index += 1;
        continue;
      }
      if (character !== '\\') {
        tokens.push({ type: 'character', value: character });
        index += 1;
        continue;
      }

      const command = readCommand(source, index);
      const environment = readEnvironment(source, command.value, command.end);
      if (environment) {
        if (environment.missingArgument) hasMalformedEnvironmentHeader = true;
        tokens.push(environment);
        index = environment.end;
        continue;
      }
      if (command.value === '\\verb') {
        hasUnsafeCommand = true;
      }
      if (UNSAFE_COMMANDS.has(command.value)) {
        hasUnsafeCommand = true;
      }

      let opaqueCommandEnd = command.end;
      let opaqueCommand = command.value;
      if (source[opaqueCommandEnd] === '*' && OPAQUE_COMMANDS.has(command.value)) {
        opaqueCommand += '*';
        opaqueCommandEnd += 1;
      }
      if (OPAQUE_COMMANDS.has(command.value)) {
        let groupStart = opaqueCommandEnd;
        while (groupStart < source.length && isWhitespace(source[groupStart])) groupStart += 1;
        const groupEnd = readBalancedGroup(source, groupStart);
        if (groupEnd !== null) {
          tokens.push({
            type: 'opaque',
            command: opaqueCommand,
            value: source.slice(index, groupEnd),
          });
          index = groupEnd;
          continue;
        }
      }

      tokens.push({
        type: command.value === '\\\\' ? 'rowBreak' : 'command',
        value: command.value,
      });
      index = command.end;
    }

    return {
      tokens,
      hasComment,
      hasMalformedEnvironmentHeader,
      hasUnsupportedDelimiter,
      hasUnsafeCommand,
    };
  }

  function isStructurallyBalanced(tokens) {
    const groups = [];
    const environments = [];
    for (const token of tokens) {
      if (token.type === 'opaque') continue;
      if (token.type === 'character' && token.value === '{') groups.push(token.value);
      if (token.type === 'character' && token.value === '}') {
        if (!groups.length) return false;
        groups.pop();
      }
      if (token.type === 'beginEnvironment') environments.push(token.environment);
      if (token.type === 'endEnvironment') {
        if (environments.pop() !== token.environment) return false;
      }
    }
    return groups.length === 0 && environments.length === 0;
  }

  function tokenSignature(tokens) {
    return tokens
      .filter((token) => token.type !== 'whitespace')
      .map((token) => `${token.type}:${token.value}`)
      .join('\u001f');
  }

  const isCharacter = (token, values) => (
    token?.type === 'character' && values.includes(token.value)
  );
  const isOpeningDelimiter = (token) => isCharacter(token, ['{', '[', '(']);
  const isClosingDelimiter = (token) => isCharacter(token, ['}', ']', ')']);
  const isPunctuation = (token) => isCharacter(token, [',', ';', ':']);
  const isScriptMarker = (token) => isCharacter(token, ['_', '^']);
  const isPostfix = (token) => isCharacter(token, ['!', "'"]);
  const isAmpersand = (token) => isCharacter(token, ['&']);
  const isRelation = (token) => (
    isCharacter(token, ['=', '<', '>'])
    || (token?.type === 'command' && RELATION_COMMANDS.has(token.value))
  );
  const isCompactSpacing = (token) => (
    token?.type === 'command' && COMPACT_SPACING_COMMANDS.has(token.value)
  );
  const isWideSpacing = (token) => (
    token?.type === 'command' && WIDE_SPACING_COMMANDS.has(token.value)
  );

  function operatorRole(token, previous) {
    if (token?.type === 'command' && BINARY_COMMANDS.has(token.value)) return 'binary';
    if (!isCharacter(token, ['+', '-', '*', '/'])) return '';
    const previousIsOperator = (
      previous?.type === 'command' && BINARY_COMMANDS.has(previous.value)
    ) || isCharacter(previous, ['+', '-', '*', '/']);
    const unary = (
      !previous
      || isOpeningDelimiter(previous)
      || isPunctuation(previous)
      || isAmpersand(previous)
      || isScriptMarker(previous)
      || previous.type === 'rowBreak'
      || isRelation(previous)
      || previousIsOperator
    );
    return unary && ['+', '-'].includes(token.value) ? 'unary' : 'binary';
  }

  function normalWhitespace(value) {
    return value ? ' ' : '';
  }

  function defaultSeparator(previous, current, originalWhitespace, previousPrevious) {
    const currentRole = operatorRole(current, previous);
    const previousRole = operatorRole(previous, previousPrevious);

    if (isClosingDelimiter(current) || isPunctuation(current) || isPostfix(current)) return '';
    if (isOpeningDelimiter(previous) || isScriptMarker(previous) || isScriptMarker(current)) return '';
    if (previous?.type === 'command' && DELIMITER_COMMANDS.has(previous.value)) return '';
    if (current?.type === 'command' && ['\\middle', '\\right'].includes(current.value)) return '';

    if (isCompactSpacing(previous) || isCompactSpacing(current)) return '';
    if (isWideSpacing(previous) || isWideSpacing(current)) return ' ';

    if (isAmpersand(current)) return ' ';
    if (isAmpersand(previous)) return isRelation(current) ? '' : ' ';

    if (isPunctuation(previous)) {
      return isClosingDelimiter(current) || isCompactSpacing(current) || isWideSpacing(current) ? '' : ' ';
    }

    if (isRelation(current) || isRelation(previous)) return ' ';
    if (currentRole === 'binary') return ' ';
    if (previousRole === 'binary') return ' ';
    if (previousRole === 'unary') return '';

    if (
      previous?.type === 'command'
      && FUNCTION_COMMANDS.has(previous.value)
      && !isOpeningDelimiter(current)
    ) {
      return ' ';
    }
    if (
      current?.type === 'command'
      && FUNCTION_COMMANDS.has(current.value)
      && !isOpeningDelimiter(previous)
    ) {
      return ' ';
    }
    if (
      previous?.type === 'command'
      && current?.type === 'command'
      && !ATTACHED_COMMAND_MODIFIERS.has(current.value)
    ) {
      return ' ';
    }
    return normalWhitespace(originalWhitespace);
  }

  function formatTokens(tokens) {
    const significant = [];
    let whitespace = '';
    for (const token of tokens) {
      if (token.type === 'whitespace') {
        whitespace += token.value;
        continue;
      }
      significant.push({ ...token, whitespaceBefore: whitespace });
      whitespace = '';
    }

    const output = [];
    const structuredStack = [];
    for (let index = 0; index < significant.length; index += 1) {
      const current = significant[index];
      const previous = significant[index - 1];
      const previousPrevious = significant[index - 2];
      let separator = '';

      if (previous) {
        const closingStructuredEnvironment = (
          current.type === 'endEnvironment'
          && structuredStack.at(-1) === current.environment
        );
        const afterStructuredStart = (
          previous.type === 'beginEnvironment'
          && STRUCTURED_ENVIRONMENTS.has(previous.environment)
        );
        const afterStructuredRow = previous.type === 'rowBreak' && structuredStack.length > 0;

        if (closingStructuredEnvironment) {
          separator = `\n${'  '.repeat(Math.max(0, structuredStack.length - 1))}`;
        } else if (afterStructuredStart || afterStructuredRow) {
          separator = `\n${'  '.repeat(structuredStack.length)}`;
        } else if (current.type === 'rowBreak' && structuredStack.length > 0) {
          separator = ' ';
        } else {
          separator = defaultSeparator(
            previous,
            current,
            current.whitespaceBefore,
            previousPrevious,
          );
        }
      }

      output.push(separator, current.value);

      if (
        current.type === 'beginEnvironment'
        && STRUCTURED_ENVIRONMENTS.has(current.environment)
      ) {
        structuredStack.push(current.environment);
      } else if (
        current.type === 'endEnvironment'
        && structuredStack.at(-1) === current.environment
      ) {
        structuredStack.pop();
      }
    }
    return output.join('').trim();
  }

  function unchanged(source, status) {
    return Object.freeze({
      source,
      formatted: source,
      changed: false,
      safe: false,
      status,
    });
  }

  function formatLatexSource(value) {
    const source = String(value ?? '');
    if (!source.trim()) {
      return Object.freeze({
        source,
        formatted: source.trim(),
        changed: source !== source.trim(),
        safe: true,
        status: source === source.trim() ? 'unchanged' : 'formatted',
      });
    }
    if (/\\\\\s*\[/.test(source)) return unchanged(source, 'optional-row-spacing');

    const parsed = tokenize(source);
    if (parsed.hasComment) return unchanged(source, 'comment-protected');
    if (parsed.hasMalformedEnvironmentHeader) {
      return unchanged(source, 'malformed-environment-header');
    }
    if (parsed.hasUnsupportedDelimiter) return unchanged(source, 'delimiter-protected');
    if (parsed.hasUnsafeCommand) return unchanged(source, 'unsafe-command');
    if (!isStructurallyBalanced(parsed.tokens)) return unchanged(source, 'unbalanced');

    const formatted = formatTokens(parsed.tokens);
    const reparsed = tokenize(formatted);
    if (
      reparsed.hasComment
      || reparsed.hasMalformedEnvironmentHeader
      || reparsed.hasUnsupportedDelimiter
      || reparsed.hasUnsafeCommand
      || !isStructurallyBalanced(reparsed.tokens)
      || tokenSignature(parsed.tokens) !== tokenSignature(reparsed.tokens)
    ) {
      return unchanged(source, 'token-changed');
    }

    return Object.freeze({
      source,
      formatted,
      changed: formatted !== source,
      safe: true,
      status: formatted === source ? 'unchanged' : 'formatted',
    });
  }

  function hasEquivalentTokens(left, right) {
    const leftTokens = tokenize(String(left ?? ''));
    const rightTokens = tokenize(String(right ?? ''));
    if (
      leftTokens.hasComment
      || rightTokens.hasComment
      || leftTokens.hasMalformedEnvironmentHeader
      || rightTokens.hasMalformedEnvironmentHeader
      || leftTokens.hasUnsupportedDelimiter
      || rightTokens.hasUnsupportedDelimiter
      || leftTokens.hasUnsafeCommand
      || rightTokens.hasUnsafeCommand
      || !isStructurallyBalanced(leftTokens.tokens)
      || !isStructurallyBalanced(rightTokens.tokens)
    ) {
      return false;
    }
    return tokenSignature(leftTokens.tokens) === tokenSignature(rightTokens.tokens);
  }

  return Object.freeze({
    format: formatLatexSource,
    hasEquivalentTokens,
  });
}));
