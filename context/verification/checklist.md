# Verification Checklist

## Before Completing a Feature

### Code Quality
- [ ] Code follows project conventions (see `conventions/patterns.md`)
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] API endpoints return proper error messages

### Testing
- [ ] Manual testing of happy path
- [ ] Edge cases considered
- [ ] Error states handled gracefully

### Documentation
- [ ] `replit.md` updated with changes
- [ ] Session file updated with decisions
- [ ] Any new patterns added to `context/conventions/`

### Session Management
- [ ] Session file reflects current state
- [ ] TODOs marked complete
- [ ] Blockers documented
- [ ] Ready for context reset handoff

## Before Deploying

- [ ] All features working as expected
- [ ] No placeholder/mock data in production paths
- [ ] Environment variables configured
- [ ] Error handling in place
