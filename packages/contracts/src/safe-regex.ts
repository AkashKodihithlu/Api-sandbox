export const MAX_REGEX_PATTERN_LENGTH = 256;
export const MAX_REGEX_QUANTIFIER_REPEAT = 100;
export const MAX_REGEX_NFA_STATES = 2048;

type NfaState =
  | { kind: 'match' }
  | { kind: 'epsilon'; out: number }
  | { kind: 'split'; out1: number; out2: number }
  | { kind: 'anchor_start'; out: number }
  | { kind: 'anchor_end'; out: number }
  | { kind: 'char'; matches: (ch: string) => boolean; out: number };

interface Fragment {
  start: number;
  outs: Array<(target: number) => void>;
}

export interface SafeRegex {
  readonly pattern: string;
  test(input: string, maxSteps?: number): { matched: boolean; budgetExceeded: boolean };
}

export type SafeRegexCompileResult = { ok: true; regex: SafeRegex } | { ok: false; error: string };

function isWordChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function isDigitChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isSpaceChar(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '\f' ||
    ch === '\v' ||
    ch === '\u00a0'
  );
}

class RegexCompiler {
  private readonly pattern: string;
  private pos = 0;
  private readonly states: NfaState[] = [];

  constructor(pattern: string) {
    this.pattern = pattern;
  }

  private addState(state: NfaState): number {
    if (this.states.length >= MAX_REGEX_NFA_STATES) {
      throw new Error(`Regex pattern exceeds maximum complexity (${MAX_REGEX_NFA_STATES} states)`);
    }
    this.states.push(state);
    return this.states.length - 1;
  }

  private patch(outs: Array<(target: number) => void>, target: number): void {
    for (const setOut of outs) {
      setOut(target);
    }
  }

  compile(): SafeRegex {
    const frag = this.parseAlternation();
    if (this.pos !== this.pattern.length) {
      throw new Error(`Unexpected character "${this.pattern[this.pos]}" at position ${this.pos}`);
    }
    const matchState = this.addState({ kind: 'match' });
    this.patch(frag.outs, matchState);

    const states = this.states;
    const startState = frag.start;
    const pattern = this.pattern;

    return {
      pattern,
      test(input: string, maxSteps = 500_000): { matched: boolean; budgetExceeded: boolean } {
        const len = input.length;
        const visited = new Int32Array(states.length);
        let generation = 0;
        let currentStates: number[] = [];
        let nextStates: number[] = [];
        let steps = 0;

        const addEpsilon = (list: number[], stateId: number, charPos: number): boolean => {
          const stack = [stateId];
          while (stack.length > 0) {
            steps += 1;
            if (steps > maxSteps) return false;
            const id = stack.pop()!;
            if (visited[id] === generation) continue;
            visited[id] = generation;

            const st = states[id];
            switch (st.kind) {
              case 'epsilon':
                stack.push(st.out);
                break;
              case 'split':
                stack.push(st.out2, st.out1);
                break;
              case 'anchor_start':
                if (charPos === 0) {
                  stack.push(st.out);
                }
                break;
              case 'anchor_end':
                if (charPos === len) {
                  stack.push(st.out);
                }
                break;
              case 'match':
              case 'char':
                list.push(id);
                break;
            }
          }
          return true;
        };

        for (let i = 0; i <= len; i++) {
          generation += 1;
          // Add startState at every position to support unanchored JSON Schema pattern search
          // (AnchorStart inside NFA naturally restricts ^ to i === 0).
          const active = currentStates;
          currentStates = [];
          for (const sid of active) {
            if (!addEpsilon(currentStates, sid, i)) {
              return { matched: false, budgetExceeded: true };
            }
          }
          if (!addEpsilon(currentStates, startState, i)) {
            return { matched: false, budgetExceeded: true };
          }

          for (const sid of currentStates) {
            if (states[sid].kind === 'match') {
              return { matched: true, budgetExceeded: false };
            }
          }

          if (i === len) break;

          const ch = input[i];
          nextStates = [];
          for (const sid of currentStates) {
            steps += 1;
            if (steps > maxSteps) {
              return { matched: false, budgetExceeded: true };
            }
            const st = states[sid];
            if (st.kind === 'char' && st.matches(ch)) {
              nextStates.push(st.out);
            }
          }
          currentStates = nextStates;
        }

        return { matched: false, budgetExceeded: false };
      },
    };
  }

