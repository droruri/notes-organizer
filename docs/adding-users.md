# Adding users

Who may sign in is a list in the database, managed from the app. Adding or removing a person needs
no redeploy and no `.env` change.

## 1. One-time setup

- **Publish the Google OAuth consent screen** ("In production") in the Google Cloud console. With
  only the basic `email` / `profile` / `openid` scopes Google needs no verification, and any Google
  account can then reach the sign-in; our list decides who gets in. In "Testing" mode Google also
  wants every person added as a test user (max 100), which defeats the point.
- Put **your own email** in `ALLOWED_EMAILS` for the first deploy. It is the bootstrap admin list:
  on every start the API inserts each listed email as an admin if it is missing. It never removes
  or demotes anyone, so editing it later does not undo changes made in the app. Note it re-adds a missing
  listed email on each start, so a bootstrap email you removed in the app comes back at the next
  restart: take it out of `ALLOWED_EMAILS` too.

## 2. Add a user

Open the menu → **משתמשים** (Users), type their Google email, save. They can sign in right away.
Emails are trimmed and lowercased. Adding an email that is already there shows an error.

## 3. Admins and removing users

- An admin sees the Users screen and can add, remove and promote people. Being admin adds nothing
  else: an admin cannot read another person's notes, categories or tags, and the Users screen shows
  emails and roles only.
- Use the toggle to make someone an admin, or take it away.
- Remove a user with the remove button (it asks to confirm). Their next request gets
  `403 not_allowed`.
- Their notes are **not** deleted. Add the same email again and they get their notes back.
- You cannot remove or demote yourself, and the last admin can never be removed or demoted.

## 4. Troubleshooting

- **"No access" screen:** the email is not on the list, or they signed in with a different Google
  account than the one you added.
- **Google "access blocked":** the consent screen is still in Testing; publish it (step 1).

## 5. Local dev

Google is off locally. The seeded user's email is in the local `ALLOWED_EMAILS` (`.env`), so it is
a bootstrap admin: sign in with the dev sign-in button and the Users screen is available.
