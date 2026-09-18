# Form: Change password

| | |
| --- | --- |
| Screen | `app/onboarding/change-password.js`, route `/onboarding/change-password` |
| Rules | `AU-R001` sections 1, 5, 6 and 7.4 |
| Who uses it | Anybody the office has told to set a new password, and every invited manager, supervisor or admin on their first sign-in |

## What it is for

Setting your own password when iREPS demands it. This screen appears by itself — you do not go looking for it.

**You cannot tap past it.** While the demand stands, this is the only screen you can reach, whatever your role, whatever your onboarding state, and however long you have been working on iREPS.

## Why it appeared

- You were invited by the office and signed in with the temporary password you were given.
- The office has demanded that everybody set a new password — for a new password standard, or after something suspicious.

## What you fill in

| Field | Notes |
| --- | --- |
| New password | At least 8 characters. Spaces at each end are removed |
| Confirm password | The same password again |

## What happens when you tap Save

1. **A confirmation window:** you will use the new password the next time you sign in.
2. **Progress** while it is saved.
3. **A result window**, and then iREPS takes you where you belong: your work if you already have an active workbase, or Select workbase if you do not.

Changing the password clears the demand **and nothing else**. Your role, your authorisation and your workbase are untouched: a working field worker is still a working field worker afterwards, and somebody still being onboarded carries on where they were.

## Error Register

| What you see | What happened | What to do |
| --- | --- | --- |
| "Password must be at least 8 characters." | Too short | Use a longer one |
| "The two passwords are not the same." | The two fields differ | Retype them both |
| **Sign in again** — "For your safety, iREPS needs a fresh sign-in before you change your password." | You have been signed in a long time; such a change needs a fresh sign-in | Sign out, sign in, come back |
| **No connection** — "Check your signal and try again." | The phone could not reach iREPS | Move to signal and try again |
| **Password not changed** — "Try again, and tell your manager if it keeps happening." | Something else | Try again, then report it |

## What it does not do

- It does not change your email.
- It does not move you backwards or forwards in onboarding.
- It does not tell your manager what your password is. Nobody at iREPS can see it.

---

**The web console works the same way.** Its sign-in, password reset and change-password screens follow this same form and this same Error Register (AU-R001 10).
