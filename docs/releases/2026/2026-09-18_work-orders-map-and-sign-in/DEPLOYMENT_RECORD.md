# Deployment Record

**Release:** My Work Orders search and map, faster returns, clearer sign in, meter-number rule
**Release Date:** 18 September 2026
**Status:** Both builds finished 18 September 2026. LIVE link sent to the field WhatsApp group by the owner on 18 September 2026.

---

## Source

| Repository | Commit | What it carries |
| --- | --- | --- |
| `ireps-mobile` | `f2444fc` | My Work Orders Drop 1: batch search and map; the batch goes with the work (TB-R051, rules 1.3.35) |
| `ireps-mobile` | `77a0767` | Batch map amendments 1.3.38 and 1.3.40, load time TB-R052 (1.3.39), sign-in messages (AU-R001 1.1.1, sign-in part), per-row debug log removed |
| `ireps-mobile` | `2e832cc`, `bb206a9` | Meter numbers follow MV-R001 section 8 on the phone |
| `ireps-mobile` | `b1eedd7` | Merge of the meter-number fix into `main` — **the build commit** |
| `ireps-rules` | `83bba6f`, `d565df0` | Targeted Batch rules 1.3.39 (TB-R052) |
| `ireps-rules` | `656c7c8` … `3c96dc5` | Targeted Batch rules 1.3.38 (TB-R051 map) |
| `ireps-rules` | `14082d5`, `74087e2`, `b6a9544` | Targeted Batch rules 1.3.40 (TB-R051 map) |
| `ireps-rules` | `f3183dd` | Auth rules AU-R001 1.1.1 |
| `ireps-rules` | `2ffbffe` | Meter visibility rules MV-R001 1.1.0 (section 8, meter numbers) |

`main` was pushed to GitHub (`fikilek/ireps-mobile`) at `b1eedd7` on 18 September 2026. The push also carried the four 16 September release commits (`a176e76`, `0c083b1`, `1ac0b1c`, `2ddfa1a`), which had not been pushed before.

Both builds were started by the owner from `C:\dev\ireps-mobile` on `main` at `b1eedd7`, with a clean working tree. Claude's attempts from its own shell timed out reaching `api.expo.dev`. The last `live` attempt had already moved the remote versionCode counter from 11 to 12 before its upload failed, so no build 12 exists.

---

## Backend deployment

None needed. No Functions change ships with this release. The indexes the new queries use were confirmed present on DEV (`ireps2`), TEST (`ireps-test`) and LIVE (`ireps-5c3e9`) on 18 September 2026.

---

## Builds

| Profile | Channel | Git ref | Runtime | Outcome |
| --- | --- | --- | --- | --- |
| `test` | `test` | `b1eedd7` | `exposdk:54.0.0` | Finished, 24m 51s. versionCode 35, build `5eee9848-8338-4bee-9477-0b73043abff2` |
| `live` | `production` | `b1eedd7` | `exposdk:54.0.0` | Finished, 23m 8s. versionCode 13, build `513efa39-e2d8-4c5c-868c-596311fd5a76` |

- App version: 1.0.0.
- Android credentials: remote (Expo server), keystore `Build Credentials N8kBeiIyAG` (default).
- EAS resolves the `preview` environment for these profiles. This is harmless today, because the app's environment comes from the profile's `env` (register item p11).

TEST install link (internal distribution):
https://expo.dev/accounts/ireps/projects/maps1/builds/5eee9848-8338-4bee-9477-0b73043abff2

LIVE install link (internal distribution):
https://expo.dev/accounts/ireps/projects/maps1/builds/513efa39-e2d8-4c5c-868c-596311fd5a76

---

## Distribution

**Sent to the field WhatsApp group by the owner on 18 September 2026,** with `WHATSAPP_PILOT_MESSAGE_2026-09-18.txt`.

The live build went out without the TEST build check in `VERIFICATION.md` being recorded first; the check stays open there.

- Every field phone must install this APK. It is not being sent over the air.
- Install over build 11. **Do not uninstall first**, because that deletes forms waiting on the phone.

---

## Correction to the 16 September record

The 16 September `test` build is versionCode **34** (build `5f5341df-25bb-4e3c-8074-c596b290541e`), not 10. The `test` app (`com.ireps.mobile.test`) keeps its own counter, separate from LIVE.
