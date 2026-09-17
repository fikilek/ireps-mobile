# Form: Password reset

| | |
| --- | --- |
| Screen | `app/(auth)/pwdReset.jsx`, route `/pwdReset` |
| Reached from | **Lost access?** on Sign in |
| Rules | `AU-R001` sections 1, 4, 6 and 7.3 |
| Who uses it | Anybody who cannot remember their password |

## What it is for

Getting a link that lets you set a new password yourself. Nobody in the office needs to be told, and nobody can see your password.

## What you fill in

| Field | Notes |
| --- | --- |
| Email address | The email you sign in with |

One field. That is all.

## What happens when you tap Send reset link

1. **A confirmation window** names the email the link will go to. Check it.
2. **Progress** while it is sent.
3. **A result window:** "If that email belongs to an iREPS account, a reset link is on its way. Check the inbox, and the junk folder."

**You always get those same words.** iREPS never says whether an email has an account, so nobody can use this screen to find out who works here. If you typed an email that is not on iREPS, nothing arrives — try the right one.

## Opening the link

The email comes from Firebase and the link opens a page where you type your new password. It must be at least 8 characters, like every other password on iREPS. Then come back to iREPS and sign in with the new one.

The link works for a limited time. If it has expired, come back to this screen and send another.

## Error Register

| What you see | What happened | What to do |
| --- | --- | --- |
| "If that email belongs to an iREPS account, a reset link is on its way. Check the inbox, and the junk folder." | The send was accepted. This is also what you see for an email with no account | Open the email. If nothing arrives, check the spelling and the junk folder |
| "That does not look like an email address." | The email is mistyped | Correct it |
| "Too many tries. Wait a few minutes and try again." | Too many reset requests from this phone. Nothing was sent | Wait a few minutes and try again |
| "No connection. Check your signal and try again." | The phone could not reach iREPS | Move to signal and try again |
| "Could not send the reset link. Try again, and tell your manager if it keeps happening." | Something else | Try again, then report it |

## What it does not do

- It does not change anything about your account: not your role, not your authorisation, not your workbase.
- It does not tell your manager.
- It does not let you set the password inside the app. That happens on the page the link opens.
