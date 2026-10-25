# Notes Organizer

A personal app where a user captures notes and Claude organizes them into the user's own
categories and tags.

## Notes

**Note**:
One entry a user captured, by typing, recording, sharing or importing. It has a body, a creation
date, a status, and optionally a due date, importance, urgency, categories, tags and audio.
_Avoid_: Item, task, entry, product

**Body**:
The text of a note: what the user typed, or the transcript of what they recorded.
_Avoid_: Content, message

**Draft**:
A note Claude has analysed that the user has not submitted yet.
_Avoid_: Pending note, unsaved note

**Submit**:
The user accepting a draft, which turns it into a `todo` note.
_Avoid_: Save, publish, confirm

**Suggestion**:
Claude's proposal for a body: categories, tags, new category and tag names, due date, importance
and urgency. It never changes anything by itself.
_Avoid_: Classification result, prediction

**Status**:
Where a submitted note stands: `todo`, `in_progress` or `done`. A note moves one step at a time.
_Avoid_: State, stage

**Due date**:
The day a note should be finished by. Optional.
_Avoid_: Completion date, deadline

**Overdue**:
A `todo` or `in_progress` note whose due date is before the user's today.
_Avoid_: Late, expired

**Unread link**:
A link in a note's body that Claude could not read (paywall, blocked site, private video), so
the note was classified from the URL alone. Shown with a "link not read" chip until a Re-analyze
reads it.
_Avoid_: Broken link, failed link

**Importance**:
Whether a note matters: `important` or `not_important`. Optional.
_Avoid_: Priority

**Urgency**:
How soon a note needs attention: `not_critical`, `medium`, `critical` or `urgent`. Optional.
_Avoid_: Priority, severity

## Organizing

**Category**:
A user's top-level subject, such as "Software development" or "Finance".
_Avoid_: Folder, group, topic

**Tag**:
A label inside exactly one category, such as "OOP" in "Software development".
_Avoid_: Label, keyword, subcategory

**Taxonomy**:
All of a user's categories with their tags.
_Avoid_: Tree, hierarchy

**Deleted** (category or tag):
Hidden from new choices but still shown, disabled, on notes that already have it, and
restorable. A deleted category makes its tags unavailable too.
_Avoid_: Archived, disabled, removed

## Capture

**Import**:
Bringing in many old notes at once from pasted text or a text file, with Claude splitting them
and proposing new categories and tags.
_Avoid_: Bulk upload, migration

**Outbox**:
Notes captured while offline, kept on the device until the user sends them.
_Avoid_: Queue, offline drafts

## Chat

**Agent**:
The chat assistant that answers questions about the user's notes and proposes taxonomy changes.
_Avoid_: Bot, assistant

**Action card**:
A change the agent proposes, shown to the user, applied only when the user approves it.
_Avoid_: Command, tool result
