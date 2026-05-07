import { evaluate, sum, mean, min, max } from 'mathjs';

export type ComputedData = Record<string, string | number>;
export type RawData = Record<string, string>;

function parseRange(range: string) {
  const [start, end] = range.toUpperCase().split(':');
  const startMatch = start.match(/^([A-J])(10|[1-9])$/);
  const endMatch = end.match(/^([A-J])(10|[1-9])$/);
  if (!startMatch || !endMatch) return null;

  const startCol = startMatch[1].charCodeAt(0) - 65;
  const startRow = Number(startMatch[2]);
  const endCol = endMatch[1].charCodeAt(0) - 65;
  const endRow = Number(endMatch[2]);

  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const rangeCells: string[] = [];

  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      rangeCells.push(`${String.fromCharCode(65 + col)}${row}`);
    }
  }

  return rangeCells;
}

export function computeGrid(data: RawData): ComputedData {
  const computed: ComputedData = {};

  function getNumericValue(value: string | number) {
    if (typeof value === 'number') return value;
    if (value === '') return 0;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function evalCell(cellId: string, visiting: Set<string>): string | number {
    const normalized = cellId.toUpperCase();

    if (normalized in computed) {
      return computed[normalized];
    }

    if (visiting.has(normalized)) {
      return '#CIRCULAR';
    }

    visiting.add(normalized);
    const raw = data[normalized];
    if (raw === undefined || raw === null || raw.trim() === '') {
      visiting.delete(normalized);
      return '';
    }

    const text = raw.trim();
    const formula = text.slice(1);
    if (!text.startsWith('=')) {
      if (!isNaN(Number(text))) {
        const val = Number(text);
        computed[normalized] = val;
        visiting.delete(normalized);
        return val;
      }
      computed[normalized] = text;
      visiting.delete(normalized);
      return text;
    }

    const rangeMatches = Array.from(formula.matchAll(/([A-J](?:10|[1-9])):([A-J](?:10|[1-9]))/gi));
    function getNumbers(args: any[]) {
      const arr = args.map(a => (a && typeof a.toArray === 'function') ? a.toArray() : a);
      return arr.flat(Infinity).filter(v => typeof v === 'number');
    }

    const scope: Record<string, any> = {
      sum: (...args: any[]) => {
        const nums = getNumbers(args);
        return nums.length ? sum(nums) : 0;
      },
      average: (...args: any[]) => {
        const nums = getNumbers(args);
        if (!nums.length) throw new Error('DIV/0');
        return mean(nums);
      },
      min: (...args: any[]) => {
        const nums = getNumbers(args);
        return nums.length ? min(nums) : 0;
      },
      max: (...args: any[]) => {
        const nums = getNumbers(args);
        return nums.length ? max(nums) : 0;
      },
      count: (...args: any[]) => getNumbers(args).length
    };

    let modifiedExpression = formula;
    let hasError = false;
    let circularError = false;

    for (let i = 0; i < rangeMatches.length; i += 1) {
      const match = rangeMatches[i] as RegExpMatchArray;
const [fullMatch, startCell, endCell] = match;
      const rangeCells = parseRange(`${startCell}:${endCell}`);
      if (!rangeCells) {
        hasError = true;
        continue;
      }
      const rangeValues: number[] = [];
      for (const refCell of rangeCells) {
        const refVal = evalCell(refCell, visiting);
        if (refVal === '#CIRCULAR') {
          circularError = true;
        } else if (refVal === '#ERROR') {
          hasError = true;
        } else {
          rangeValues.push(Number(refVal));
        }
      }
      modifiedExpression = modifiedExpression.replace(fullMatch, `[${rangeValues.map(v => JSON.stringify(v)).join(',')}]`);
    }

    modifiedExpression = modifiedExpression.toLowerCase();

    const refs = modifiedExpression.match(/\b([a-j](?:10|[1-9]))\b/gi) || [];
    for (const ref of refs) {
      const upperRef = ref.toUpperCase();
      const refVal = evalCell(upperRef, visiting);
      if (refVal === '#CIRCULAR') {
        circularError = true;
      } else if (refVal === '#ERROR') {
        hasError = true;
      } else {
        const numeric = getNumericValue(refVal);
        if (numeric === null) {
          hasError = true;
        } else {
          scope[ref] = numeric;
        }
      }
    }

    let result: string | number;
    if (circularError) {
      result = '#CIRCULAR';
    } else if (hasError) {
      result = '#ERROR';
    } else {
      try {
        const res = evaluate(modifiedExpression, scope);
        if (typeof res === 'number') {
          if (!isFinite(res)) {
            result = '#ERROR';
          } else {
            result = Math.round(res * 10000000000) / 10000000000;
          }
        } else {
          result = res;
        }
      } catch {
        result = '#ERROR';
      }
    }

    computed[normalized] = result;
    visiting.delete(normalized);
    return result;
  }

  for (const cellId in data) {
    evalCell(cellId, new Set());
  }

  return computed;
}
