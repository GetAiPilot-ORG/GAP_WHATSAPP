# Testing & Quality Assurance

## 1. Testing Frameworks & Setup

### Test Runners
- **Node.js Native Test Runner (`node:test`)**: Used across unit tests with `node:assert/strict` for zero-overhead assertions without external test framework bloat (Jest/Mocha).
- **TypeScript Test Execution (`tsx --test`)**: Enables direct execution of TypeScript test files without a separate pre-compilation step.

---

## 2. Existing Test Suites

### Backend Test Files
| File Path | Area Tested | Key Assertions |
|---|---|---|
| `backend/src/services/__tests__/broadcastQueue.service.test.ts` | Broadcast queue logic | Job scheduling, window size calculation, recipient status transitions, BullMQ job payload formatting |
| `backend/src/services/__tests__/metaSubscription.service.test.ts` | Meta Subscription service | Webhook subscription registration, app verification |
| `backend/src/services/billing.service.test.ts` | Billing & Plan Limits | Plan rank normalization, feature gating for WhatsApp plans |
| `backend/src/controllers/whatsapp.controller.test.ts` | WhatsApp controller utilities | Status mapping, template creation request validation |
| `backend/src/utils/templateBuilder.test.ts` | Template Builder | Component serialization for Meta Graph API compliance |
| `backend/src/utils/whatsapp.test.ts` | Phone normalization | Indian phone key normalization, contact type detection |

### Frontend Test Files
| File Path | Area Tested | Key Assertions |
|---|---|---|
| `frontend/src/utils/templateApproval.test.js` | Template approval hints | Recommends categories (`MARKETING`, `AUTHENTICATION`) and flags placeholder copy |
| `frontend/src/utils/messagingLimits.test.js` | Meta tier formatting | Formats tier limits (Tier 1K, 10K, 100K, Unlimited) |
| `frontend/src/utils/templateReview.test.js` | Template review utility | Identifies overdue testing templates and provides review hints |

---

## 3. Test & Build Commands

### Backend Commands
```bash
# Run TypeScript compilation check
npm run build --prefix backend

# Run broadcast queue unit tests (requires tsx / node_modules)
npm run test:broadcast --prefix backend

# Execute all backend tests with node test runner
node --test backend/src/**/*.test.ts
```

### Frontend Commands
```bash
# Run ESLint check
npm run lint --prefix frontend

# Run production Vite build
npm run build --prefix frontend

# Run frontend unit tests
node --test frontend/src/utils/*.test.js
```

---

## 4. Testing Gaps & Coverage Analysis

1. **Local Dependency Installation**:
   - `node_modules` are not committed to git; dependencies must be installed via `npm install` in both `backend` and `frontend` before running `tsx` or `vite` commands.
2. **Frontend Test Suite Breadth**:
   - Current frontend tests only cover isolated utility functions (`templateApproval`, `messagingLimits`, `templateReview`).
   - Component rendering and hook integration tests (e.g. `FlowBuilder`, `LiveChat`, `WhatsAppConnect`) are not currently covered with automated DOM testing (e.g., React Testing Library / Vitest).
3. **Integration & Mocking Strategy**:
   - Supabase client (`supabase-js`) is imported as a singleton across services; unit tests mock Supabase database queries using function spies or mocked response objects.
   - Meta Graph API network calls in `meta.service.ts` require mock fetch interceptors in automated CI pipelines to prevent hitting live Meta endpoints.
4. **Known Test Assertion Note**:
   - `frontend/src/utils/messagingLimits.test.js` contains an assertion expecting `'Unavailable'` on uninitialized tiers where the utility returns `'2,000'` (default tier allowance).
