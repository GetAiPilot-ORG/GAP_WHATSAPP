const promotional = /\b(discount|offer|sale|deal|promo|coupon|cashback|free|limited time|buy now|save|exclusive|hurry)\b/i
const authentication = /\b(otp|verification code|login code|security code|passcode)\b/i
export const placeholderCopy = /\b(test(?:ing)?|dummy|ignore(?:\s+it)?|sample\s*(?:message|template)?|lorem ipsum)\b/i

export function suggestTemplateCategory(text) {
    if (authentication.test(text)) return 'AUTHENTICATION'
    if (promotional.test(text)) return 'MARKETING'
    return null
}
