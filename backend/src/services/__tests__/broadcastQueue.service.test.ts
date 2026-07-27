import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMetaError, renderRecipientPayload } from '../broadcastQueue.service.js';

test('renders a frozen personalized template payload', () => {
    const rendered = renderRecipientPayload({
        template_name: 'welcome',
        template_language: 'en_US',
        variable_mapping: {
            _template_body: 'Hello {{name}} at {{1}}',
            _template_variables: ['name', '1'],
            name: 'name',
            1: 'GetAIPilot',
        },
    }, {
        name: 'Asha',
        phone: '919999999999',
    }, '919999999999');

    assert.equal(rendered.renderedText, 'Hello Asha at GetAIPilot');
    assert.equal(rendered.payload.to, '919999999999');
    assert.deepEqual(rendered.frozenVariables, { name: 'Asha', 1: 'GetAIPilot' });
    assert.equal(rendered.payload.template.components[0].parameters.length, 2);
});

test('maps contact email and custom fields into template variables', () => {
    const rendered = renderRecipientPayload({
        template_name: 'crowdfunding',
        template_language: 'en_US',
        variable_mapping: {
            _template_body: 'Hello {{1}}, event {{2}}, contact {{3}}',
            _template_variables: ['1', '2', '3'],
            1: 'name',
            2: 'field:campaign_date',
            3: 'email',
        },
    }, {
        name: 'John',
        email: 'john@example.com',
        custom_fields: { campaign_date: 'June 25th' },
    }, '919999999999');

    assert.equal(rendered.renderedText, 'Hello John, event June 25th, contact john@example.com');
    assert.deepEqual(rendered.frozenVariables, {
        1: 'John',
        2: 'June 25th',
        3: 'john@example.com',
    });
});

test('classifies throttling and server errors as retryable', () => {
    assert.equal(classifyMetaError(429, { error: { code: 4, message: 'Rate limited' } }).retryable, true);
    assert.equal(classifyMetaError(503, { error: { message: 'Unavailable' } }).retryable, true);
});

test('classifies invalid template requests as permanent', () => {
    const failure = classifyMetaError(400, { error: { code: 132001, message: 'Template not found' } });
    assert.equal(failure.retryable, false);
    assert.equal(failure.errorClass, 'permanent');
});