  private emptyFragment(): Fragment {
    const state = { kind: 'epsilon' as const, out: -1 };
    const id = this.addState(state);
    return {
      start: id,
      outs: [
        (target) => {
          state.out = target;
        },
      ],
    };
  }

  private parseAlternation(): Fragment {
    const branches: Fragment[] = [this.parseSequence()];
    while (this.pos < this.pattern.length && this.pattern[this.pos] === '|') {
      this.pos++;
      branches.push(this.parseSequence());
    }

    if (branches.length === 1) {
      return branches[0];
    }

    let combined = branches[0];
    for (let i = 1; i < branches.length; i++) {
      const right = branches[i];
      const splitState = { kind: 'split' as const, out1: combined.start, out2: right.start };
      const splitId = this.addState(splitState);
      combined = {
        start: splitId,
        outs: [...combined.outs, ...right.outs],
      };
    }
    return combined;
  }

  private parseSequence(): Fragment {
    const items: Fragment[] = [];
    while (this.pos < this.pattern.length) {
      const ch = this.pattern[this.pos];
      if (ch === '|' || ch === ')') break;
      items.push(this.parseQuantified());
    }

    if (items.length === 0) {
      return this.emptyFragment();
    }

    let seq = items[0];
    for (let i = 1; i < items.length; i++) {
      const next = items[i];
      this.patch(seq.outs, next.start);
      seq = {
        start: seq.start,
        outs: next.outs,
      };
    }
    return seq;
  }

  private parseQuantified(): Fragment {
    const atomStartPos = this.pos;
    const isAnchor =
      this.pos < this.pattern.length &&
      (this.pattern[this.pos] === '^' || this.pattern[this.pos] === '$');
    let atom = this.parseAtom();
    const atomEndPos = this.pos;

    if (this.pos >= this.pattern.length) {
      return atom;
    }

    const q = this.pattern[this.pos];
    if (q !== '*' && q !== '+' && q !== '?' && q !== '{') {
      return atom;
    }

    let min = 0;
    let max: number | null = null;

    if (q === '*') {
      if (isAnchor) throw new Error(`Cannot quantify anchor at position ${this.pos}`);
      this.pos++;
      min = 0;
      max = null;
    } else if (q === '+') {
      if (isAnchor) throw new Error(`Cannot quantify anchor at position ${this.pos}`);
      this.pos++;
      min = 1;
      max = null;
    } else if (q === '?') {
      if (isAnchor) throw new Error(`Cannot quantify anchor at position ${this.pos}`);
      this.pos++;
      min = 0;
      max = 1;
    } else if (q === '{') {
      const parsed = this.tryParseBraceQuantifier();
      if (!parsed) {
        // Not a valid {n,m} quantifier; treat '{' as literal on next parse
        return atom;
      }
      if (isAnchor) throw new Error(`Cannot quantify anchor at position ${atomEndPos}`);
      min = parsed.min;
      max = parsed.max;
    }

    // Consume optional lazy '?' modifier
    if (this.pos < this.pattern.length && this.pattern[this.pos] === '?') {
      this.pos++;
    }

    // Reject consecutive quantifiers like a**, a++, a+{2}, a{2}{3}
    if (this.pos < this.pattern.length) {
      const nextCh = this.pattern[this.pos];
      if (
        nextCh === '*' ||
        nextCh === '+' ||
        nextCh === '?' ||
        (nextCh === '{' && /^\{(\d+)(?:,(\d*))?\}/.test(this.pattern.slice(this.pos)))
      ) {
        throw new Error(`Nothing to repeat at position ${this.pos}`);
      }
    }

    if (min === 0 && max === null) {
      const splitState = { kind: 'split' as const, out1: atom.start, out2: -1 };
      const splitId = this.addState(splitState);
      this.patch(atom.outs, splitId);
      return {
        start: splitId,
        outs: [
          (target) => {
            splitState.out2 = target;
          },
        ],
      };
    }

    if (min === 1 && max === null) {
      const splitState = { kind: 'split' as const, out1: atom.start, out2: -1 };
      const splitId = this.addState(splitState);
      this.patch(atom.outs, splitId);
      return {
        start: atom.start,
        outs: [
          (target) => {
            splitState.out2 = target;
          },
        ],
      };
    }

    if (min === 0 && max === 1) {
      const splitState = { kind: 'split' as const, out1: atom.start, out2: -1 };
      const splitId = this.addState(splitState);
      return {
        start: splitId,
        outs: [
          ...atom.outs,
          (target) => {
            splitState.out2 = target;
          },
        ],
      };
    }

    // Bounded {min, max} or {min,} expansion by re-parsing the atom slice
    const compileCopy = (): Fragment => {
      const savedPos = this.pos;
      this.pos = atomStartPos;
      const copy = this.parseAtom();
      this.pos = savedPos;
      return copy;
    };

    const parts: Fragment[] = [];
    if (min > 0) {
      parts.push(atom);
      for (let i = 1; i < min; i++) {
        parts.push(compileCopy());
      }
    }

    if (max === null) {
      // {min,} => min copies + 1 Kleene star copy
      const starAtom = min === 0 ? atom : compileCopy();
      const splitState = { kind: 'split' as const, out1: starAtom.start, out2: -1 };
      const splitId = this.addState(splitState);
      this.patch(starAtom.outs, splitId);
      parts.push({
        start: splitId,
        outs: [
          (target) => {
            splitState.out2 = target;
          },
        ],
      });
    } else {
      const optionalCount = max - min;
      for (let i = 0; i < optionalCount; i++) {
        const optAtom = min === 0 && i === 0 ? atom : compileCopy();
        const splitState = { kind: 'split' as const, out1: optAtom.start, out2: -1 };
        const splitId = this.addState(splitState);
        parts.push({
          start: splitId,
          outs: [
            ...optAtom.outs,
            (target) => {
              splitState.out2 = target;
            },
          ],
        });
      }
    }

    if (parts.length === 0) {
      return this.emptyFragment();
    }

    let combined = parts[0];
    for (let i = 1; i < parts.length; i++) {
      this.patch(combined.outs, parts[i].start);
      combined = { start: combined.start, outs: parts[i].outs };
    }
    return combined;
  }

