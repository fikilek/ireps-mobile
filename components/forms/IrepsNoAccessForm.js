// No Access rules NA-R001 (1.2.0) — the ONE No Access form in iREPS.
//
// Every transaction that can end in a no access renders this and nothing else of its own.
// It records one thing: the worker went to the property and could not touch the meter with
// their own hand. It does not decide the ERF, the premise or the address — those are settled
// before the work is ever issued.
//
// Three things, in this order (NA-R010):
//   1. NA Reason        required
//   2. NA Photograph    required for ordinary reasons; not required for a return visit
//   3. NA Appointment   required only for an agreed return visit
//
// It is grown from IrepsNoAccessSection, which it replaces. The reason selector and the
// photograph are that component's, unchanged in behaviour; the appointment is new.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFormikContext } from "formik";
import { useEffect, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Divider, Modal, Portal, Surface, TextInput } from "react-native-paper";

import { NO_ACCESS_REASONS, requiresNoAccessPhoto } from "../../src/features/meters/noAccessReasons";
import { changeNoAccessReason, isLegacySavedNoAccess, isReturnVisitReason } from "../../src/features/meters/noAccessAppointmentPolicy";
import { noAccessValidationDelay } from "../../src/features/meters/noAccessCapture";
import FormSelect from "./FormSelect";
import {
  WEEKDAY_INITIALS,
  buildAppointment,
  buildAppointmentInstant,
  formatAppointment,
  isDayPickable,
  isTimePickable,
  monthGrid,
  monthLabel,
  readAppointmentParts,
  stepMonth,
  timeOptions,
  todayInSast,
} from "../../src/features/meters/noAccessAppointment";
import { IrepsMedia } from "../media/IrepsMedia";
import { FORM_TEXT } from "../../src/theme/formColors";

const OTHER = "OTHER";
const TIMES = timeOptions();

