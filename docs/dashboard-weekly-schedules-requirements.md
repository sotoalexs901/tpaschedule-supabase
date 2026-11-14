# Dashboard and Weekly Schedules — approved product direction

## Preserve the dashboard
The existing DashboardPage.jsx remains the main landing page. Preserve all current news, announcements, operational alerts, live flight/weather widgets and other dashboard content. Add scheduling as a section; do not replace the dashboard with a module launcher.

## Two schedule views
1. **My Schedule**: agents and supervisors view their own personalized schedule from existing approved schedule data. Do not expose unpublished drafts or returned schedules.
2. **Department Weekly Schedules**: station staff can view approved weekly department rosters as a gallery, including an image-style presentation like the weekly schedule photos previously shared in BAND. Provide department and week selectors, enlarge/download/print affordances, published timestamp and revision indicator.

## Publishing behavior
- Approved schedule is source of truth; draft or returned schedules must never appear publicly.
- On approval, offer a controlled publish action or automatically publish only when existing approval workflow safely supports it.
- Support an optional uploaded schedule image for each department/week to retain the familiar BAND layout; a generated image/print view is an alternative when possible.
- Revisions replace or supersede previous public versions with a visible updated date, avoiding stale photos.
- Distinguish no schedule published from no shifts assigned.
- Preserve current schedule approval, individual employee views, role permissions and notifications.

## Access and privacy
- Verify which roster fields are appropriate to share station-wide; omit personal contact details and other sensitive employee data.
- Use existing authenticated access and secure Storage/Firestore rules; do not expose images via public anonymous URLs by default.
- Test mobile image zoom and long tables on iPhone/iPad/Android, plus keyboard/screen-reader access.

## Acceptance criteria
Dashboard news and widgets still render; My Schedule is personalized; staff can switch department and week and see only approved published rosters; schedule image is legible on mobile; changes propagate without displaying obsolete versions.
