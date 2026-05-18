import { MockExternalAction } from "../types";
import { isDemo, nanoid } from "./util";

export interface BookingInput {
  attendee_email: string;
  attendee_name: string;
  duration_minutes: number;
  topic: string;
}

function nextTuesdayAt(hour = 10): Date {
  const d = new Date();
  const day = d.getDay(); // 0..6 Sun..Sat
  const delta = (2 + 7 - day) % 7 || 7; // upcoming Tuesday (always future)
  d.setDate(d.getDate() + delta);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export const calendar = {
  async bookMeeting(input: BookingInput): Promise<MockExternalAction> {
    const when = nextTuesdayAt(10);
    const niceWhen = when.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
      timeZoneName: "short",
    });
    const detail = `Booked ${input.duration_minutes}m with ${input.attendee_name} (${input.attendee_email}) — ${niceWhen}. Topic: ${input.topic}.`;
    if (isDemo(process.env.GOOGLE_CALENDAR_ID)) {
      return {
        name: "google_calendar.events.insert",
        ok: true,
        ref: nanoid("evt"),
        detail: detail + " (demo)",
      };
    }
    return {
      name: "google_calendar.events.insert",
      ok: true,
      ref: nanoid("evt"),
      detail,
    };
  },
  nextSlotLabel(): string {
    const when = nextTuesdayAt(10);
    return when.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
      timeZoneName: "short",
    });
  },
};
