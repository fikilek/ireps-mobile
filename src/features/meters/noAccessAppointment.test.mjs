// No Access rules NA-R020 … NA-R027 — the NA Appointment, tested where the date arithmetic is.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAppointment,
  buildAppointmentInstant,
  formatAppointment,
  isAppointmentInFuture,
  isDayPickable,
  isTimePickable,
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
    buildAppointmentInstant({
      year: 2026,
      month: 10,
      day: 8,
      hour: 14,
      minute: 0,
    }),
    "2026-10-08T12:00:00.000Z",
  );
});

test("NA-R024: an early appointment crosses back into the previous day in UTC", () => {
  assert.equal(
    buildAppointmentInstant({
      year: 2026,
      month: 10,
      day: 8,
      hour: 1,
      minute: 30,
    }),
    "2026-10-07T23:30:00.000Z",
  );
});

test("NA-R024: the stored instant reads back as the time the worker picked", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 12,
    day: 31,
    hour: 23,
    minute: 45,
  });
  assert.deepEqual(readAppointmentParts(at), {
    year: 2026,
    month: 12,
    day: 31,
    hour: 23,
    minute: 45,
    weekday: 4,
  });
});

test("NA-R024: the offset is applied explicitly, so a handset set to another country is unaffected", () => {
  // Built from parts, not from the device clock: the same parts always give the same instant.
  const first = buildAppointmentInstant({
    year: 2026,
    month: 7,
    day: 1,
    hour: 9,
    minute: 0,
  });
  const second = buildAppointmentInstant({
    year: 2026,
    month: 7,
    day: 1,
    hour: 9,
    minute: 0,
  });
  assert.equal(first, second);
  assert.equal(first, "2026-07-01T07:00:00.000Z");
});

/* ------------------------------------------------------------------ *
 * NA-R022 — one plain line, in the worker's own words
 * ------------------------------------------------------------------ */

test("NA-R022: an appointment reads as one plain line", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 10,
    day: 8,
    hour: 14,
    minute: 0,
  });
  assert.equal(formatAppointment(at), "Thursday 8 October 2026, 14:00");
});

test("NA-R022: a time before ten keeps its leading zero", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 10,
    day: 2,
    hour: 9,
    minute: 5,
  });
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
  assert.equal(
    monthGrid(2028, 2).flat().filter(Boolean).length,
    29,
    "2028 is a leap year",
  );
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
  assert.equal(
    isDayPickable({ year: today.year, month: today.month + 1, day: 1 }, NOW),
    true,
  );
  assert.equal(
    isDayPickable({ year: today.year - 1, month: 12, day: 31 }, NOW),
    false,
  );
});

