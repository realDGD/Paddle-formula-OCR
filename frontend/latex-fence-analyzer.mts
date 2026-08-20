const LETTER: RegExp = /[A-Za-z]/;

export type LatexFenceToken = {
  commandTo: number;
  delimiter: string;
  delimiterFrom: number;
  depth: number;
  from: number;
  pairId: number | null;
  role: string;
  to: number;
  unmatched: string;
};

export type LatexFenceAnalysis = {
  pairs: number;
  source: string;
  tokens: LatexFenceToken[];
  unmatched: LatexFenceToken[];
};

function readCommand(source: string, start: number) {
  if (source[start] !== '\\' || start + 1 >= source.length) return null;
  let end = start + 1;
  if (LETTER.test(source[end])) {
    while (end < source.length && LETTER.test(source[end])) end += 1;
  } else {
    end += 1;
  }
  return {
    from: start,
    to: end,
    name: source.slice(start + 1, end),
  };
}

function readDelimiter(source: string, start: number) {
  let from = start;
  while (from < source.length && /\s/.test(source[from])) from += 1;
  if (from >= source.length || source[from] === '%') {
    return { from, to: from, value: '' };
  }
  if (source[from] === '\\') {
    const command = readCommand(source, from);
    if (command) {
      return {
        from,
        to: command.to,
        value: source.slice(from, command.to),
      };
    }
  }
  const [value = ''] = [...source.slice(from)];
  return { from, to: from + value.length, value };
}

function skipVerb(source: string, commandEnd: number) {
  let delimiterAt = commandEnd;
  if (source[delimiterAt] === '*') delimiterAt += 1;
  const delimiter = source[delimiterAt];
  if (!delimiter || /\s/.test(delimiter)) return commandEnd;
  const closingAt = source.indexOf(delimiter, delimiterAt + 1);
  return closingAt < 0 ? source.length : closingAt + 1;
}

export function expectedRightDelimiter(delimiter: string): string {
  const pairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '<': '>',
    '\\{': '\\}',
    '\\lbrace': '\\rbrace',
    '\\langle': '\\rangle',
    '\\lceil': '\\rceil',
    '\\lfloor': '\\rfloor',
    '\\lgroup': '\\rgroup',
    '\\lmoustache': '\\rmoustache',
    '\\lvert': '\\rvert',
    '\\lVert': '\\rVert',
  };
  return pairs[delimiter] || delimiter || '.';
}

export function analyzeLatexFences(value: unknown): LatexFenceAnalysis {
  const source = String(value ?? '');
  const tokens: LatexFenceToken[] = [];
  const stack: LatexFenceToken[] = [];
  let pairId = 0;

  for (let index = 0; index < source.length;) {
    if (source[index] === '%') {
      const lineEnd = source.indexOf('\n', index + 1);
      index = lineEnd < 0 ? source.length : lineEnd + 1;
      continue;
    }
    if (source[index] !== '\\') {
      index += 1;
      continue;
    }

    const command = readCommand(source, index);
    if (!command) {
      index += 1;
      continue;
    }
    if (command.name === 'verb') {
      index = skipVerb(source, command.to);
      continue;
    }
    if (!['left', 'right'].includes(command.name)) {
      index = command.to;
      continue;
    }

    const delimiter = readDelimiter(source, command.to);
    const token: LatexFenceToken = {
      role: command.name,
      delimiter: delimiter.value,
      from: command.from,
      to: Math.max(command.to, delimiter.to),
      commandTo: command.to,
      delimiterFrom: delimiter.from,
      depth: stack.length,
      pairId: null,
      unmatched: '',
    };
    tokens.push(token);

    if (token.role === 'left') {
      stack.push(token);
    } else if (stack.length > 0) {
      const left = stack.pop()!;
      pairId += 1;
      left.pairId = pairId;
      token.pairId = pairId;
      token.depth = left.depth;
    } else {
      token.unmatched = 'extra-right';
      token.depth = 0;
    }
    index = token.to > index ? token.to : command.to;
  }

  for (const token of stack) token.unmatched = 'missing-right';
  return {
    source,
    tokens,
    pairs: pairId,
    unmatched: tokens.filter((token) => token.unmatched),
  };
}
