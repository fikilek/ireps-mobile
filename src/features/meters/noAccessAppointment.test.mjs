// No Access rules NA-R020 … NA-R027 — the NA Appointment, tested where the date arithmetic is.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAppointment,
  buildAppointmentInstant,
  formatAppointment,
  isAppointmentInFuture,
  isDayPickable,
  monthGrid,
  monthLabel,
  readAppointmentParts,
  stepMonth,
  timeOptions,
  todayInSast,
} from "./noAccessAppointment.js";

/* ------------------------------------------------------------------ *
 * NA-R024 — one clock: the worker picks South African time, iREPS stores UTC
 * ------------------------------------------------------------------ */

test("NA-R024: two in the afternoon in South Africa is noon UTC", () => {
  assert.equal(
    buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 14, minute: 0 }),
    "2026-10-08T12:00:00.000Z",
  );
});

test("NA-R024: an early appointment crosses back into the previous day in UTC", () => {
  assert.equal(
    buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 1, minute: 30 }),
    "2026-10-07T23:30:00.000Z",
  );
});

test("NA-R024: the stored instant reads back as the time the worker picked", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 12, day: 31, hour: 23, minute: 45 });
  assert.deepEqual(readAppointmentParts(at), {
    year: 2026, month: 12, day: 31, hour: 23, minute: 45, weekday: 4,
  });
});

test("NA-R024: the offset is applied explicitly, so a handset set to another country is unaffected", () => {
  // Built from parts, not from the device clock: the same parts always give the same instant.
  const first = buildAppointmentInstant({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 });
  const second = buildAppointmentInstant({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 });
  assert.equal(first, second);
  assert.equal(first, "2026-07-01T07:00:00.000Z");
});

/* ------------------------------------------------------------------ *
 * NA-R022 — one plain line, in the worker's own words
 * ------------------------------------------------------------------ */

test("NA-R022: an appointment reads as one plain line", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 14, minute: 0 });
  assert.equal(formatAppointment(at), "Thursday 8 October 2026, 14:00");
});

test("NA-R022: a time before ten keeps its leading zero", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 10, day: 2, hour: 9, minute: 5 });
  assert.equal(formatAppointment(at), "Friday 2 October 2026, 09:05");
});

test("an unreadable appointment reads NAv rather than crashing a screen", () => {
  assert.equal(formatAppointment("next Tuesday-ish"), "NAv");
  assert.equal(readAppointmentParts("not a date"), null);
});

/* ------------------------------------------------------------------ *
 * NA-R023 — in the future at capture, with no upper limit
 * ------------------------------------------------------------------ */

const NOW = Date.parse("2026-10-02T06:00:00.000Z");

test("NA-R023: an appointment already past is not in the future", () => {
  assert.equal(isAppointmentInFuture("2026-10-02T05:59:00.000Z", NOW), false);
});

test("NA-R023: a few minutes ahead is enough", () => {
  assert.equal(isAppointmentInFuture("2026-10-02T06:01:00.000Z", NOW), true);
});

test("owner 2 Oct: there is no upper limit on how far ahead", () => {
  assert.equal(isAppointmentInFuture("2031-07-04T10:00:00.000Z", NOW), true);
});

/* ------------------------------------------------------------------ *
 * NA-R021 — the worker taps; they never type a date
 * ------------------------------------------------------------------ */

test("the calendar is Monday first and every row has seven cells", () => {
  const grid = monthGrid(2026, 10);
  for (const week of grid) assert.equal(week.length, 7);
  // 1 October 2026 is a Thursday, so the first row has three blanks before it.
  assert.deepEqual(grid[0].slice(0, 4), [null, null, null, 1]);
});

test("the calendar knows how long each month is, February included", () => {
  assert.equal(monthGrid(2026, 2).flat().filter(Boolean).length, 28);
  assert.equal(monthGrid(2028, 2).flat().filter(Boolean).length, 29, "2028 is a leap year");
  assert.equal(monthGrid(2026, 10).flat().filter(Boolean).length, 31);
});

test("stepping past December rolls the year, both ways", () => {
  assert.deepEqual(stepMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(stepMonth(2026, 1, -1), { year: 2025, month: 12 });
});

test("the month reads in words", () => {
  assert.equal(monthLabel(2026, 10), "October 2026");
});

/* ------------------------------------------------------------------ *
 * Yesterday is never offered
 * ------------------------------------------------------------------ */

test("today is pickable, yesterday is not", () => {
  const today = todayInSast(NOW);
  assert.equal(isDayPickable(today, NOW), true);
  assert.equal(isDayPickable({ ...today, day: today.day - 1 }, NOW), false);
});

test("a later month is pickable, an earlier one is not", () => {
  const today = todayInSast(NOW);
  assert.equal(isDayPickable({ year: today.year, month: today.month + 1, day: 1 }, NOW), true);
  assert.equal(isDayPickable({ year: today.year - 1, month: 12, day: 31 }, NOW), false);
});

test("the day before the appointment can still be reached across a year boundary", () => {
  const newYear = Date.parse("2027-01-01T06:00:00.000Z");
  assert.equal(isDayPickable({ year: 2027, month: 1, day: 1 }, newYear), true);
  assert.equal(isDayPickable({ year: 2026, month: 12, day: 31 }, newYear), false);
});

/* ------------------------------------------------------------------ *
 * The times offered
 * ------------------------------------------------------------------ */

test("the clock offers quarter hours through the whole day", () => {
  const options = timeOptions();
  assert.equal(options.length, 96);
  assert.equal(options[0].label, "00:00");
  assert.equal(options[56].label, "14:00");
  assert.equal(options.at(-1).label, "23:45");
});

/* ------------------------------------------------------------------ *
 * What is stored
 * ------------------------------------------------------------------ */

test("NA-R030: the appointment records who agreed it and when", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 14, minute: 0 });
  assert.deepEqual(
    buildAppointment({ at, actor: { uid: "UID_1", name: "Siya Siya" }, now: "2026-10-02T06:00:00.000Z" }),
    { at, madeAt: "2026-10-02T06:00:00.000Z", madeByUid: "UID_1", madeByUser: "Siya Siya" },
  );
});

test("an unknown worker reads NAv, never blank", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 14, minute: 0 });
  const appointment = buildAppointment({ at, actor: {}, now: "2026-10-02T06:00:00.000Z" });
  assert.equal(appointment.madeByUid, "NAv");
  assert.equal(appointment.madeByUser, "NAv");
});

/* ------------------------------------------------------------------ *
 * NA-R003 — the transaction id carries the type the worker was doing
 * ------------------------------------------------------------------ */

test("every transaction type builds its own id, and a no access says so", async () => {
  const { buildNoAccessTrnId, TRN_PREFIX_BY_TYPE } = await import("./meterDiscoveryTrnId.js");

  for (const [trnType, prefix] of Object.entries(TRN_PREFIX_BY_TYPE)) {
    const id = buildNoAccessTrnId({ trnType, wardPcode: "KZN241W6", erfNo: "5214" });
    assert.ok(id.startsWith(`${prefix}_`), `${trnType} must carry ${prefix}`);
    assert.match(id, /_NA_/, "the id says it was a no access");
    assert.ok(id.endsWith("_KZN241W6_5214"), "the id can be placed from the id alone");
  }
});

test("a transaction type nobody declared is refused rather than guessed", async () => {
  const { buildNoAccessTrnId } = await import("./meterDiscoveryTrnId.js");
  assert.throws(() => buildNoAccessTrnId({ trnType: "METER_VENDING" }));
});