test("the day before the appointment can still be reached across a year boundary", () => {
  const newYear = Date.parse("2027-01-01T06:00:00.000Z");
  assert.equal(isDayPickable({ year: 2027, month: 1, day: 1 }, newYear), true);
  assert.equal(
    isDayPickable({ year: 2026, month: 12, day: 31 }, newYear),
    false,
  );
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

test("U03: 02:00 today is disabled after it has passed, while later times remain available", () => {
  const now = Date.parse("2026-10-05T06:45:00.000Z"); // 08:45 SAST
  const day = { year: 2026, month: 10, day: 5 };
  assert.equal(isTimePickable(day, { hour: 2, minute: 0 }, now), false);
  assert.equal(isTimePickable(day, { hour: 8, minute: 45 }, now), false);
  assert.equal(isTimePickable(day, { hour: 9, minute: 0 }, now), true);
  assert.deepEqual(
    timeOptions().filter((time) => isTimePickable(day, time, now)).map((time) => time.label),
    timeOptions().slice(36).map((time) => time.label),
  );
});

test("a time that expires while the clock is open is refused when tapped", () => {
  const day = { year: 2026, month: 10, day: 5 };
  const time = { hour: 9, minute: 0 };
  assert.equal(isTimePickable(day, time, Date.parse("2026-10-05T06:59:59.999Z")), true);
  assert.equal(isTimePickable(day, time, Date.parse("2026-10-05T07:00:00.000Z")), false);
  assert.equal(isTimePickable(day, time, Date.parse("2026-10-05T07:00:00.001Z")), false);
});

test("tomorrow and far-future dates retain every time, including 02:00", () => {
  const now = Date.parse("2026-10-05T06:45:00.000Z");
  for (const day of [{ year: 2026, month: 10, day: 6 }, { year: 2031, month: 7, day: 4 }]) {
    assert.equal(timeOptions().every((time) => isTimePickable(day, time, now)), true);
  }
});

test("a previous day has no available times, even if its clock time is later", () => {
  const now = Date.parse("2026-10-05T06:45:00.000Z");
  const yesterday = { year: 2026, month: 10, day: 4 };
  assert.equal(timeOptions().some((time) => isTimePickable(yesterday, time, now)), false);
});

test("after the last quarter hour today there are no slots, but tomorrow remains available", () => {
  const now = Date.parse("2026-10-05T21:45:00.000Z"); // 23:45 SAST
  assert.equal(timeOptions().some((time) => isTimePickable({ year: 2026, month: 10, day: 5 }, time, now)), false);
  assert.equal(isTimePickable({ year: 2026, month: 10, day: 6 }, { hour: 0, minute: 0 }, now), true);
});

test("the clock uses the SAST date across midnight and the year boundary", () => {
  const now = Date.parse("2026-12-31T22:00:00.000Z"); // 1 January, 00:00 SAST
  assert.equal(isTimePickable({ year: 2026, month: 12, day: 31 }, { hour: 23, minute: 45 }, now), false);
  assert.equal(isTimePickable({ year: 2027, month: 1, day: 1 }, { hour: 0, minute: 0 }, now), false);
  assert.equal(isTimePickable({ year: 2027, month: 1, day: 1 }, { hour: 0, minute: 15 }, now), true);
});

test("a time cannot be chosen before a day has been selected", () => {
  assert.equal(isTimePickable(null, { hour: 9, minute: 0 }, NOW), false);
});

/* ------------------------------------------------------------------ *
 * What is stored
 * ------------------------------------------------------------------ */

test("NA-R030: the appointment records who agreed it and when", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 10,
    day: 8,
    hour: 14,
    minute: 0,
  });
  assert.deepEqual(
    buildAppointment({
      at,
      actor: { uid: "UID_1", name: "Siya Siya" },
      now: "2026-10-02T06:00:00.000Z",
    }),
    {
      at,
      madeAt: "2026-10-02T06:00:00.000Z",
      madeByUid: "UID_1",
      madeByUser: "Siya Siya",
    },
  );
});

test("an unknown worker reads NAv, never blank", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 10,
    day: 8,
    hour: 14,
    minute: 0,
  });
  const appointment = buildAppointment({
    at,
    actor: {},
    now: "2026-10-02T06:00:00.000Z",
  });
  assert.equal(appointment.madeByUid, "NAv");
  assert.equal(appointment.madeByUser, "NAv");
});

/* ------------------------------------------------------------------ *
 * NA-R003 — the transaction id carries the type the worker was doing
 * ------------------------------------------------------------------ */

