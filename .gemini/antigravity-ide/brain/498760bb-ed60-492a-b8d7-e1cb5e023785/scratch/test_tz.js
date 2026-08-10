function formatIsoWithTimezone(localIsoStr, timeZoneStr) {
  try {
    const rawIso = localIsoStr.split("+")[0].split("Z")[0];
    const parts = rawIso.split("T");
    const datePart = parts[0];
    const timePart = parts[1] || "09:00:00";
    if (!datePart) return localIsoStr;

    const [h, m] = timePart.split(":");
    const cleanTime = `${String(h || "09").padStart(2, "0")}:${String(m || "00").padStart(2, "0")}:00`;

    const targetTz = timeZoneStr || "Asia/Kolkata";

    // Reference date in UTC to measure local offset of targetTz at that date
    const refDate = new Date(`${datePart}T12:00:00Z`);
    const tzDateStr = refDate.toLocaleString("en-US", { timeZone: targetTz });
    const utcDateStr = refDate.toLocaleString("en-US", { timeZone: "UTC" });

    console.log("refDate:", refDate.toISOString());
    console.log("tzDateStr:", tzDateStr);
    console.log("utcDateStr:", utcDateStr);

    const tzDate = new Date(tzDateStr);
    const utcDate = new Date(utcDateStr);
    console.log("tzDate.getTime():", tzDate.getTime());
    console.log("utcDate.getTime():", utcDate.getTime());

    const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / (60 * 1000));
    console.log("diffMinutes:", diffMinutes);

    const sign = diffMinutes >= 0 ? "+" : "-";
    const absMinutes = Math.abs(diffMinutes);
    const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
    const offsetMins = String(absMinutes % 60).padStart(2, "0");
    const offsetStr = `${sign}${offsetHours}:${offsetMins}`;

    return `${datePart}T${cleanTime}${offsetStr}`;
  } catch (err) {
    console.error("Error formatting ISO with timezone offset:", err);
    return `${localIsoStr.split("+")[0].split("Z")[0]}+05:30`;
  }
}

console.log("RESULT:", formatIsoWithTimezone("2026-07-25T11:00:00", "Asia/Kolkata"));