  private tryParseBraceQuantifier(): { min: number; max: number | null } | null {
    const match = /^\{(\d+)(?:,(\d*))?\}/.exec(this.pattern.slice(this.pos));
    if (!match) {
      return null;
    }
    const min = Number(match[1]);
    const hasComma = match[0].includes(',');
    const max = hasComma ? (match[2] === '' ? null : Number(match[2])) : min;

    if (min > MAX_REGEX_QUANTIFIER_REPEAT || (max !== null && max > MAX_REGEX_QUANTIFIER_REPEAT)) {
      throw new Error(
        `Quantifier repetition count exceeds maximum of ${MAX_REGEX_QUANTIFIER_REPEAT}`,
      );
    }
    if (max !== null && max < min) {
      throw new Error(`Invalid quantifier range {${min},${max}}`);
    }

    this.pos += match[0].length;
    return { min, max };
  }

  private parseAtom(): Fragment {
    if (this.pos >= this.pattern.length) {
      throw new Error('Unexpected end of regex pattern');
    }

    const ch = this.pattern[this.pos];

    if (
      ch === '*' ||
      ch === '+' ||
      ch === '?' ||
      (ch === '{' && /^\{(\d+)(?:,(\d*))?\}/.test(this.pattern.slice(this.pos)))
    ) {
      throw new Error(`Nothing to repeat at position ${this.pos}`);
    }

    if (ch === '^') {
      this.pos++;
      const state = { kind: 'anchor_start' as const, out: -1 };
      const id = this.addState(state);
      return {
        start: id,
        outs: [
          (target) => {
            state.out = target;
          },
        ],
      };
    }

    if (ch === '$') {
      this.pos++;
      const state = { kind: 'anchor_end' as const, out: -1 };
      const id = this.addState(state);
      return {
        start: id,
        outs: [
          (target) => {
            state.out = target;
          },
        ],
      };
    }

    if (ch === '.') {
      this.pos++;
      return this.charFragment((c) => c !== '\n' && c !== '\r');
    }

    if (ch === '(') {
      this.pos++;
      if (this.pos < this.pattern.length && this.pattern[this.pos] === '?') {
        this.pos++;
        if (this.pos >= this.pattern.length) {
          throw new Error('Unterminated group');
        }
        const next = this.pattern[this.pos];
        if (next === ':') {
          this.pos++;
        } else if (next === '<') {
          const rest = this.pattern.slice(this.pos + 1);
          if (rest.startsWith('=') || rest.startsWith('!')) {
            throw new Error('Lookbehind assertions are not supported in safe regex');
          }
          const closeAngle = rest.indexOf('>');
          if (closeAngle <= 0) {
            throw new Error('Invalid named capturing group');
          }
          const groupName = rest.slice(0, closeAngle);
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(groupName)) {
            throw new Error(`Invalid named capturing group "${groupName}"`);
          }
          this.pos += 1 + closeAngle + 1;
        } else if (next === '=' || next === '!') {
          throw new Error('Lookahead assertions are not supported in safe regex');
        } else {
          throw new Error(`Unsupported group construct "(?${next}"`);
        }
      }

      const inner = this.parseAlternation();
      if (this.pos >= this.pattern.length || this.pattern[this.pos] !== ')') {
        throw new Error('Unterminated group "("');
      }
      this.pos++;
      return inner;
    }

