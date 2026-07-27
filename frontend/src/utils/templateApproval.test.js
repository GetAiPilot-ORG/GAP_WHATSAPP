import assert from 'node:assert/strict'
import test from 'node:test'
import { placeholderCopy, suggestTemplateCategory } from './templateApproval.js'

test('flags risky placeholder copy and recommends clear categories', () => {
    assert.equal(placeholderCopy.test('testing only ignore it'), true)
    assert.equal(suggestTemplateCategory('Use code SAVE20 for this limited time offer'), 'MARKETING')
    assert.equal(suggestTemplateCategory('Your verification code is {{1}}'), 'AUTHENTICATION')
})
