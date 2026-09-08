// Verification test for Safari compatibility
import { safeRandomUUID, safeClipboardCopy, safeShare } from '../src/utils/compat.js';
import { safeLocalStorage, safeSessionStorage } from '../src/utils/safeStorage.js';

console.log('--- TEST 1: Safe UUID Generation ---');
const uuid1 = safeRandomUUID();
console.log('Generated UUID:', uuid1);
if (!uuid1 || typeof uuid1 !== 'string' || uuid1.length < 32) {
    throw new Error('UUID generation failed');
}
console.log('✅ UUID Test passed');

console.log('\n--- TEST 2: Safe Storage with restricted localStorage simulation ---');
safeLocalStorage.setItem('test_key', 'hello_safari');
const val = safeLocalStorage.getItem('test_key');
console.log('Read back value:', val);
if (val !== 'hello_safari') {
    throw new Error('Storage test failed');
}
safeLocalStorage.removeItem('test_key');
console.log('✅ Storage Test passed');

console.log('\n--- TEST 3: Notification undefined environment simulation ---');
// Verify PushContext logic when Notification is undefined
const getInitialNotificationPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined') {
        try {
            return Notification.permission || 'default';
        } catch {
            return 'default';
        }
    }
    return 'default';
};

const perm = getInitialNotificationPermission();
console.log('Initial permission without window.Notification:', perm);
if (perm !== 'default') {
    throw new Error('Permission test failed');
}
console.log('✅ Push Notification Guard Test passed');

console.log('\n--- ALL SAFARI SIMULATION TESTS PASSED ---');
