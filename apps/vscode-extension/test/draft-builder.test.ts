import { describe, expect, it } from 'vitest';
import type { DiscoveryGroup } from '@mockflow/api-discovery';
import {
  buildApiDefinitionDraft,
  createDraftFromDiscovery,
  detectApiConflict,
  parseAndValidateScenarioInput,
} from '../src/draft-builder.js';

describe('Phase 6 draft builder, suggestions, and conflict detection', () => {
  it('converts static POST discovery with JSON body hint into labeled draft & schema suggestion', () => {
    const group: DiscoveryGroup = {
      id: 'POST:/api/orders',
      method: 'POST',
      path: '/api/orders/',
      certainty: 'static',
      warnings: [],
      discoveries: [
        {
          id: 'd1',
          method: 'POST',
          path: '/api/orders',
          client: 'fetch',
          certainty: 'static',
          warnings: [],
          bodyHint: 'JSON body',
          source: { file: 'src/orders.ts', line: 12, column: 3 },
        },
      ],
    };

    const draft = createDraftFromDiscovery(group);
    expect(draft.method).toBe('POST');
    expect(draft.path).toBe('/api/orders');
    expect(draft.description).toContain('src/orders.ts:12');
    expect(draft.suggestedScenario.inferred).toBe(true);
    expect(draft.suggestedScenario.suggestionLabel).toContain('Suggested');
    expect(draft.suggestedScenario.statusCode).toBe(201);
    expect(draft.requestSchemaSuggestion).toMatchObject({
      inferred: true,
      value: { type: 'object', additionalProperties: true },
    });
  });

  it('marks uncertain or unsupported discoveries without guessing paths', () => {
    const dynamicGroup: DiscoveryGroup = {
      id: 'HEAD:dynamic',
      method: 'HEAD',
      path: undefined,
      certainty: 'uncertain',
      warnings: ['URL is dynamic and could not be resolved statically.'],
      discoveries: [],
    };

    const draft = createDraftFromDiscovery(dynamicGroup);
    expect(draft.method).toBeNull();
    expect(draft.path).toBeNull();
    expect(draft.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('detects method and normalized path conflicts', () => {
    const existing = [
      { id: 'a1', name: 'List', method: 'GET', path: '/users', isPublished: true },
      { id: 'a2', name: 'Create', method: 'POST', path: '/users', isPublished: false },
    ];

    expect(detectApiConflict({ method: 'get', path: '/users/' }, existing)?.id).toBe('a1');
    expect(detectApiConflict({ method: 'DELETE', path: '/users' }, existing)).toBeUndefined();
    expect(detectApiConflict({ method: 'GET', path: '/users' }, existing, 'a1')).toBeUndefined();
  });

  it('validates draft and scenario inputs using shared @mockflow/contracts rules', () => {
    expect(buildApiDefinitionDraft({ name: 'Bad', method: 'HEAD', path: '/ok' })).toMatchObject({
      ok: false,
    });

    expect(
      buildApiDefinitionDraft({
        name: 'Unsafe',
        method: 'POST',
        path: '/ok',
        requestSchema: { patternProperties: {} },
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseAndValidateScenarioInput({
        name: 'Bad204',
        statusCode: 204,
        bodyJson: '{"data":true}',
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseAndValidateScenarioInput({
        name: 'HopByHop',
        statusCode: 200,
        headersJson: '{"connection":"keep-alive"}',
        bodyJson: '{"ok":true}',
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseAndValidateScenarioInput({
        name: 'Valid',
        statusCode: 200,
        headersJson: '{"x-mock":"true"}',
        bodyJson: '{"ok":true}',
        delayMs: 50,
      }),
    ).toMatchObject({
      ok: true,
      scenario: { statusCode: 200, headers: { 'x-mock': 'true' }, body: { ok: true }, delayMs: 50 },
    });
  });
});
