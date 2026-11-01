# Form: Sign up

| | |
| --- | --- |
| Screen | `app/(auth)/signup.jsx`, route `/signup` |
| Back end | `signupFieldWorker`, and `listSignupServiceProviders` for the picker |
| Rules | `AU-R001` sections 1, 2, 6 and 7.2 |
| Who uses it | A new field worker, once |

## What it is for

Asking to join iREPS as a field worker. Sign up never makes a manager, a supervisor or an admin — those people are invited by the office.

## What you fill in

| Field | Notes |
| --- | --- |
| Surname | Required |
| Name | Required |
| Email | Your own working email. It becomes your sign-in name and the address a password reset goes to |
| Password | At least 8 characters |
| Confirm password | The same password again |
| Service provider | Chosen from the list. Only active service providers appear |

The list of service providers comes from iREPS itself, because you are not signed in yet. If it cannot be loaded, the screen says so and offers **Try again** — it never leaves you with an empty picker and no explanation.

## What happens when you tap Submit

1. **A confirmation window** shows your name, your email and the service provider you chose. Check them, because the email is what you will sign in with.
2. **Progress** while it is sent.
3. **A result window**, success or failure.

On success you are told your sign up went through and your manager must authorise you, and you are put back on Sign in. **You are not let into the app yet.** Once your manager authorises you, you sign in normally.

## What iREPS checks, in this order

1. Every field is filled in.
2. The password is at least 8 characters.
3. The service provider still exists.
4. The service provider is active.
5. A manager is responsible for that service provider.
6. No account already uses that email.

## Error Register

| What you see | What happened | What to do |
| --- | --- | --- |
| **Could not load the service providers** — "Check your signal and try again." | The picker's list could not be fetched | Try again. It needs signal |
| **Email already used** — "Sign in instead, or use Lost access?" | You, or somebody, already signed up with that email | Sign in, or reset the password |
| **Service provider not active** — "Choose another, or ask your manager." | The service provider has been stopped on iREPS | Choose another, or ask your manager |
| **No manager for that service provider** — "Ask your manager to sort this out before you sign up." | Nobody can authorise you, so signing up would leave you stuck | Tell your manager. The office must set this up first |
| "Password must be at least 8 characters." | The password is too short | Use a longer one |
| A message naming another field | Something required is missing or wrong | Fix that field |
| **No connection** — "Check your signal and try again." | The phone could not reach iREPS | Move to signal and try again |
| **Sign up failed** — "Try again, and tell your manager if it keeps happening." | Something else | Try again, then report it |

## What it does not do

- It does not authorise you. Only your manager can.
- It does not give you a workbase. You choose that after your manager authorises you.
- It does not send anyone an email. Your manager sees you waiting inside iREPS.
