# wb.whatsapp User Onboarding Guide Plan

## 1. Objective

Create a friendly, guided onboarding experience that helps a new user understand:

1. What to do next.
2. Why each step matters.
3. Whether the step was completed successfully.
4. How close they are to sending their first real WhatsApp message.

The platform already contains page tours, Meta rules, and a basic first-time setup section. The missing piece is a single, state-aware journey connecting these elements.

## 2. First Landing Experience

When a new administrator first opens wb.whatsapp, show a short welcome screen:

> Welcome to wb.whatsapp  
> Let's connect your WhatsApp Business account and send your first message. This usually takes 5–10 minutes.

Ask what the user wants to achieve:

- Manage customer chats
- Send broadcasts
- Automate replies with AI
- Explore the platform

The selected goal should change the recommended steps without hiding other features.

Provide two actions:

- `Start setup`
- `Explore on my own`

The introduction must be dismissible and must not block access to the platform.

## 3. Persistent Setup Checklist

Replace the current static **First-Time Setup** cards with a live checklist.

### Recommended Checklist

| Step | User action | Completion check |
|---|---|---|
| 1 | Connect WhatsApp | An active WABA and phone number exist |
| 2 | Verify connection | Connection and send-readiness checks pass |
| 3 | Set up billing | Wallet or eligible plan is active |
| 4 | Add an approved template | At least one usable approved template exists |
| 5 | Add contacts | At least one valid, opted-in contact exists |
| 6 | Send a test message | A successful test message is recorded |
| 7 | Launch the first workflow | A chat, broadcast, flow, or AI agent is used |

Each step should display one of these states:

- `Not started`
- `In progress`
- `Waiting for Meta`
- `Action required`
- `Completed`
- `Optional`

The dashboard should always show one primary next action, for example:

> Continue setup: Add your first template

Avoid displaying multiple competing primary actions.

## 4. Guided User Journey

### Step 1: Connect WhatsApp

Send the user to the existing Meta Embedded Signup flow.

Before opening Meta, display a compact preparation panel:

- You must have access to the correct Meta Business Portfolio.
- Use the portfolio containing your WhatsApp Business Account.
- Keep your business information ready.
- A phone number can belong to only one WhatsApp setup at a time.

After connection, display:

- Connected business portfolio
- WABA name and ID
- Phone number
- Display name
- Verification status
- Messaging status

Provide `Change account` and `Run connection check` actions.

### Step 2: Verify the Connection

Run automatic checks instead of asking the user to inspect identifiers manually:

- Access token works.
- WABA is accessible.
- Phone number belongs to the selected WABA.
- Webhook is connected.
- Required permissions exist.
- Account can create templates.
- Account can send messages.

Show clear recovery messages, for example:

> Your account is connected, but template-management permission is missing. Reconnect Meta and approve the requested permission.

Never use an unexplained API error as the primary user-facing message.

### Step 3: Explain Billing

Explain billing when the user reaches an action that may incur charges.

Show:

- Current wallet balance
- What the wallet is used for
- Estimated cost before a broadcast
- Link to billing history
- `Add balance` action

Do not present billing as a requirement for reading incoming messages unless the platform actually enforces that requirement.

### Step 4: Create the First Template

Offer two paths:

- `Use an official template` — recommended
- `Create my own template`

For the official template library:

- Show available templates first.
- Keep unavailable templates visible only behind an `Unavailable` filter.
- Explain the exact Meta restriction or required capability.
- Disable the add and use actions for unavailable templates.
- Display the approval state: Draft, In review, Approved, Rejected, or Paused.

Authentication templates must use Meta's dedicated OTP creation model rather than the regular utility-template flow.

After submission, display:

> Template submitted successfully. Meta is reviewing it. You can continue setting up contacts while you wait.

### Step 5: Add Contacts

Offer the following options:

- Add one contact
- Import CSV
- Download example CSV

Before importing, explain:

- Include the country code.
- Do not use spaces or local-only phone formats.
- Upload only contacts who consented to receive messages.
- Duplicate contacts will be identified.

After import, show a result summary:

