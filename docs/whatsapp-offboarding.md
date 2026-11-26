# WhatsApp provider switching and offboarding

## User flow

1. Open WhatsApp accounts and select **Switch or disconnect** for the number. Workspace owners and admins can also open the offboarding page from the expired-plan screen.
2. Choose **Switch provider** or **Disconnect GetAIPilot**. Select Meta Messaging Accounts, legacy WhatsApp Business API, or Business App Coexistence. The page explains how to identify the setup if it is unknown.
3. Download chat history as JSON if needed and review templates and billing. The export includes stored message data and media references. Template approval and balance portability depend on the provider.
4. For a routing-compatible switch, connect the new provider, set it as the primary responder, and test both directions before disconnecting. If the provider requires removal first, schedule downtime. For legacy API use the incoming provider's migration steps. For Coexistence confirm the provider's switching steps and back up chats.
5. Disconnect GetAIPilot. This clears local send credentials, blocks new messages through this integration, and starts cancellation of active and scheduled broadcasts. Already submitted messages can still be delivered.
6. Use the Meta-side steps for the selected account type. Check the scope of shared partner access before removing it. Keep the phone number and business account during a provider switch.
7. Record the workspace admin's confirmation. The screen shows **Meta action pending** until confirmation, and labels the completed status as admin-confirmed. The product does not infer Meta partner removal from local credential deletion or webhook status.

## Deployment and acceptance

Apply the Supabase migration before deploying the backend and broadcast worker. Deploy the frontend with the updated API. Queue-mode recipients in cancelling campaigns are reconciled by the broadcast worker using the existing wallet release procedure.

In staging, use a Meta test business and a test WhatsApp number.

- Verify that an agent cannot list offboarding records, export history, disconnect, or record removal. Verify that an expired-plan workspace owner can perform these operations.
- Verify that disconnect preserves history, removes the number from account pickers, and blocks inbound processing and outbound sends. Repeated disconnects should preserve the original pending or confirmed state.
- Schedule a broadcast and queue another before disconnecting. Verify that neither sends afterward and that unused queue reservations are released.
- Try disconnecting one of two numbers that share a Meta account. Review the removal scope with the Meta admin before changing partner access.
- Complete each supported provider's Meta removal steps with a test number. Confirm the status only after checking the integration in Meta or the Business App. Send and receive a test message with the incoming provider.
- Reconnect in the same workspace and verify that a fresh connection clears the previous offboarding state. For a move to a different GetAIPilot workspace, use support to resolve the retained account history before reconnecting.