export function IrepsNoAccessForm({
  visible = false,
  value = {},
  originalAccess = null,
  onChange,
  mediaName = "media",
  mediaTag = "noAccessPhoto",
  agentName,
  agentUid,
  fallbackGps,
  reasonErrorText = "",
  mediaErrorText = "",
  appointmentErrorText = "",
}) {
  const [dayOpen, setDayOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [month, setMonth] = useState(() => todayInSast());
  const [pickedDay, setPickedDay] = useState(null);
  const [pickerNow, setPickerNow] = useState(Date.now);
  const [timeError, setTimeError] = useState("");
  const { validateForm } = useFormikContext();
  const reasonCode = String(value?.reasonCode || "").trim();
  const reasonOther = String(value?.reasonOther || "");
  const appointment = value?.appointment || null;
  const isOther = reasonCode.toUpperCase() === OTHER;
  const returnVisit = isReturnVisitReason(reasonCode);
  const preservedAppointment = !returnVisit && appointment && isLegacySavedNoAccess(value, originalAccess);

  useEffect(() => {
    if (!visible || (!dayOpen && !timeOpen && !(returnVisit && appointment))) return;
    // Both the open picker and the closed form must notice when an agreement expires.
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now();
      setPickerNow(now);
      // On native, Formik refreshes its callback reference in a parent effect. This child
      // effect can run first, so validateForm() alone may revalidate the PREVIOUS values
      // and overwrite the change's errors until the next clock tick. Always pass this render.
      validateForm(value);
      timer = setTimeout(refresh, noAccessValidationDelay(value, originalAccess, now));
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [visible, dayOpen, timeOpen, returnVisit, appointment, value, originalAccess, validateForm]);

  const update = (patch) => onChange?.({ ...value, ...patch });

  function openCalendar() {
    const now = Date.now();
    setPickerNow(now);
    setMonth((appointment && readAppointmentParts(appointment.at)) || todayInSast(now));
    setPickedDay(null);
    setTimeError("");
    setTimeOpen(false);
    setDayOpen(true);
  }

  function pickDay(day) {
    const now = Date.now();
    const date = { year: month.year, month: month.month, day };
    setPickerNow(now);
    if (!isDayPickable(date, now)) return;
    // NA-R021: choosing the day opens the clock. Two taps, and the worker types nothing.
    setPickedDay(date);
    setTimeError("");
    setDayOpen(false);
    setTimeOpen(true);
  }

  function pickTime({ hour, minute }) {
    const now = Date.now();
    setPickerNow(now);
    if (!isTimePickable(pickedDay, { hour, minute }, now)) {
      setTimeError("That time has passed. Choose a later time or another day.");
      return;
    }
    const at = buildAppointmentInstant({ ...pickedDay, hour, minute });
    update({
      appointment: buildAppointment({ at, actor: { uid: agentUid, name: agentName }, now: new Date(now).toISOString() }),
    });
    setTimeOpen(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* One card, one border. There used to be a white card wrapped around a second card,
          so the inputs sat inside two borders for no reason. */}
      <Surface style={styles.card} elevation={1}>
          {/* 1. NA Reason — the standard iREPS dropdown (UI: label on top, "Select ...", then
              the chosen value). The same FormSelect every other form uses, so a worker meets
              one kind of dropdown everywhere and a change to it reaches all of them. */}
          <FormSelect label="NA REASON" name="reasonCode" options={NO_ACCESS_REASONS}
            getValuesForSelection={changeNoAccessReason}
            onValueChange={() => {
              setDayOpen(false);
              setTimeOpen(false);
              setTimeError("");
            }}
          />

          {!!reasonErrorText && <Text style={styles.errorText}>{reasonErrorText}</Text>}

          {isOther ? (
            <TextInput
              mode="outlined"
              label="Other NA Reason"
              value={reasonOther}
              onChangeText={(text) => update({ reasonOther: text, appointment: null })}
              placeholder="Enter no-access reason"
              multiline
              numberOfLines={3}
              error={Boolean(reasonErrorText)}
              style={styles.otherInput}
            />
          ) : null}

          {/* Evidence requirements begin only after a reason is selected. */}
          {requiresNoAccessPhoto(reasonCode) ? <>
          <Divider style={styles.divider} />
          <IrepsMedia
            name={mediaName}
            tag={mediaTag}
            agentName={agentName}
            agentUid={agentUid}
            fallbackGps={fallbackGps}
            required={true}
          />

          {!!mediaErrorText && <Text style={styles.errorText}>{mediaErrorText}</Text>}
          </> : null}

          {returnVisit ? <>
          <Divider style={styles.divider} />
          {/* 3. NA Appointment — required for the return-visit reason (NA-R020) */}
          <View style={[styles.appointmentSection, Boolean(appointmentErrorText) && styles.appointmentError]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="calendar-clock" size={18} color={appointmentErrorText ? "#dc2626" : "#0f766e"} />
            <Text style={[styles.sectionTitle, Boolean(appointmentErrorText) && styles.invalidTitle]}>NA Appointment</Text>
            <Text style={styles.required}>required</Text>
          </View>

          {appointment ? (
            <View>
              {/* NA-R022: one plain line, in the worker's own words and time. */}
              <Text style={[styles.appointmentLine, Boolean(appointmentErrorText) && styles.selectorError]}>{formatAppointment(appointment.at)}</Text>
              <View style={styles.appointmentButtons}>
                <TouchableOpacity style={styles.secondaryButton} onPress={openCalendar}>
                  <Text style={styles.secondaryButtonText}>CHANGE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => update({ appointment: null })}
                >
                  <Text style={styles.secondaryButtonText}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.appointmentButton, Boolean(appointmentErrorText) && styles.appointmentButtonError]} onPress={openCalendar} activeOpacity={0.8}>
              <MaterialCommunityIcons name="calendar-plus" size={20} color="#fff" />
              <Text style={styles.appointmentButtonText}>MAKE AN APPOINTMENT</Text>
            </TouchableOpacity>
          )}
          {!!appointmentErrorText && <Text style={styles.errorText} accessibilityRole="alert">{appointmentErrorText}</Text>}
          </View>
          </> : null}

          {preservedAppointment ? <Text style={styles.savedAppointment}>
            Previously arranged: {formatAppointment(appointment.at)}. This saved visit needs a reason and appointment that follow the current rule before it can be sent.
          </Text> : null}
          {!returnVisit && !!appointmentErrorText && <Text style={styles.errorText} accessibilityRole="alert">{appointmentErrorText}</Text>}
      </Surface>

      {/* The calendar */}
      <Portal>
        <Modal visible={returnVisit && dayOpen} onDismiss={() => setDayOpen(false)} contentContainerStyle={styles.modal}>
          <View style={styles.monthRow}>
            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() => setMonth(stepMonth(month.year, month.month, -1))}
            >
              <MaterialCommunityIcons name="chevron-left" size={28} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel(month.year, month.month)}</Text>
            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() => setMonth(stepMonth(month.year, month.month, 1))}
            >
              <MaterialCommunityIcons name="chevron-right" size={28} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text key={`${initial}-${index}`} style={styles.weekdayCell}>{initial}</Text>
            ))}
          </View>

          {monthGrid(month.year, month.month).map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((day, dayIndex) => {
                if (!day) return <View key={dayIndex} style={styles.dayCell} />;

                // A day already past is not offered at all, rather than letting a worker tap
                // it and be refused afterwards (NA-R023).
                const pickable = isDayPickable({ year: month.year, month: month.month, day }, pickerNow);

                // Today is marked, because a grid of identical squares gives a worker nothing
                // to place "tomorrow" or "next Tuesday" against.
                const today = todayInSast(pickerNow);
                const isToday =
                  day === today.day &&
                  month.month === today.month &&
                  month.year === today.year;

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      styles.dayCell,
                      pickable ? styles.dayPickable : styles.dayPast,
                      isToday && styles.dayToday,
                    ]}
                    disabled={!pickable}
                    onPress={() => pickDay(day)}
                  >
                    <Text
                      style={[
                        pickable ? styles.dayText : styles.dayTextPast,
                        isToday && styles.dayTodayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </Modal>
      </Portal>

      {/* The clock */}
      <Portal>
        <Modal visible={returnVisit && timeOpen} onDismiss={() => setTimeOpen(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.monthLabel}>What time?</Text>
          {!TIMES.some((option) => isTimePickable(pickedDay, option, pickerNow)) && (
            <Text style={styles.errorText}>No future times remain on this day. Choose another day.</Text>
          )}
          {!!timeError && <Text style={styles.errorText} accessibilityLiveRegion="polite">{timeError}</Text>}
          <ScrollView style={styles.timeList}>
            {TIMES.map((option) => {
              const pickable = isTimePickable(pickedDay, option, pickerNow);
              return (
                <TouchableOpacity
                  key={option.label}
                  style={styles.timeRow}
                  disabled={!pickable}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !pickable }}
                  onPress={() => pickTime(option)}
                >
                  <Text style={[styles.timeText, !pickable && styles.timeTextPast]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.changeDayButton} onPress={openCalendar}>
            <Text style={styles.secondaryButtonText}>CHANGE DAY</Text>
          </TouchableOpacity>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFF", padding: 20, borderRadius: 16, marginBottom: 16 },

  naCard: {
    backgroundColor: "#fef2f2", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#fecaca", marginBottom: 16,
  },

  sectionHeader: {
    padding: 10, backgroundColor: "#E2E8F0", flexDirection: "row",
    alignItems: "center", gap: 8, marginBottom: 12,
  },

  sectionTitle: { fontSize: 14, fontWeight: "bold", color: FORM_TEXT },
  invalidTitle: { color: "#dc2626" },
  required: { fontSize: 11, fontWeight: "700", color: FORM_TEXT, marginLeft: "auto" },
  savedAppointment: { color: "#0f766e", fontSize: 13, lineHeight: 19, marginTop: 15 },

  selector: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 15, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, backgroundColor: "#fff",
  },

  selectorError: { borderColor: "#dc2626" },
  selectorValue: { flex: 1, fontSize: 16, fontWeight: "600", color: FORM_TEXT },
  otherInput: { marginTop: 12, backgroundColor: "#fff" },
  divider: { marginVertical: 15 },

  appointmentButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#0f766e", paddingVertical: 16, borderRadius: 8,
  },
  appointmentSection: { borderWidth: 1, borderColor: "transparent", borderRadius: 10, padding: 10 },
  appointmentError: { borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  appointmentButtonError: { backgroundColor: "#dc2626" },

  appointmentButtonText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },

  appointmentLine: {
    fontSize: 16, fontWeight: "700", color: FORM_TEXT, backgroundColor: "#fff",
    borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 15,
  },

  appointmentButtons: { flexDirection: "row", gap: 10, marginTop: 10 },

  secondaryButton: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderWidth: 1, borderColor: "#0f766e", borderRadius: 8, backgroundColor: "#fff",
  },

  secondaryButtonText: { color: "#0f766e", fontWeight: "800", fontSize: 13 },

  modal: { backgroundColor: "white", padding: 20, margin: 20, borderRadius: 12 },

  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthArrow: { padding: 8 },
  monthLabel: { fontSize: 16, fontWeight: "800", color: FORM_TEXT },

  weekRow: { flexDirection: "row", justifyContent: "space-between" },

  weekdayCell: {
    flex: 1, textAlign: "center", fontSize: 12, fontWeight: "800",
    color: FORM_TEXT, paddingVertical: 6,
  },

  // A field worker taps this with a thumb, often in sunlight.
  dayCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", margin: 2, borderRadius: 8 },
  dayPickable: { backgroundColor: "#f1f5f9" },
  // Today: ringed in the appointment colour, so the worker can count forward from it.
  dayToday: { borderWidth: 2, borderColor: "#0f766e", backgroundColor: "#ffffff" },
  dayTodayText: { color: "#0f766e", fontWeight: "800" },
  dayPast: { backgroundColor: "transparent" },
  dayText: { fontSize: 16, fontWeight: "700", color: FORM_TEXT },
  dayTextPast: { fontSize: 16, color: "#cbd5e1" },

  timeList: { maxHeight: 320 },
  timeRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  timeText: { fontSize: 18, fontWeight: "700", color: FORM_TEXT, textAlign: "center" },
  timeTextPast: { color: "#cbd5e1" },
  changeDayButton: {
    alignItems: "center", paddingVertical: 12, marginTop: 12,
    borderWidth: 1, borderColor: "#0f766e", borderRadius: 8,
  },

  errorText: { color: "#DC2626", fontSize: 11, fontWeight: "800", marginTop: 6 },
});
