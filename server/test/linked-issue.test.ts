import { describe, it, expect } from 'vitest';
import { parseLinkedIssueNumber } from '../src/adapters/github/linked-issue.js';

describe('parseLinkedIssueNumber', () => {
  it.each([
    ['#12', 12],
    ['Closes #7', 7],
    ['see #3 and #4', 3],
    ['no ref', null],
    ['', null],
    [null, null],
    [undefined, null],
  ] as const)('%j -> %j', (body, expected) => {
    expect(parseLinkedIssueNumber(body)).toBe(expected);
  });
});