    if (ch === '[') {
      return this.parseCharClass();
    }

    if (ch === '\\') {
      return this.parseEscape();
    }

    this.pos++;
    return this.charFragment((c) => c === ch);
  }

  private charFragment(matches: (ch: string) => boolean): Fragment {
    const state = { kind: 'char' as const, matches, out: -1 };
    const id = this.addState(state);
    return {
      start: id,
      outs: [
        (target) => {
          state.out = target;
        },
      ],
    };
  }

  private parseEscape(): Fragment {
    this.pos++; // skip '\'
    if (this.pos >= this.pattern.length) {
      throw new Error('Trailing backslash in regex pattern');
    }
    const esc = this.pattern[this.pos++];

    if (esc >= '1' && esc <= '9') {
      throw new Error('Backreferences are not supported in safe regex');
    }
    if (esc === 'k') {
      throw new Error('Backreferences are not supported in safe regex');
    }
    if (esc === 'b' || esc === 'B') {
      throw new Error('Word boundary assertions are not supported in safe regex');
    }
    if (esc === 'c' || esc === 'p' || esc === 'P') {
      throw new Error(`Unsupported escape sequence "\\${esc}" in safe regex`);
    }
    if (esc === '0') {
      if (
        this.pos < this.pattern.length &&
        this.pattern[this.pos] >= '0' &&
        this.pattern[this.pos] <= '9'
      ) {
        throw new Error('Octal escapes are not supported in safe regex');
      }
      return this.charFragment((c) => c === '\0');
    }

    switch (esc) {
      case 'd':
        return this.charFragment(isDigitChar);
      case 'D':
        return this.charFragment((c) => !isDigitChar(c));
      case 'w':
        return this.charFragment(isWordChar);
      case 'W':
        return this.charFragment((c) => !isWordChar(c));
      case 's':
        return this.charFragment(isSpaceChar);
      case 'S':
        return this.charFragment((c) => !isSpaceChar(c));
      case 'n':
        return this.charFragment((c) => c === '\n');
      case 'r':
        return this.charFragment((c) => c === '\r');
      case 't':
        return this.charFragment((c) => c === '\t');
      case 'f':
        return this.charFragment((c) => c === '\f');
      case 'v':
        return this.charFragment((c) => c === '\v');
      case 'x': {
        const hex = this.pattern.slice(this.pos, this.pos + 2);
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
          throw new Error('Invalid \\x escape in regex pattern');
        }
        this.pos += 2;
        const target = String.fromCharCode(parseInt(hex, 16));
        return this.charFragment((c) => c === target);
      }
      case 'u': {
        const hex = this.pattern.slice(this.pos, this.pos + 4);
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
          throw new Error('Invalid \\u escape in regex pattern');
        }
        this.pos += 4;
        const target = String.fromCharCode(parseInt(hex, 16));
        return this.charFragment((c) => c === target);
      }
      default:
        return this.charFragment((c) => c === esc);
    }
  }

  private parseCharClass(): Fragment {
    this.pos++; // skip '['
    let negated = false;
    if (this.pos < this.pattern.length && this.pattern[this.pos] === '^') {
      negated = true;
      this.pos++;
    }

    const matchers: Array<(ch: string) => boolean> = [];

    const readClassAtom = (): { char?: string; matcher?: (ch: string) => boolean } => {
      const c = this.pattern[this.pos++];
      if (c === '\\') {
        if (this.pos >= this.pattern.length) {
          throw new Error('Unterminated character class');
        }
        const esc = this.pattern[this.pos++];
        if (esc >= '1' && esc <= '9') {
          throw new Error('Octal escapes are not supported in safe regex');
        }
        switch (esc) {
          case 'd':
            return { matcher: isDigitChar };
          case 'D':
            return { matcher: (ch) => !isDigitChar(ch) };
          case 'w':
            return { matcher: isWordChar };
          case 'W':
            return { matcher: (ch) => !isWordChar(ch) };
          case 's':
            return { matcher: isSpaceChar };
          case 'S':
            return { matcher: (ch) => !isSpaceChar(ch) };
          case 'b':
            return { char: '\b' };
          case 'n':
            return { char: '\n' };
          case 'r':
            return { char: '\r' };
          case 't':
            return { char: '\t' };
          case 'f':
            return { char: '\f' };
          case 'v':
            return { char: '\v' };
          case '0':
            if (
              this.pos < this.pattern.length &&
              this.pattern[this.pos] >= '0' &&
              this.pattern[this.pos] <= '9'
            ) {
              throw new Error('Octal escapes are not supported in safe regex');
            }
            return { char: '\0' };
          case 'c':
          case 'p':
          case 'P':
          case 'k':
          case 'B':
            throw new Error(`Unsupported escape sequence "\\${esc}" in character class`);
          case 'x': {
            const hex = this.pattern.slice(this.pos, this.pos + 2);
            if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
              throw new Error('Invalid \\x escape in character class');
            }
            this.pos += 2;
            return { char: String.fromCharCode(parseInt(hex, 16)) };
          }
          case 'u': {
            const hex = this.pattern.slice(this.pos, this.pos + 4);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
              throw new Error('Invalid \\u escape in character class');
            }
            this.pos += 4;
            return { char: String.fromCharCode(parseInt(hex, 16)) };
          }
          default:
            return { char: esc };
        }
      }
      return { char: c };
    };

    while (this.pos < this.pattern.length && this.pattern[this.pos] !== ']') {
      const first = readClassAtom();
      if (
        this.pos + 1 < this.pattern.length &&
        this.pattern[this.pos] === '-' &&
        this.pattern[this.pos + 1] !== ']'
      ) {
        this.pos++; // skip '-'
        const second = readClassAtom();
        if (first.char === undefined || second.char === undefined) {
          throw new Error('Invalid character class range');
        }
        const startCode = first.char.charCodeAt(0);
        const endCode = second.char.charCodeAt(0);
        if (startCode > endCode) {
          throw new Error(`Invalid character range ${first.char}-${second.char}`);
        }
        matchers.push((ch) => {
          const code = ch.charCodeAt(0);
          return code >= startCode && code <= endCode;
        });
      } else if (first.matcher) {
        matchers.push(first.matcher);
      } else {
        const target = first.char!;
        matchers.push((ch) => ch === target);
      }
    }

    if (this.pos >= this.pattern.length || this.pattern[this.pos] !== ']') {
      throw new Error('Unterminated character class "["');
    }
    this.pos++; // skip ']'

    return this.charFragment((ch) => {
      const matched = matchers.some((fn) => fn(ch));
      return negated ? !matched : matched;
    });
  }
}

export function compileSafeRegex(pattern: string): SafeRegexCompileResult {
  if (typeof pattern !== 'string') {
    return { ok: false, error: 'JSON Schema "pattern" must be a string' };
  }
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return {
      ok: false,
      error: `JSON Schema "pattern" exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH}`,
    };
  }
  try {
    const compiler = new RegexCompiler(pattern);
    return { ok: true, regex: compiler.compile() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid regular expression pattern',
    };
  }
}

export function validateRegexPattern(pattern: unknown): string | null {
  if (typeof pattern !== 'string') {
    return 'JSON Schema "pattern" must be a string';
  }
  const compiled = compileSafeRegex(pattern);
  return compiled.ok ? null : compiled.error;
}
