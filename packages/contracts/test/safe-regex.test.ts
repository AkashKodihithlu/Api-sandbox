import { describe, expect, it } from 'vitest';
import { compileSafeRegex, validateRegexPattern } from '../src/safe-regex.js';

function matches(pattern: string, input: string): boolean {
  const compiled = compileSafeRegex(pattern);
  if (!compiled.ok) {
    throw new Error(`Expected pattern "${pattern}" to compile, got: ${compiled.error}`);
  }
  return compiled.regex.test(input).matched;
}

describe('safe-regex Thompson NFA', () => {
  describe('Character class semantics', () => {
    it('handles mixed ranges and class escapes like [a-z\\d] and negated [^a-z]', () => {
      expect(matches('^[a-z\\d]+$', 'abc123')).toBe(true);
      expect(matches('^[a-z\\d]+$', 'abc_123')).toBe(false);
      expect(matches('^[^a-z]+$', '123!')).toBe(true);
      expect(matches('^[^a-z]+$', '12a3')).toBe(false);
    });

    it('handles leading, trailing, and escaped hyphens in character classes', () => {
      expect(matches('^[a-]+$', 'a-a')).toBe(true);
      expect(matches('^[a-]+$', 'ab')).toBe(false);
      expect(matches('^[-a]+$', '-a-')).toBe(true);
      expect(matches('^[a\\-z]+$', 'a-z')).toBe(true);
      expect(matches('^[a\\-z]+$', 'b')).toBe(false);
    });

    it('treats [\\b] as backspace (U+0008), not literal "b"', () => {
      expect(matches('^[\\b]$', '\b')).toBe(true);
      expect(matches('^[\\b]$', 'b')).toBe(false);
    });

    it('handles empty [] and negated-empty [^] character classes', () => {
      expect(matches('^[]$', '')).toBe(false);
      expect(matches('^[]$', 'a')).toBe(false);
      expect(matches('^[^]$', 'a')).toBe(true);
      expect(matches('^[^]$', '\n')).toBe(true);
      expect(matches('^[^]$', '')).toBe(false);
    });

    it('rejects malformed and invalid character class ranges', () => {
      expect(validateRegexPattern('[z-a]')).not.toBeNull();
      expect(validateRegexPattern('[a-\\d]')).not.toBeNull();
      expect(validateRegexPattern('[a-\\s]')).not.toBeNull();
      expect(validateRegexPattern('[\\d-a]')).not.toBeNull();
      expect(validateRegexPattern('[\\s-z]')).not.toBeNull();
      expect(validateRegexPattern('[a-z')).not.toBeNull();

      // Trailing/leading hyphen alongside matcher escapes remains valid literal '-'
      expect(matches('^[\\d-]+$', '1-2')).toBe(true);
      expect(matches('^[-\\d]+$', '-12')).toBe(true);
    });
  });

  describe('Escape semantics', () => {
    it('supports \\0 NUL, \\xHH, \\uHHHH, and escaped metacharacters', () => {
      expect(matches('^\\0$', '\0')).toBe(true);
      expect(matches('^\\0$', '0')).toBe(false);
      expect(matches('^[\\0]$', '\0')).toBe(true);
      expect(matches('^\\x41\\u0042$', 'AB')).toBe(true);
      expect(matches('^\\.\\^\\$\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\\\$', '.^$*+?()[]{}|\\')).toBe(
        true,
      );
    });

    it('explicitly rejects unsupported escapes (\\c, \\p, \\P, \\b, \\B, \\1, octal)', () => {
      for (const bad of [
        '\\cA',
        '\\p{L}',
        '\\P{L}',
        '\\bword',
        '\\B',
        '(a)\\1',
        '\\01',
        '[\\01]',
      ]) {
        expect(validateRegexPattern(bad)).not.toBeNull();
      }
      expect(validateRegexPattern('\\xZZ')).not.toBeNull();
      expect(validateRegexPattern('\\u123')).not.toBeNull();
    });
  });

  describe('Group syntax', () => {
    it('validates named groups and non-capturing groups, rejecting malformed groups', () => {
      expect(matches('^(?<user_1>[a-z]+)$', 'alice')).toBe(true);
      expect(matches('^(?:ab)+$', 'abab')).toBe(true);

      expect(validateRegexPattern('(?<123>a)')).not.toBeNull();
      expect(validateRegexPattern('(?<a b>a)')).not.toBeNull();
      expect(validateRegexPattern('(?<>a)')).not.toBeNull();
      expect(validateRegexPattern('(abc')).not.toBeNull();
      expect(validateRegexPattern('abc)')).not.toBeNull();
      expect(validateRegexPattern('(?=a)a')).not.toBeNull();
      expect(validateRegexPattern('(?!a)b')).not.toBeNull();
      expect(validateRegexPattern('(?<=a)b')).not.toBeNull();
      expect(validateRegexPattern('(?<!a)b')).not.toBeNull();
    });
  });

  describe('Anchors and quantifiers', () => {
    it('rejects quantifying anchors and malformed or consecutive quantifiers', () => {
      for (const bad of ['^*', '^+', '^?', '^{2}', '$*', '$+', '${1,2}']) {
        expect(validateRegexPattern(bad)).not.toBeNull();
      }
      for (const bad of ['*a', '+a', '?a', '{2}a', 'a**', 'a++', 'a+{2}', 'a{2}{3}', 'a{3,1}']) {
        expect(validateRegexPattern(bad)).not.toBeNull();
      }
      expect(validateRegexPattern('a{101}')).not.toBeNull();
    });

    it('supports bounded quantifiers {0}, {0,}, {1,}, {1,1}, {0,3}', () => {
      expect(matches('^a{0}b$', 'b')).toBe(true);
      expect(matches('^a{0}b$', 'ab')).toBe(false);
      expect(matches('^a{0,}$', '')).toBe(true);
      expect(matches('^a{0,}$', 'aaa')).toBe(true);
      expect(matches('^a{1,}$', '')).toBe(false);
      expect(matches('^a{1,}$', 'a')).toBe(true);
      expect(matches('^a{1,1}$', 'a')).toBe(true);
      expect(matches('^a{1,1}$', 'aa')).toBe(false);
      expect(matches('^a{0,3}$', '')).toBe(true);
      expect(matches('^a{0,3}$', 'aaa')).toBe(true);
      expect(matches('^a{0,3}$', 'aaaa')).toBe(false);
    });
  });

  describe('Matching semantics', () => {
    it('handles unanchored vs anchored, trailing newline with $, empty strings, zero-length, alternation, and lazy quantifiers', () => {
      expect(matches('foo', 'barfoobar')).toBe(true);
      expect(matches('^foo$', 'barfoobar')).toBe(false);
      expect(matches('foo$', 'foo')).toBe(true);
      expect(matches('foo$', 'foo\n')).toBe(false);
      expect(matches('^$', '')).toBe(true);
      expect(matches('^$', 'a')).toBe(false);
      expect(matches('a*', '')).toBe(true);
      expect(matches('a*', 'bbb')).toBe(true);
      expect(matches('^(foo|bar|)$', '')).toBe(true);
      expect(matches('^(foo|bar|)$', 'bar')).toBe(true);
      expect(matches('^a+?$|^b*?$', 'aaa')).toBe(true);
      expect(matches('^((ab)+)+$', 'ababab')).toBe(true);
    });
  });
});
