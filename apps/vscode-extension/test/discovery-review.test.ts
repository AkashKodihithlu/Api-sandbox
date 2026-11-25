import { describe, expect, it } from 'vitest';
import { DiscoveryReviewService } from '../src/discovery-review.js';

describe('DiscoveryReviewService', () => {
  it('keeps reviewed discoveries local and hides ignored groups', async () => {
    const scannedRoots: string[] = [];
    const review = new DiscoveryReviewService(async (root) => {
      scannedRoots.push(root);
      return [{ id: 'GET:/users', method: 'GET', path: '/users', certainty: 'static', warnings: [], discoveries: [] }];
    });

    await review.scan('/workspace');
    review.ignore('GET:/users');

    expect(scannedRoots).toEqual(['/workspace']);
    expect(review.visibleGroups()).toEqual([]);
  });
});
