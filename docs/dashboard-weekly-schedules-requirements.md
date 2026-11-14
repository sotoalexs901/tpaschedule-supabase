# Dashboard — Weekly Schedule Photo Gallery (revised requirements)

## Keep existing Dashboard
Preserve all current news, announcements, operational alerts, flight/weather widgets and other content. Add a compact weekly schedule photo carousel; do not replace the dashboard.

## Existing personalized schedules
Keep the existing My Schedule functionality unchanged. Do not duplicate it in the dashboard gallery.

## Department photo gallery
- Show one approved/published weekly schedule image per department for the selected week.
- Clicking/tapping the image advances to the next department, wrapping at the end; provide previous/next arrows and an accessible department counter.
- Provide a separate expand/zoom action for reading the image at full size on mobile (tap-to-advance must not prevent zoom).
- Show only approved published schedules. Never show drafts or returned schedules.
- Keep department names, week labels, and updated timestamps visible.
- If no image exists, show an explicit unpublished placeholder, not fabricated roster data.
- Only show appropriate roster information; exclude personal contact details and private HR information.

## Notification: existing approval + explicit Notify action
- Approval by itself does not send a new-schedule notification.
- When Station Manager presses the existing **Notify** control after approval, publish/refresh the approved department gallery and send the announcement **New Schedule Posted** to the intended employees using existing notification infrastructure.
- Notification body: **The new weekly department schedules are available. Open AeroStation Hub to view them.**
- Clicking the notification should open Dashboard directly at the weekly schedule gallery.
- Prevent duplicate sends on repeated clicks unless the user explicitly confirms a resend.
- Respect existing role authorization and employee notification preferences. Do not notify for drafts or unapproved schedules.
- Preserve all existing schedule approval and My Schedule behavior.

## Delivery checklist
Inspect the existing approval/Notify handler, published schedule storage and push infrastructure before implementing. Add the carousel with responsive/mobile and keyboard navigation, then test on iPhone/iPad/Android and run the build. Keep changes in the feature branch until validated.
