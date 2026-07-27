import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichTemplateExamplesWithRealisticSamples, validateWhatsappTemplatePayload } from './whatsapp.js';

test('blocks placeholder copy and vague utility templates', () => {
    const result = validateWhatsappTemplatePayload({
        name: 'test_template',
        category: 'UTILITY',
        language: 'en_US',
        components: [{ type: 'BODY', text: 'hello this is for testing only ignore it' }],
    });
    assert.equal(result.canSubmit, false);
    assert.ok(result.issues.some(issue => issue.code === 'PLACEHOLDER_COPY'));
    assert.ok(result.issues.some(issue => issue.code === 'UTILITY_CONTEXT_REQUIRED'));
});

test('preserves realistic samples supplied by the user', () => {
    const components = [{
        type: 'BODY',
        text: 'Hi {{1}}, order {{2}} is confirmed.',
        example: { body_text: [['Priya', 'ORD-10834']] },
    }];
    enrichTemplateExamplesWithRealisticSamples(components);
    assert.deepEqual(components[0].example.body_text[0], ['Priya', 'ORD-10834']);
});
