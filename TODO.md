# LBC Collection Confirmation

## Done
- [x] Persist assignees in tenant_meta + API (`/api/lbc-tracking/collection-assignees`)
- [x] Confirm API: head admins + assigned employees only
- [x] Admin assign modal saves to server (head admins only)
- [x] Admin confirm UI allows head admins + assignees
- [x] Employee dashboard shows LBC Collection Confirmation only when current user is assigned
- [x] Employee dashboard opens confirmation via modal (not admin page redirect)

## Verify manually
- [ ] Head admin assigns employee(s) from LBC Collection Confirmation tab
- [ ] Assigned employee sees card + badge on employee dashboard and can confirm via modal
- [ ] Unassigned employee does not see the card and gets 403 on confirm API
- [ ] Employee with only LBC Tracking (not assigned) can view collection panel but cannot confirm
