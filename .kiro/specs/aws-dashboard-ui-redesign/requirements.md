# Requirements Document

## Introduction

This document describes the UI/UX redesign of the AWS EC2 Dashboard — a Next.js 14 application that displays and manages EC2 instances across multiple AWS profiles. The redesign replaces a fixed 256px sidebar layout with a top-navbar-based layout, makes stat cards interactive, densifies the instance table with new row-level actions, moves filters into an inline toolbar, replaces the inline profile form with a slide-over drawer, and improves loading, empty, and error states throughout the application. The goal is a faster, more information-dense experience suited for daily operations use.

## Glossary

- **Dashboard**: The main instances view rendered by `Dashboard.tsx` and served at the `/` route.
- **TopNavbar**: The new slim horizontal navigation bar that replaces the sidebar, containing the logo, page tabs, and theme toggle.
- **Toolbar**: The inline filter row rendered directly above the instance table, containing the search input and dropdown chip filters.
- **StatCard**: One of three summary cards (Total, Running, Stopped) displayed above the instance table.
- **InstanceTable**: The sortable data table that lists EC2 instances with per-row actions.
- **ProfilesPage**: The AWS Profiles management view at the `/profiles` route.
- **SlideOverDrawer**: A panel that slides in from the right side of the viewport, used for the Add/Edit profile form.
- **SkeletonRow**: A placeholder table row with shimmer animation displayed while data is loading.
- **StateBadge**: The colored pill/badge that displays the EC2 instance state (e.g., "running", "stopped").
- **Profile**: An AWS account configuration consisting of a name, region, IAM credentials, color, and environment tag.
- **EnvTag**: An enumerated environment label (`prod`, `staging`, `dev`, `sandbox`, `other`) associated with a Profile.
- **Theme**: The active color scheme of the application, either `light` or `dark`, persisted via the `useTheme` hook.

---

## Requirements

### Requirement 1: Top Navigation Bar

**User Story:** As an operator, I want a persistent top navigation bar, so that I can switch between pages and toggle the theme without the sidebar consuming horizontal space.

#### Acceptance Criteria

1. THE Dashboard SHALL render a `TopNavbar` component that spans the full page width and does not exceed 48px in height.
2. THE `TopNavbar` SHALL display the application logo and name on the left side.
3. THE `TopNavbar` SHALL display tab navigation links for "Instances" and "Profiles" in the center or left-center area.
4. THE `TopNavbar` SHALL display the theme toggle button on the right side.
5. WHEN a navigation tab is active, THE `TopNavbar` SHALL apply a visually distinct active style to that tab link.
6. THE Dashboard SHALL NOT render a fixed 256px sidebar.
7. THE `TopNavbar` SHALL be present and consistent on both the Instances route (`/`) and the Profiles route (`/profiles`).

---

### Requirement 2: Interactive Stat Cards

**User Story:** As an operator, I want to click a stat card to filter the instance table, so that I can quickly isolate running or stopped instances without using the filter dropdowns.

#### Acceptance Criteria

1. THE `StatCard` component SHALL accept an `onClick` callback prop and render as an interactive button element.
2. WHEN the "Running" `StatCard` is clicked, THE Dashboard SHALL filter the instance table to show only instances with `State === "running"`.
3. WHEN the "Stopped" `StatCard` is clicked, THE Dashboard SHALL filter the instance table to show only instances with `State === "stopped"`.
4. WHEN an active `StatCard` filter is clicked a second time, THE Dashboard SHALL clear that state filter and restore the unfiltered view.
5. THE `StatCard` SHALL display the ratio label in the format `"N of M <state> (P%)"` where N is the count for that state, M is the total number of instances, and P is the percentage rounded to the nearest integer.
6. THE `StatCard` SHALL display `text-2xl font-bold` styling for the numeric value (reduced from `text-3xl`).
7. WHEN a `StatCard` filter is active, THE `StatCard` SHALL render a visual active/selected indicator (e.g., ring or background highlight).

---

### Requirement 3: Inline Filter Toolbar