- Imported
- Updated
- Skipped
- Invalid
- Download errors

### Step 6: Send a Test Message

Provide a safe guided action separate from full broadcast creation.

Ask the user to select:

- Connected WhatsApp number
- Approved template
- Test recipient
- Template variable values

Before sending, show a preview and estimated wallet cost.

After sending, report the current state:

- Sent
- Delivered
- Read
- Failed, with a recovery action

### Step 7: Choose the Next Workflow

After the test succeeds, offer goal-based next actions:

- Open Live Inbox
- Create a Broadcast
- Set up an AI Agent
- Build an Automation Flow
- Invite Team Members

This completes onboarding, but the checklist should remain available through **Help → Setup guide**.

## 5. Goal-Based Paths

The setup guide should adjust its recommended order based on the user's selected goal.

### Manage Customer Chats

1. Connect WhatsApp.
2. Verify the connection and webhook.
3. Receive a test customer message.
4. Reply from Live Inbox.
5. Optionally invite a team member.

### Send Broadcasts

1. Connect WhatsApp.
2. Verify send readiness.
3. Set up billing.
4. Add an approved template.
5. Import opted-in contacts.
6. Send a test message.
7. Create the first broadcast.

### Automate Replies

1. Connect WhatsApp.
2. Verify inbound-message delivery.
3. Create an AI agent or automation flow.
4. Add knowledge and handoff rules.
5. Test the automation.
6. Publish it.

## 6. Improve the Existing Tours

The project already has page-level tours and `data-tour` hooks. Keep these features, but give each guidance layer a clear role:

- The setup checklist guides the overall journey.
- Page tours explain the current screen.
- Inline callouts explain Meta rules when they matter.
- The Help Center contains detailed reference material.

Tour behavior should follow these rules:

- Automatically show only the initial welcome experience.
- Offer `Show me around` on individual pages.
- Remember completed and dismissed tours.
- Allow users to restart tours from Help.
- Allow tours to be paused or skipped.
- Do not launch a long tour every time a page opens.
- Use one consistent language, or make the language selectable. The current mixed Hindi and English tour text should be standardized.

## 7. Present Meta Rules Contextually

Do not show a large wall of Meta rules during onboarding. Display rules when they affect the user's current action.

Examples:

- **Contacts:** Explain consent and phone-number formatting.
- **Templates:** Explain approval states and unavailable categories.
- **Live Chat:** Explain the 24-hour messaging window.
- **Broadcasts:** Explain the approved-template requirement.
- **Authentication:** Explain Meta's OTP-template model.
- **Payment templates:** Explain WhatsApp Payments eligibility.

Every rule callout should contain:

- A one-sentence rule
- Why it affects the action
- What the user should do
- A `Learn more` link

## 8. Account and Role Awareness

### Active Account Handling

Onboarding must always use the currently selected WhatsApp account.

When the user switches WABA or phone number:

- Recalculate setup progress.
- Update template, contact, billing, and send-readiness checks.
- Clearly display the active account throughout the guide.
- Never use a hardcoded WABA, portfolio, or phone-number ID.

### Role-Based Guidance

- Administrators see business setup, account connection, billing, templates, and team management.
- Agents see inbox, customer handling, conversation assignment, and reply guidance.
- Restricted users must not be instructed to perform actions they cannot access.

## 9. Onboarding State and Backend Design

Most completion states should be derived from live platform data instead of manually stored flags.

Examples of derived state:

- Connected account exists.
- Connection-health checks pass.
- Approved template exists.
- Valid contact exists.
- Wallet is ready.
- Successful message exists.
- Broadcast, agent, or flow exists.

Only store onboarding preferences such as:

- Selected goal
- Welcome dismissed
- Optional steps skipped
- Tours completed
- Onboarding completed
- Last active step

A suggested endpoint is:

```text
GET /api/onboarding/status?wa_account_id=...
```

It should return:

- Active WhatsApp account
- Overall progress
- Checklist steps
- State of each step
- Blocking reason
- Recovery action
- Recommended next action and destination

## 10. Implementation Phases

### Phase 1: Core Onboarding — Completed

