import assert from "node:assert/strict";
import test from "node:test";
import { noAccessLedgerDetails } from "./noAccessLedger.js";

test("the saved U05 appointment displays its agreed SAST date and time", () => {
  assert.equal(noAccessLedgerDetails({ accessData: { access: {
    appointment: { at: "2026-10-06T08:00:00.000Z" },
  } } }).appointment, "Appointment: 06 Oct 2026, 10:00");
});

test("an appointment crossing midnight UTC displays the following SAST day", () => {
  assert.equal(noAccessLedgerDetails({ accessData: { access: {
    appointment: { at: "2026-12-31T22:30:00.000Z" },
  } } }).appointment, "Appointment: 01 Jan 2027, 00:30");
});

test("an absent appointment and an unreadable stored appointment are distinct", () => {
  for (const appointment of [undefined, null]) {
    assert.equal(noAccessLedgerDetails({ accessData: { access: { appointment } } }).appointment, "No appointment");
  }
  for (const appointment of [{}, { at: null }, { at: "invalid" }, "NAv"]) {
    assert.equal(noAccessLedgerDetails({ accessData: { access: { appointment } } }).appointment, "Appointment: NAv");
  }
});

test("a delayed office visit shows its field capture time and worker, not arrival or issuer", () => {
  const details = noAccessLedgerDetails({ metadata: {
    createdOnDevice: "2026-09-30T21:45:00.000Z",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-10-05T07:00:00.000Z",
    createdOnDeviceByUser: "Peter Peter",
    createdByUser: "Office Worker",
  } });
  assert.equal(details.visitDate, "30 Sep 2026");
  assert.equal(details.visitTime, "23:45");
  assert.equal(details.worker, "Peter Peter");
});

test("unknown or invalid capture time stays unknown even when a server time exists", () => {
  for (const createdOnDevice of [undefined, null, "", "NAv", "invalid"]) {
    const details = noAccessLedgerDetails({ metadata: {
      createdOnDevice, createdAt: "2026-10-05T07:00:00.000Z",
    } });
    assert.equal(details.visitDate, "NAv");
    assert.equal(details.visitTime, "NAv");
  }
});