**User Story:** As an operator, I want filters in a toolbar above the table, so that I can quickly narrow results without a sidebar consuming screen width.

#### Acceptance Criteria

1. THE `Toolbar` SHALL render as a single horizontal row directly above the instance table.
2. THE `Toolbar` SHALL contain a text search input that filters instances by name as the user types.
3. THE `Toolbar` SHALL contain a "Profile" dropdown chip that allows the operator to select one or more profiles to include.
4. THE `Toolbar` SHALL contain a "State" dropdown chip that allows the operator to select one or more states to include.
5. THE `Toolbar` SHALL contain an "Instance Type" dropdown chip that allows the operator to filter by EC2 instance type.
6. THE `Toolbar` SHALL display a result count label in the format `"N of M instances"` indicating how many instances are currently visible.
7. WHEN all filters are cleared, THE `Toolbar` result count SHALL display the total number of instances.
8. IF no instances match the active filters, THEN THE `Toolbar` SHALL still display the zero-result count label.

---

### Requirement 4: Instance Table Improvements

**User Story:** As an operator, I want a denser, more actionable instance table, so that I can read instance details and act on them without navigating away.

#### Acceptance Criteria

1. THE `InstanceTable` SHALL NOT render a "Profile" column.
2. THE `InstanceTable` SHALL render a "Copy SSH" action button on each row that copies the SSH command `ssh ec2-user@<Public IP>` to the clipboard when clicked.
3. WHEN a row's `Public IP` is empty or `"-"`, THE `InstanceTable` SHALL disable the "Copy SSH" button for that row and render it in a visually muted style.
4. THE `InstanceTable` SHALL render an "Open in AWS Console" icon-link on each row that opens the AWS EC2 console URL for that instance in a new browser tab.
5. THE `InstanceTable` SHALL render copy icons for the Instance ID and Public IP cells persistently (always visible), not only on row hover.
6. THE `StateBadge` SHALL be visually prominent: it SHALL use a filled background color and `font-semibold` text weight.
7. THE `InstanceTable` SHALL collapse the Availability Zone value into a tooltip on the instance type cell or a secondary line, removing the dedicated "AZ" column.
8. THE `InstanceTable` SHALL render the page heading as `text-lg font-semibold` (reduced from `text-2xl font-bold`).

---

### Requirement 5: Profiles Page — Slide-Over Drawer

**User Story:** As an operator, I want to add and edit profiles in a slide-over drawer, so that I can see the profile list while the form is open and have a more focused editing experience.

#### Acceptance Criteria

1. THE `ProfilesPage` SHALL render a `SlideOverDrawer` component that slides in from the right when the "Add Profile" button is clicked.
2. THE `SlideOverDrawer` SHALL render all existing profile form fields (name, environment tag, region, access key, secret key, color) inside the drawer panel.
3. THE `SlideOverDrawer` SHALL display a live profile preview in the drawer header that updates as the operator edits the name, color, and environment tag fields.
4. WHEN the "Edit" action is triggered on a profile row, THE `ProfilesPage` SHALL open the `SlideOverDrawer` populated with that profile's current values.
5. THE `ProfilesPage` SHALL NOT use an inline expanding form within the profile list for Add or Edit operations.
6. WHEN the `SlideOverDrawer` is open, THE `ProfilesPage` SHALL render a semi-transparent overlay behind the drawer that, when clicked, closes the drawer without saving.
7. WHEN the operator presses the Escape key while the `SlideOverDrawer` is open, THE `SlideOverDrawer` SHALL close without saving.

---

### Requirement 6: Inline Delete Confirmation

**User Story:** As an operator, I want an inline confirmation before a profile is deleted, so that I cannot accidentally delete a profile via an unintentional click.

#### Acceptance Criteria

