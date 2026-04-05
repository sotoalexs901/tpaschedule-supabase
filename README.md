# TPA OPS Platform

Internal web application for airport/station operations management, built with **React + Vite + Firebase**.

This project centralizes day-to-day operational workflows in a single app, including:

- staff schedules
- employee records
- time off requests
- messages and announcements
- budget tracking
- timesheets
- operational reports
- WCHR workflows
- cabin service scheduling

> **Note:** the repository folder may still contain the old name `tpaschedule-supabase-main`, but the current implementation uses **Firebase**, not Supabase.

---

## Main Modules

### Authentication and access
- Login with **username + PIN**
- Role-based access
- Session persistence in local storage
- Inactivity timeout with warning modal

### Dashboard
- Manager dashboard
- Employee dashboard
- Dashboard editor for station leadership
- Announcements, events, notices, and shared content

### Employees
- Employee directory and management
- User/account linking
- Team and profile views
- Department and position-based visibility

### Schedule Management
- Weekly schedule builder
- Multiple shifts per employee per day
- Draft, returned, pending approval, and approved schedule flows
- Weekly employee summary
- Approved schedule viewer
- PDF export support

### Budgets and Staffing Control
- Airline weekly budgets
- Daily staffing/budget comparison
- Scheduled hours vs budget tracking

### Time Off Management
- Time off request form
- Employee request status view
- Public request status page
- Admin approval / rejection flow
- Restriction/block creation based on approved requests

### Blocked Employees / Restrictions
- PTO
- Sick leave
- Day off
- Maternity
- Suspension
- Other operational restrictions

### Internal Communication
- Direct internal messaging
- Unread message tracking
- Crew announcements

### Timesheets
- Supervisor timesheet submission
- Administrative review and management

### Operational Reports
- Operational report submission
- Dynamic operational report form builder
- Admin management views for reports

### Additional Report Modules
- Cleaning & Security reports
- Operations Requests reports
- WCHR POI reports
- Regulated Garbage reports

### WCHR
- WCHR scan workflow
- My WCHR reports
- WCHR flights administration

### Cabin Service
- Cabin service schedule generation
- Cabin saved schedules
- Cabin schedule roster and detail views
- Utility functions for parsing flight data and generating shifts

### Admin / Monitoring
- Activity dashboard
- Presence tracking
- Current page tracking for active users

### App Update / PWA Support
- Web app manifest
- Service worker assets
- Version check prompt to refresh when a new release is available

---

## Tech Stack

- **React 18**
- **Vite**
- **React Router DOM**
- **Firebase Firestore**
- **Firebase Storage**
- **jsPDF**
- **html2canvas**
- **Tailwind CSS**
- **PostCSS / Autoprefixer**

---

## Project Structure

```text
src/
  components/
  pages/
  services/
  utils/
  firebase.js
  UserContext.jsx
  main.jsx