- [x] Replace static first-run cards with a live checklist.
- [x] Derive progress from actual platform data.
- [x] Add one `Continue setup` action.
- [x] Add connection diagnostics.
- [x] Preserve the selected WABA context.
- [x] Add dismiss and resume behavior.

Implementation note: setup completion is derived from connected-account status, live Meta diagnostics, wallet balance, approved templates, contacts, message activity, campaigns, and published flows. Only the per-user/per-account dismissed preference is stored locally.

### Phase 2: First-Success Workflow — Completed

- [x] Add guided official-template selection.
- [x] Add contact-import guidance.
- [x] Add the test-message flow.
- [x] Add template approval and message-delivery feedback.
- [x] Provide recovery actions for failed steps.

Implementation note: the setup guide deep-links users into the existing official template library and contact importer. The first-message action opens Live Chat in onboarding mode, where the WhatsApp messaging guide explains free-form and approved-template sending. Existing template and message status interfaces provide approval and delivery feedback.

### Phase 3: Contextual Education — Completed

- [x] Refine the existing page tours.
- [x] Standardize tour language.
- [x] Move Meta rules into contextual callouts.
- [x] Connect error states to recovery actions.
- [x] Improve Help Center links.

Implementation note: page tours remain optional, use consistent English, and are available from the Help menu. The setup guide and existing WhatsApp rules modal surface relevant requirements at connection, template, contact, chat, billing, and broadcast actions. Tour history controls now live in Help Center.

### Phase 4: Goal and Role Personalization — Completed

- [x] Personalize onboarding for Chats, Broadcasts, and Automation.
- [x] Add role-specific onboarding.
- [x] Add onboarding analytics.
- [x] Measure abandonment and completion at each step.

Implementation note: owners choose a Chats, Broadcasts, or AI Automation goal during the dismissible welcome experience and can change it from the checklist. Non-owner users keep role-appropriate inbox guidance without administrative setup actions. Onboarding events are stored in `w_onboarding_events` through an authenticated, row-level-security-protected analytics table.

## 11. Analytics

Track enough information to improve onboarding without storing sensitive message content.

Recommended events:

- `onboarding_started`
- `onboarding_goal_selected`
- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_step_failed`
- `onboarding_step_skipped`
- `onboarding_resumed`
- `onboarding_completed`
- `page_tour_started`
- `page_tour_completed`

Useful measurements:

- Time to connect the first WhatsApp account
- Time to create the first usable template
- Time to send the first successful message
- Completion rate for each setup step
- Most common connection and sending failures
- Onboarding completion by selected goal and user role

## 12. Accessibility and Mobile Requirements

- The entire checklist must work on desktop and mobile.
- Keyboard users must be able to access and dismiss every prompt.
- Focus must move correctly when a dialog or tour step opens.
- Do not communicate state using color alone.
- Buttons and badges must have accessible labels.
- Tours must remain readable without covering their target controls.
- Reduced-motion preferences should be respected.

## 13. Acceptance Criteria

The onboarding experience is ready when:

- A new administrator always sees one obvious next action.
- Progress reflects actual backend state.
- Switching WhatsApp accounts recalculates progress.
- No hardcoded Meta identifiers are used.
- Users can dismiss, skip, and resume the guide.
- Unavailable templates cannot be selected or created.
- Pending Meta review does not unnecessarily block later setup steps.
- Every failure provides a clear recovery action.
- Restricted users never receive inaccessible instructions.
- Completed onboarding no longer dominates the dashboard.
- The guide works on mobile and desktop.
- Existing page tours remain available from Help.

## 14. Recommended Final Experience

The final system should feel like a setup assistant rather than a documentation page:

1. Welcome the user and ask their goal.
2. Show a live checklist based on real account state.
3. Lead the user to one next action at a time.
4. Explain Meta rules only when relevant.
5. Confirm every successful action.
6. Provide an exact recovery path when something fails.
7. Finish with the user's first successful message or workflow.

This structure converts the existing instructions, rules, and page tours into one coherent onboarding journey while preserving the platform's current functionality.
