Landing & Analytics Plan

Goal: Collect waitlist emails and attribute traffic before Kickstarter launch.

Landing
- Path: /about (hero CTA) + /lactate-guide (CTA) + dedicated /launch (optional)
- Components: headline, short value prop, demo link, email form (waitlist), Kickstarter teaser
- Integrations: GA4 (already in app), event tracking `launch_waitlist_submit`

Tracking
- GA4 events: `waitlist_view`, `waitlist_submit`, `kickstarter_click`
- UTM: campaign=kickstarter, source=(reddit|fb|coach|newsletter), medium=(post|email)

Email Sequence (example)
1) Welcome + demo link
2) 7 days to launch — rewards preview
3) 1 day to launch — Early Bird reminder
4) Launch day — direct link
5) 48h left — scarcity reminder

Tools
- ConvertKit/Mailchimp or simple backend endpoint to store emails