1. THE `ProfilesPage` SHALL NOT call `window.confirm()` to confirm profile deletion.
2. WHEN the delete button is clicked on a profile row, THE `ProfilesPage` SHALL replace the action buttons for that row with an inline confirmation prompt containing "Confirm delete" and "Cancel" controls.
3. WHEN the "Confirm delete" control is activated, THE `ProfilesPage` SHALL call the delete API and remove the profile from the list on success.
4. WHEN the "Cancel" control is activated, THE `ProfilesPage` SHALL restore the original row action buttons without deleting the profile.
5. IF the delete API call fails, THEN THE `ProfilesPage` SHALL display an inline error message on that row without using `window.alert()`.

---

### Requirement 7: Loading Skeleton State

**User Story:** As an operator, I want skeleton rows while data loads, so that layout shift is minimized and the page feels responsive.

#### Acceptance Criteria

1. WHILE the Dashboard is fetching instance data, THE `InstanceTable` SHALL render a set of `SkeletonRow` placeholder rows instead of a spinner.
2. THE `SkeletonRow` SHALL use shimmer animation and match the column widths of the live table.
3. THE `SkeletonRow` count SHALL be fixed at 5 rows during loading.
4. WHILE the `ProfilesPage` is fetching profile data, THE `ProfilesPage` SHALL render skeleton placeholder rows instead of a spinner.

---

### Requirement 8: Empty State After Filtering

**User Story:** As an operator, I want an informative empty state when filters produce no results, so that I understand why nothing is shown and can quickly reset.

#### Acceptance Criteria

1. IF the active filters produce zero matching instances, THEN THE `InstanceTable` SHALL render an empty state message that names the active filter(s).
2. THE empty state SHALL include a "Clear filters" call-to-action button.
3. WHEN the "Clear filters" button is clicked, THE Dashboard SHALL reset all active filters (search text, profile selection, state selection, type selection) to their default values.
4. IF no instances exist at all (not a filter issue), THEN THE `InstanceTable` SHALL render a distinct empty state message that does not reference filters.

---

### Requirement 9: Error State Improvements

**User Story:** As an operator, I want a richer error state when data fails to load, so that I can diagnose and report the issue efficiently.

#### Acceptance Criteria

1. IF the instance data fetch fails, THEN THE Dashboard SHALL display an error state that includes the HTTP status code or error message from the API response.
2. THE error state SHALL include a "Copy error details" button that copies the full error message to the clipboard.
3. WHEN the "Copy error details" button is clicked, THE Dashboard SHALL provide visual confirmation that the text was copied (e.g., a checkmark icon for 1500ms).
4. THE error state SHALL include a "Try again" button that re-triggers the `fetchInstances` API call.
5. IF the profile data fetch fails, THEN THE `ProfilesPage` SHALL display the same enriched error state pattern with error details and a "Try again" button.

---

### Requirement 10: Theme Toggle Placement

**User Story:** As an operator, I want the theme toggle in the top navbar, so that I can access it from any page without navigating to the sidebar.

#### Acceptance Criteria

1. THE `TopNavbar` SHALL render the theme toggle button aligned to the right side of the navbar.
2. WHEN the theme toggle is clicked, THE Dashboard SHALL switch between `light` and `dark` theme by invoking the existing `toggle` function from `useTheme`.
3. THE `ProfilesPage` sidebar SHALL NOT render its own separate theme toggle button after the redesign.
4. THE theme toggle icon SHALL display a Sun icon when the active theme is `dark` and a Moon icon when the active theme is `light`.

---

### Requirement 11: Typography and Spacing Density

**User Story:** As an operator, I want consistent, reduced typography sizing, so that more content fits on screen without scrolling during daily use.

#### Acceptance Criteria

1. THE page heading for the Instances view SHALL use `text-lg font-semibold` Tailwind classes.
2. THE page heading for the Profiles view SHALL use `text-lg font-semibold` Tailwind classes.
3. THE `StatCard` numeric value SHALL use `text-2xl font-bold` Tailwind classes.
4. THE `StatCard` label SHALL use `text-xs uppercase tracking-widest` Tailwind classes consistent with the existing design.
5. THE main content area padding SHALL be appropriate for an ops/daily-use tool and SHALL NOT exceed `p-6` on desktop viewports.