// NA-R005 (1.11.0), settled by the owner 3 October 2026:
//   TRN_{work}_{timestamp}_{meterCat}_{wardPcode}_{erfNo}_NA
//
// Before this rule the id was a Meter Discovery id with NA in the METER-TYPE slot - a
// convention in use since 2 May 2026 that nobody had written down, and that the format
// reference contradicts, declaring only ELC and WTR there.
// NA-R005, ONE SHAPE (owner, 7 October 2026). A no access id is the ordinary transaction id
// with `_NA` on the end, and nothing else differs. These tests used to assert the opposite -
// one of them was called "the time is SAST and readable, not an epoch number" - because the
// no access id carried the date and time as two readable segments plus three random
// characters. One kind of thing then had two shapes and every reader of an id had to know
// both, which is the complication the owner ended.
//
// The builder itself now lives in src/features/trns/trnId.js, the one well for every
// transaction id in iREPS, and has its own tests. What is kept here is the no access side of it:
// that the work is named first, that `_NA` is last, and that an unreached meter is `NAv`.
test("NA-R005: the work is named first, and _NA says it failed", async () => {
  const { buildNoAccessTrnId } = await import("./meterDiscoveryTrnId.js");
  const { TRN_PREFIX_BY_TYPE } = await import("../trns/trnId.js");

  for (const [trnType, prefix] of Object.entries(TRN_PREFIX_BY_TYPE)) {
    const id = buildNoAccessTrnId({
      trnType,
      meterType: "electricity",
      wardPcode: "ZA5241006",
      erfNo: "1695",
    });

    assert.ok(
      id.startsWith(`${prefix}`),
      `${trnType} must keep its own prefix: a no access on a disconnection IS a disconnection that could not be done (NA-R003)`,
    );
    assert.ok(id.endsWith("_NA"), "a no access must say so, at the end");
    assert.ok(
      id.endsWith("_ELC_ZA5241006_1695_NA"),
      "the ward and the ERF must both be there - ERF numbers repeat between wards",
    );
  }
});

test("NA-R005: a no access id is the ordinary id with _NA on the end", async () => {
  const { buildNoAccessTrnId, buildMeterDiscoveryTrnId } =
    await import("./meterDiscoveryTrnId.js");

  const at = new Date("2026-10-03T10:45:22.663Z");
  const parts = {
    meterType: "electricity",
    wardPcode: "ZA5241006",
    erfNo: "1695",
  };

  const noAccess = buildNoAccessTrnId({ trnType: "METER_DISCOVERY", ...parts, at });

  assert.equal(
    noAccess,
    "TRN_MDIS_1791024322663_ELC_ZA5241006_1695_NA",
    "the time is the same milliseconds every other transaction carries",
  );

  // And the two differ by the suffix and nothing else. buildMeterDiscoveryTrnId stamps its
  // own clock, so compare the shape rather than the instant.
  const done = buildMeterDiscoveryTrnId(parts);
  assert.equal(
    done.replace(/_\d+_/, "_T_"),
    noAccess.replace(/_\d+_/, "_T_").replace(/_NA$/, ""),
    "a no access id must be the ordinary id plus _NA, and differ in nothing else",
  );
});

test("NA-R005: the meter category is ELC, WTR, or NAv where none was reached", async () => {
  const { buildNoAccessTrnId } = await import("./meterDiscoveryTrnId.js");

  const at = new Date("2026-10-03T10:45:22.663Z");
  const of = (meterType) =>
    buildNoAccessTrnId({
      trnType: "METER_DISCOVERY",
      meterType,
      wardPcode: "ZA5241006",
      erfNo: "1695",
      at,
    });

  assert.equal(of("electricity"), "TRN_MDIS_1791024322663_ELC_ZA5241006_1695_NA");
  assert.equal(of("water"), "TRN_MDIS_1791024322663_WTR_ZA5241006_1695_NA");
  // A first-visit Discovery never reached a meter, so there is no category to name. NAv, not
  // NA: NA is the suffix that says the visit failed, and one word may not mean two things.
  assert.match(of(""), /_NAv_ZA5241006_1695_NA$/);
  assert.match(of(undefined), /_NAv_ZA5241006_1695_NA$/);
});

test("a transaction type nobody declared is refused rather than guessed", async () => {
  const { buildNoAccessTrnId } = await import("./meterDiscoveryTrnId.js");
  assert.throws(() => buildNoAccessTrnId({ trnType: "METER_VENDING" }));
});
