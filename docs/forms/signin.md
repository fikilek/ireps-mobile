# Form: Sign in

| | |
| --- | --- |
| Screen | `app/(auth)/signin.jsx`, route `/signin` |
| Rules | `AU-R001` sections 3, 6 and 7.1 |
| Who uses it | Everybody, every working day |

## What it is for

Proving who you are. Nothing else. What you may see afterwards is decided by your user record, not by this screen.

## What you fill in

| Field | Notes |
| --- | --- |
| Email address | Spaces at each end are removed and it is read as lower case, so `Fikile@iREPS.co.za ` works |
| Password | Used exactly as typed, except for spaces at each end |

The eye beside the password shows what you typed. **Lost access?** under the password opens Password reset.

## What happens when you tap Signin

1. There is no confirmation window. Sign in is your own door and you tap it many times a day.
2. The button shows a spinner while iREPS checks you and loads your details.
3. When it works, the app opens on the screen you belong on. There is no "well done" window; the app opening is the answer.
4. When it fails, a window tells you what went wrong, and the form comes back with what you typed.

Where you land:

| Your state | Where you go |
| --- | --- |
| The office has demanded a new password | Change password, and nowhere else until it is done |
| Your manager has not authorised you yet | The waiting screen |
| You have no active workbase | Select workbase |
| All set | Your work |

**It cannot hang.** If your details have not arrived after 30 seconds, the screen stops waiting, tells you, and gives you your screen back.

## Error Register

Everything you can be told after tapping Signin.

| What you see | What happened | What to do |
| --- | --- | --- |
| "Email or password is not right." | The password is wrong, or there is no account for that email | Check both and try again. Use Lost access? if you cannot remember |
| "That does not look like an email address." | The email is mistyped, for example a missing @ | Correct the email |
| "This account has been stopped. Speak to your manager." | The account has been disabled | Speak to your manager |
| "Too many tries. Wait a few minutes and try again." | Too many wrong tries from this phone | Wait a few minutes. Use Lost access? in the meantime |
| "No connection. Check your signal and try again." | The phone could not reach iREPS | Move to signal and try again |
| "You are signed in, but your details did not load. Check your signal and try again." | You are through, but your record did not arrive in 30 seconds | Try again. If it keeps happening, tell your manager |
| "Sign in failed. Try again, and tell your manager if it keeps happening." | Something else | Try again, then report it |

## What it does not do

- It does not create accounts. That is Sign up.
- It does not change your password. That is Password reset, or Change password once you are in.
- It does not decide whether you may work. Your manager authorises you.

---

**The web console works the same way.** Its sign-in, password reset and change-password screens follow this same form and this same Error Register (AU-R001 10).
