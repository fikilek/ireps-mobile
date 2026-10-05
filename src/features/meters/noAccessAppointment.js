// No Access rules NA-R020 … NA-R027 — the NA Appointment.
//
// The worker was turned away and told to come back at a set time. Today that agreement is
// lost; this is it, recorded.
//
// This module is PURE — no React, no date library, no device clock it does not own — so the
// date arithmetic that is easy to get wrong is tested on its own. The screen above it only
// draws what this returns.
//
// NA-R024, ONE CLOCK. The worker sees and picks South African time; it is stored as ISO 8601
// UTC, like every other instant in iREPS. South Africa has no daylight saving, so SAST is
// UTC+2 all year and the conversion is a fixed offset rather than a timezone database. The
// offset is applied explicitly instead of trusting the phone's own timezone, so a handset set
// to the wrong country still records the time the worker and the occupant agreed on.

export const SAST_OFFSET_MINUTES = 120;

const MINUTE_MS = 60 * 1000;

const WEEKDAYS = Object.freeze([
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]);

const MONTHS = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);

/** Monday first, the way a South African calendar is read. */
export const WEEKDAY_INITIALS = Object.freeze(["M", "T", "W", "T", "F", "S", "S"]);

const pad = (value) => String(value).padStart(2, "0");

/** The UTC instant for a wall-clock time the worker picked in South African time. */
export function buildAppointmentInstant({ year, month, day, hour = 0, minute = 0 }) {
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(utcMillis - SAST_OFFSET_MINUTES * MINUTE_MS).toISOString();
}

/** The South African wall-clock parts of a stored instant. */
export function readAppointmentParts(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;

  const shifted = new Date(when.getTime() + SAST_OFFSET_MINUTES * MINUTE_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * NA-R022 — once made, it reads as one plain line, in the worker's own words and time:
 * "Thursday 2 October 2026, 14:00".
 */
export function formatAppointment(iso) {
  const parts = readAppointmentParts(iso);
  if (!parts) return "NAv";

  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}, ` +
    `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * NA-R023 — an appointment is in the future when the worker submits. Checked here, on the
 * phone, at capture. NA-R026: the server never checks it again, so a phone that was out of
 * signal overnight is not refused for being honest about when the work was done.
 *
 * There is NO upper limit on how far ahead it may be (owner, 2 October 2026).
 */
export function isAppointmentInFuture(iso, now = Date.now()) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return false;
  return when.getTime() > now;
}

/** The record stored on the no access (NA-R030). */
export function buildAppointment({ at, actor = {}, now = new Date().toISOString() }) {
  return {
    at,
    madeAt: now,
    madeByUid: actor.uid || "NAv",
    madeByUser: actor.name || "NAv",
  };
}

/* ------------------------------------------------------------------ *
 * The calendar the worker taps
 * ------------------------------------------------------------------ */

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The weeks of a month, Monday first, padded with nulls so every row has seven cells.
 * NA-R021: the worker taps a day. They never type a date and never choose a format.
 */
export function monthGrid(year, month) {
  const total = daysInMonth(year, month);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // getUTCDay is Sunday-first; the calendar is Monday-first.
  const lead = (firstWeekday + 6) % 7;

  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  );
}

export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function stepMonth(year, month, by) {
  const next = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}

/** Today, in South African time — what the calendar opens on and what it greys out behind. */
export function todayInSast(now = Date.now()) {
  const parts = readAppointmentParts(new Date(now).toISOString());
  return { year: parts.year, month: parts.month, day: parts.day };
}

/**
 * A day is pickable when it is today or later in South African time. Yesterday is never an
 * appointment, and NA-R023 would refuse it at submit — so the calendar does not offer it at
 * all, rather than letting a worker tap it and be told off afterwards.
 */
export function isDayPickable({ year, month, day }, now = Date.now()) {
  const today = todayInSast(now);
  if (year !== today.year) return year > today.year;
  if (month !== today.month) return month > today.month;
  return day >= today.day;
}

/** NA-R023: a new choice must still be future when it is displayed and when it is tapped. */
export function isTimePickable(day, { hour, minute }, now = Date.now()) {
  if (!day) return false;
  return isAppointmentInFuture(buildAppointmentInstant({ ...day, hour, minute }), now);
}

/** The times offered, every 15 minutes, as a field appointment is never made to the minute. */
export function timeOptions(stepMinutes = 15) {
  const options = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    options.push({ hour, minute, label: `${pad(hour)}:${pad(minute)}` });
  }
  return options;
}
