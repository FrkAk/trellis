import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOAuthClientName } from './oauth-client-name';

test('formats supported OAuth client brand names consistently', () => {
  assert.equal(formatOAuthClientName('Codex'), 'Codex');
  assert.equal(formatOAuthClientName('Claude Code (plugin:mymir:mymir)'), 'Claude Code');
  assert.equal(formatOAuthClientName('Cursor'), 'Cursor');
  assert.equal(formatOAuthClientName('Gemini CLI'), 'Gemini');
});

test('keeps unknown OAuth client names while removing plugin metadata', () => {
  assert.equal(formatOAuthClientName('Acme Agent (plugin:acme:agent)'), 'Acme Agent');
  assert.equal(formatOAuthClientName('Custom Client'), 'Custom Client');
});
