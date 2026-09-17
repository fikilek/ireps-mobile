# Form: Invite a manager, supervisor or admin

| | |
| --- | --- |
| Screens | `app/(tabs)/admin/users/create-manager.js`, `create-supervisor.js`, `create-admin.js` |
| Back end | `inviteManagerUser`, `inviteSupervisorUser`, `inviteAdminUser` |
| Rules | `AU-R001` sections 1, 5 and 9 |
| Who uses it | An admin invites managers; a manager invites supervisors; the SPU invites admins |

## What it is for

Making an account for somebody who does not sign up: managers, supervisors and admins. Field workers sign up for themselves.

## What you fill in

| Field | Notes |
| --- | --- |
| Email | Their working email. It becomes their sign-in name |
| Name, surname | Required |
| Service provider or main contractor | Which one they belong to. Not asked when inviting an admin |

## What happens when you send it

iREPS makes the account and **a one-time password just for that person**. It looks like `K7RM-4TQD-9XBV` — no letters or digits that can be misheard, and in three short blocks so it can be read out over a phone.

**The one-time password is shown once, to you, in the window that follows.** Write it down or send it to the person before you tap "I have written it down". iREPS cannot email it, does not store it anywhere you can read it, and will never show it again.

If it is lost, invite them again with a different email, or tell them to use **Lost access?** on the sign-in screen and set their own password from the link.

The person signs in with that password once, and iREPS then makes them set their own before they can reach anything.

Until 18 September 2026 every invited person was created with the same password — the word `password` — and it was the same for everybody. That is finished.

## Error Register

| What you see | What happened | What to do |
| --- | --- | --- |
| "An account already uses this email." | Somebody has already been invited or signed up with it | Use another email, or find them in Users |
| A message naming a missing field | Something required is empty | Fill it in |
| "No connection..." | The phone could not reach iREPS | Move to signal and try again |
| Anything else | The reason the back end gave | Try again, and report it if it keeps happening |

**If the window shows no one-time password**, the account was still made. Tell the person to use Lost access? on the sign-in screen.

## What it does not do

- It does not email anybody. You pass the password on yourself.
- It does not let you choose the password, or see it again later.
- It does not give a manager or supervisor their workbase; they choose it after their first sign-in.
