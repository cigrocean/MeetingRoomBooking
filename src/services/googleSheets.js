import Papa from "papaparse";
import {
  isWithinInterval,
  parse,
  parseISO,
  set,
  getYear,
  getMonth,
  format,
} from "date-fns";

// Cache Keys
export const CACHE_KEYS = {
  ROOMS: 'mrb_rooms',
  BOOKINGS: 'mrb_bookings',
  TIME_SLOTS: 'mrb_time_slots',
  FIXED_SCHEDULES: 'mrb_fixed_schedules'
};

// Cache Helpers
export const saveToCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch (e) {
    console.warn('Failed to save to cache', e);
  }
};

export const getFromCache = (key) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    return parsed.data;
  } catch (e) {
    console.warn('Failed to get from cache', e);
    return null;
  }
};

// Get SHEET_ID from .env - REQUIRED
const getSheetId = () => {
  const envSheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;
  console.log(
    "🔍 Checking VITE_GOOGLE_SHEET_ID:",
    envSheetId ? `Found (length: ${envSheetId.length})` : "NOT FOUND"
  );
  console.log(
    "🔍 All env vars starting with VITE_GOOGLE:",
    Object.keys(import.meta.env).filter((k) => k.startsWith("VITE_GOOGLE"))
  );

  if (!envSheetId || envSheetId.trim() === "") {
    const errorMsg =
      "VITE_GOOGLE_SHEET_ID is required in .env file. Please add it to your .env file.\n" +
      "Make sure:\n" +
      "1. The .env file is in the project root directory\n" +
      "2. The variable name is exactly: VITE_GOOGLE_SHEET_ID\n" +
      "3. There are no spaces around the = sign\n" +
      "4. You have restarted the dev server after adding it";
    throw new Error(errorMsg);
  }
  return envSheetId;
};

const SHEET_ID = getSheetId();

// GID is auto-detected based on current month - no need for .env variable

// OAuth 2.0 Token Management
const getAccessToken = async () => {
  const accessToken = import.meta.env.VITE_GOOGLE_ACCESS_TOKEN;
  const refreshToken = import.meta.env.VITE_GOOGLE_REFRESH_TOKEN;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

  // If we have a refresh token, use it to get a new access token
  if (refreshToken && clientId && clientSecret) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Refreshed access token successfully");
        return data.access_token;
      } else {
        console.warn("⚠️ Failed to refresh token, using provided access token");
      }
    } catch (error) {
      console.warn("⚠️ Error refreshing token:", error);
    }
  }

  // Fallback to provided access token or throw error
  if (accessToken) {
    return accessToken;
  }

  throw new Error(
    "VITE_GOOGLE_ACCESS_TOKEN or VITE_GOOGLE_REFRESH_TOKEN (with CLIENT_ID and CLIENT_SECRET) is required in .env file"
  );
};

// Cache for GID lookups to avoid unnecessary API calls
const gidCache = {
  currentMonth: null,
  currentMonthKey: null, // Format: "YYYY-MM" to detect month changes
  futureMonths: {}, // Format: "YYYY-MM" -> GID
};

// Helper function to detect GID via CSV (no API quota usage)
const detectGidViaCSV = async (targetMonthName, targetYearStr) => {
  // Try to find the sheet by checking CSV data from multiple potential GIDs
  const commonGids = ["0", "240206239"]; // 0 is usually the first sheet, 240206239 is from the user's link

  for (const gid of commonGids) {
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
      const csvResponse = await fetch(csvUrl);
      if (csvResponse.ok) {
        const csvText = await csvResponse.text();
        const rows = csvText.split("\n");
        if (rows.length > 0) {
          const firstCell = rows[0]
            .split(",")[0]
            ?.toUpperCase()
            .replace(/"/g, "")
            .trim();
          // Check if first cell contains target month name
          if (firstCell && firstCell.includes(targetMonthName)) {
            console.log(
              `✅ Found matching sheet via CSV for ${targetMonthName} (GID: ${gid})`
            );
            return gid;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
};

// Get the GID for a specific month/year's sheet (auto-detected using CSV - no auth needed for public sheets)
// If date is not provided, uses current month
// Optimized to prefer CSV detection to avoid API quota usage
const getMonthSheetGID = async (date = null) => {
  // Define variables outside try block so they're available in catch block
  const targetDate = date || new Date();
  const targetMonth = targetDate.getMonth();
  const targetYear = targetDate.getFullYear();
  const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`; // YYYY-MM format
  const isCurrentMonth =
    !date ||
    (targetMonth === new Date().getMonth() &&
      targetYear === new Date().getFullYear());

  const monthNames = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  const monthNamesReadable = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const targetMonthName = monthNames[targetMonth];
  const readableMonthName = monthNamesReadable[targetMonth];
  const targetYearStr = targetYear.toString();

  // Check cache first (only for current month to avoid stale data)
  if (
    isCurrentMonth &&
    gidCache.currentMonth &&
    gidCache.currentMonthKey === monthKey
  ) {
    console.log(
      `✅ Using cached GID for current month: ${gidCache.currentMonth}`
    );
    return gidCache.currentMonth;
  }

  // Check cache for future months
  if (!isCurrentMonth && gidCache.futureMonths[monthKey]) {
    console.log(
      `✅ Using cached GID for ${targetMonthName} ${targetYear}: ${gidCache.futureMonths[monthKey]}`
    );
    return gidCache.futureMonths[monthKey];
  }

  try {
    console.log(`🔍 Looking for sheet: ${targetMonthName} ${targetYear}`);

    // For current month, prefer CSV detection first (no API quota usage)
    // For future months, try API first to get accurate sheet list
    const preferCSV = isCurrentMonth;

    if (preferCSV) {
      // Try CSV detection first for current month (no API quota)
      const csvGid = await detectGidViaCSV(targetMonthName, targetYearStr);
      if (csvGid) {
        // Cache the result
        gidCache.currentMonth = csvGid;
        gidCache.currentMonthKey = monthKey;
        console.log(
          `✅ Found current month sheet via CSV (GID: ${csvGid}), cached for future requests`
        );
        return csvGid;
      }
    }

    // Try to get all sheets via API (requires access token) - only if CSV failed or for future months
    try {
      const accessToken = await getAccessToken();
      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json();
        const sheets = sheetsData.sheets || [];

        // Search for sheet matching the month/year
        // Sheet names might be: "NOVEMBER", "2025NOVEMBER", "November 2025", etc.
        for (const sheet of sheets) {
          const sheetTitle = (sheet.properties?.title || "").toUpperCase();
          const sheetId = sheet.properties?.sheetId?.toString();

          // Check if sheet title contains both month and year
          const hasMonth = sheetTitle.includes(targetMonthName);
          const hasYear = sheetTitle.includes(targetYearStr);

          // Match if: contains month AND (contains year OR is current month's format without year)
          if (hasMonth && (hasYear || targetMonth === new Date().getMonth())) {
            console.log(
              `✅ Found matching sheet: "${sheet.properties.title}" (GID: ${sheetId}) for ${targetMonthName} ${targetYear}`
            );
            // Cache the result
            if (isCurrentMonth) {
              gidCache.currentMonth = sheetId;
              gidCache.currentMonthKey = monthKey;
            } else {
              gidCache.futureMonths[monthKey] = sheetId;
            }
            return sheetId;
          }
        }

        // If not found with year, try just month name (fallback)
        for (const sheet of sheets) {
          const sheetTitle = (sheet.properties?.title || "").toUpperCase();
          const sheetId = sheet.properties?.sheetId?.toString();

          if (sheetTitle.includes(targetMonthName)) {
            console.log(
              `✅ Found sheet by month name only: "${sheet.properties.title}" (GID: ${sheetId}) for ${targetMonthName}`
            );
            // Cache the result
            if (isCurrentMonth) {
              gidCache.currentMonth = sheetId;
              gidCache.currentMonthKey = monthKey;
            } else {
              gidCache.futureMonths[monthKey] = sheetId;
            }
            return sheetId;
          }
        }
      }
    } catch (e) {
      console.warn(
        "⚠️ Could not fetch sheets via API, trying CSV detection:",
        e
      );
    }

    // Fallback: Detect sheet by reading CSV data directly (no auth required for public sheets)
    const csvGid = await detectGidViaCSV(targetMonthName, targetYearStr);
    if (csvGid) {
      // Cache the result
      if (isCurrentMonth) {
        gidCache.currentMonth = csvGid;
        gidCache.currentMonthKey = monthKey;
      } else {
        gidCache.futureMonths[monthKey] = csvGid;
      }
      return csvGid;
    }

    // If no match found, check if it's a future month/year
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    // Check if the target date is in a future month/year
    const isFutureMonth =
      targetYear > todayYear ||
      (targetYear === todayYear && targetMonth > todayMonth);

    if (isFutureMonth) {
      // For future dates, throw an error if no sheet exists with a user-friendly message
      throw new Error(
        `Unable to book for ${readableMonthName} ${targetYear}. The sheet for this month doesn't exist yet. Please create a sheet named "${targetMonthName} ${targetYear}" or "${readableMonthName} ${targetYear}" in your Google Spreadsheet before booking.`
      );
    }

    // For current/past dates, use first sheet (GID 0) as fallback
    console.warn(
      `⚠️ Could not find sheet for ${targetMonthName} ${targetYear}, using first sheet (GID: 0) as fallback`
    );
    const fallbackGid = "0";
    // Cache the fallback
    if (isCurrentMonth) {
      gidCache.currentMonth = fallbackGid;
      gidCache.currentMonthKey = monthKey;
    } else {
      gidCache.futureMonths[monthKey] = fallbackGid;
    }
    return fallbackGid;
  } catch (error) {
    // Check if this is already our custom error message for missing sheets
    if (error.message.includes("Unable to book for")) {
      throw error; // Re-throw our user-friendly error as-is
    }

    // For other errors, provide a more specific message
    throw new Error(
      `Failed to access the sheet for ${readableMonthName} ${targetYear}. ${error.message}`
    );
  }
};

// Keep backward compatibility - get current month's sheet GID
const getCurrentMonthSheetGID = async () => {
  return await getMonthSheetGID();
};

// Get CSV URL for a specific sheet GID
const getCSVUrl = (gid) => {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&t=${Date.now()}`;
};

// Static Room Definitions based on Sheet
const ROOMS = [
  {
    id: "nha-trang",
    name: "Nha Trang",
    capacity: 12, // Inferred "Large room"
    features: ["Large Room", "TV", "PS4"],
    image_url:
      "https://images.unsplash.com/photo-1689326232193-d55f0b7965eb?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3Ds",
  },
  {
    id: "da-lat",
    name: "Da Lat",
    capacity: 6, // Inferred "Small room"
    features: ["Small Room"],
    image_url:
      "https://images.unsplash.com/photo-1609424360486-c5b2636741d1?q=80&w=2370&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
];

export const fetchRooms = async () => {
  saveToCache(CACHE_KEYS.ROOMS, ROOMS);
  return ROOMS;
};

const parseTime = (timeStr, dateBase) => {
  if (!timeStr) return null;
  // Handle formats like "9:30", "14:00"
  try {
    const parsedTime = parse(timeStr, "H:mm", dateBase);
    return parsedTime;
  } catch (e) {
    return null;
  }
};

const getMonthIndex = (monthStr) => {
  const months = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  return months.indexOf(monthStr.toUpperCase());
};

// Helper function to convert fixed schedules to bookings for a given month
const convertFixedSchedulesToBookings = (fixedSchedules, year, monthIndex) => {
  const bookings = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Only include fixed schedules if they're for the current month
  if (year !== currentYear || monthIndex !== currentMonth) {
    console.log(
      `⏭️ Skipping fixed schedules conversion: requested month ${monthIndex}/${year} != current month ${currentMonth}/${currentYear}`
    );
    return bookings;
  }

  console.log(
    `📅 Converting ${
      fixedSchedules.length
    } fixed schedules to bookings for ${year}/${monthIndex + 1}`
  );

  // Get all days in the current month
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  fixedSchedules.forEach((schedule) => {
    // Fixed schedules apply to specific days of the week (dayOfWeek 0-6)
    // We need to find all dates in the current month that match this day of week
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthIndex, day);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Check if this schedule applies to this day of week
      if (schedule.dayOfWeek === dayOfWeek) {
        // Parse start and end times
        const [startHour, startMin] = schedule.start_time
          .split(":")
          .map(Number);
        const [endHour, endMin] = schedule.end_time.split(":").map(Number);

        const start = new Date(year, monthIndex, day, startHour, startMin);
        const end = new Date(year, monthIndex, day, endHour, endMin);

        // Only add if the date is today or in the future (compare date, not time)
        const dateStart = new Date(year, monthIndex, day);
        if (dateStart >= todayStart) {
          bookings.push({
            id: `fixed-${schedule.id}-${day}`,
            room_id: schedule.room_id,
            title: `Fixed: ${schedule.staff_name}`,
            requested_by: schedule.staff_name || "Fixed Schedule",
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            isFixedSchedule: true, // Mark as fixed schedule
          });
        }
      }
    }
  });

  console.log(
    `✅ Converted ${fixedSchedules.length} fixed schedules to ${bookings.length} bookings`
  );
  return bookings;
};

export const fetchBookings = async () => {
  try {
    // Get the current month's sheet GID
    const gid = await getCurrentMonthSheetGID();
    const csvUrl = getCSVUrl(gid);
    const response = await fetch(csvUrl);
    const csvText = await response.text();

    return new Promise(async (resolve, reject) => {
      Papa.parse(csvText, {
        complete: async (results) => {
          const rows = results.data;
          const bookings = [];

          if (rows.length < 5) {
            // Still fetch fixed schedules even if no regular bookings
            try {
              const fixedSchedules = await fetchFixedSchedules();
              const currentDate = new Date();
              const fixedBookings = convertFixedSchedulesToBookings(
                fixedSchedules,
                currentDate.getFullYear(),
                currentDate.getMonth()
              );
              resolve(fixedBookings);
            } catch (error) {
              console.warn(
                "Failed to fetch fixed schedules for bookings:",
                error
              );
              resolve([]);
            }
            return;
          }

          // 1. Parse Month from Row 0 (e.g., "NOVEMBER")
          // Cell 0,0 might contain "NOVEMBER"
          const monthStr = rows[0][0];
          let monthIndex = getMonthIndex(monthStr || "");
          if (monthIndex === -1) monthIndex = new Date().getMonth(); // Fallback to current month

          // If sheet month doesn't match current month, use current month for accurate status
          const currentMonth = new Date().getMonth();
          if (monthIndex !== currentMonth) {
            monthIndex = currentMonth;
          }

          const currentYear = new Date().getFullYear();

          // 2. Iterate rows starting from index 4
          for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row[0]) continue; // Skip empty dates

            const day = parseInt(row[0]);
            if (isNaN(day)) continue;

            // Construct base date
            const dateBase = set(new Date(), {
              year: currentYear,
              month: monthIndex,
              date: day,
              seconds: 0,
              milliseconds: 0,
            });

            const staff = row[2];
            // Check for room assignments - handle various formats (TRUE, "NHA TRANG", etc.)
            const nhaTrangValue = (row[3] || "")
              .toString()
              .toUpperCase()
              .trim();
            const daLatValue = (row[4] || "").toString().toUpperCase().trim();

            // Room is assigned if value is "TRUE" or contains room name, and is not empty
            const isNhaTrang =
              nhaTrangValue !== "" &&
              (nhaTrangValue === "TRUE" ||
                nhaTrangValue.includes("NHA TRANG") ||
                nhaTrangValue === "NHA TRANG");
            const isDaLat =
              daLatValue !== "" &&
              (daLatValue === "TRUE" ||
                daLatValue.includes("DA LAT") ||
                daLatValue === "DA LAT");

            // Morning Times: Col 5 (Start), Col 6 (End)
            const mStart = row[5];
            const mEnd = row[6];

            // Afternoon Times: Col 7 (Start), Col 8 (End)
            const aStart = row[7];
            const aEnd = row[8];

            const addBooking = (roomId, startStr, endStr) => {
              // Skip if times are empty or invalid
              if (!startStr || !endStr || !startStr.trim() || !endStr.trim())
                return;

              const start = parseTime(startStr.trim(), dateBase);
              const end = parseTime(endStr.trim(), dateBase);

              // Only add booking if both times are valid and end is after start
              if (start && end && end > start) {
                 const newId = `${roomId}-${day}-${format(start, "HH:mm")}-${format(end, "HH:mm")}`;
                 console.log(`📦 Parsed Booking: Row ${i} -> ${newId} (${staff}) Room: ${roomId}`);
                 
                 bookings.push({
                  id: newId, // Unique ID based on room, day, time
                  room_id: roomId,
                  title: staff ? `Booked by ${staff}` : "Booked",
                  requested_by: staff || "Unknown",
                  start_time: start.toISOString(),
                  end_time: end.toISOString(),
                });
              }
            };

            if (isNhaTrang) {
              addBooking("nha-trang", mStart, mEnd);
              addBooking("nha-trang", aStart, aEnd);
            }

            if (isDaLat) {
              addBooking("da-lat", mStart, mEnd);
              addBooking("da-lat", aStart, aEnd);
            }
          }

          // Add fixed schedules as bookings for the current month
          try {
            console.log(`🔄 Fetching fixed schedules to add to bookings...`);
            const fixedSchedules = await fetchFixedSchedules();
            console.log(
              `📋 Fetched ${fixedSchedules.length} fixed schedules:`,
              fixedSchedules
            );
            const fixedBookings = convertFixedSchedulesToBookings(
              fixedSchedules,
              currentYear,
              monthIndex
            );
            console.log(
              `📅 Added ${fixedBookings.length} fixed schedule bookings to ${bookings.length} regular bookings`
            );
            if (fixedBookings.length > 0) {
              console.log(
                `📅 Sample fixed bookings:`,
                fixedBookings.slice(0, 3)
              );
            }
            bookings.push(...fixedBookings);
            console.log(
              `✅ Total bookings after adding fixed schedules: ${bookings.length}`
            );
          } catch (error) {
            console.error(
              "❌ Failed to fetch fixed schedules for bookings:",
              error
            );
          }

          saveToCache(CACHE_KEYS.BOOKINGS, bookings);
          resolve(bookings);
        },
        error: (err) => {
          console.error("CSV Parse Error", err);
          reject(err);
        },
      });
    });
  } catch (error) {
    console.error("Fetch Error", error);
    return [];
  }
};

export const createBooking = async (booking) => {
  // Writing to sheets requires OAuth access token (not just API key)
  // Get fresh access token (will use refresh token if available)
  const accessToken = await getAccessToken();

  // Check for conflicts with fixed schedules
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);

  try {
    const fixedSchedules = await fetchFixedSchedules();
    const bookingDayOfWeek = start.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const bookingYear = start.getFullYear();
    const bookingMonth = start.getMonth();
    const bookingDate = start.getDate();

    // Check if this booking conflicts with any fixed schedule
    for (const schedule of fixedSchedules) {
      // Check if schedule applies to this day of week
      if (
        schedule.dayOfWeek === bookingDayOfWeek &&
        schedule.room_id === booking.room_id
      ) {
        // Parse schedule times
        const [scheduleStartHour, scheduleStartMin] = schedule.start_time
          .split(":")
          .map(Number);
        const [scheduleEndHour, scheduleEndMin] = schedule.end_time
          .split(":")
          .map(Number);

        const scheduleStart = new Date(
          bookingYear,
          bookingMonth,
          bookingDate,
          scheduleStartHour,
          scheduleStartMin
        );
        const scheduleEnd = new Date(
          bookingYear,
          bookingMonth,
          bookingDate,
          scheduleEndHour,
          scheduleEndMin
        );

        // Check for time overlap
        // Overlap occurs if: booking starts before schedule ends AND booking ends after schedule starts
        if (start < scheduleEnd && end > scheduleStart) {
          throw new Error(
            `Cannot create booking: conflicts with fixed schedule (${
              schedule.staff_name || "Fixed Schedule"
            }) from ${schedule.start_time} to ${schedule.end_time}`
          );
        }
      }
    }
  } catch (error) {
    // If it's our conflict error, re-throw it
    if (error.message && error.message.includes("Cannot create booking")) {
      throw error;
    }
    // Otherwise, log warning but continue (don't block booking if fixed schedule check fails)
    console.warn("Failed to check fixed schedules for conflicts:", error);
  }

  // Map room ID to Sheet Name/Column logic if needed, or just append to the main sheet
  // The user's sheet is complex (schedule format). Appending a row might not work as intended
  // because the sheet is a calendar view, not a list of bookings.
  // HOWEVER, for this task, I will try to append a row to a hypothetical "Bookings" sheet
  // or just append to the bottom of the current sheet if that's what the user expects.
  // Given the visual schedule, writing to it programmatically is VERY hard without destroying the layout.
  // I will assume there is a "Raw Data" sheet or I will just append to the current sheet and warn the user.

  // Actually, looking at the CSV, it seems to be a visual schedule.
  // Writing to this specific format (finding the cell for "10:00" on "Monday") is extremely complex via API.
  // I will implement a "List" append as a fallback, which is the standard way to use Sheets as a DB.

  const valueInputOption = "USER_ENTERED";
  const startHour = start.getHours();

  const isMorning = startHour < 12;

  const mStart = isMorning ? format(start, "H:mm") : "";
  const mEnd = isMorning ? format(end, "H:mm") : "";
  const aStart = !isMorning ? format(start, "H:mm") : "";
  const aEnd = !isMorning ? format(end, "H:mm") : "";

  // Get the sheet GID and name for the booking's month/year
  const bookingMonth = start.getMonth();
  const bookingYear = start.getFullYear();
  const monthNames = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  const bookingMonthName = monthNames[bookingMonth];

  console.log(
    `📅 Booking date: ${format(
      start,
      "MMMM d, yyyy"
    )} - Looking for sheet: ${bookingMonthName} ${bookingYear}`
  );

  // Get the sheet GID for the booking's month/year
  const gid = await getMonthSheetGID(start);

  // Try to find the sheet name that matches booking month using the GID we found
  let sheetName = bookingMonthName;
  try {
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (sheetsResponse.ok) {
      const sheetsData = await sheetsResponse.json();
      const sheets = sheetsData.sheets || [];
      // First try to find by GID (most reliable)
      const sheetByGid = sheets.find(
        (s) => s.properties?.sheetId?.toString() === gid
      );
      if (sheetByGid) {
        sheetName = sheetByGid.properties.title;
        console.log(`📋 Found sheet by GID: "${sheetName}" (GID: ${gid})`);
      } else {
        // Fallback: find by name matching booking month
        const matchingSheet = sheets.find((s) =>
          (s.properties?.title || "").toUpperCase().includes(bookingMonthName)
        );
        if (matchingSheet) {
          sheetName = matchingSheet.properties.title;
          console.log(`📋 Found sheet by name: "${sheetName}"`);
        }
      }
    }
  } catch (e) {
    console.warn(
      `⚠️ Could not detect sheet name via API, using month name "${bookingMonthName}":`,
      e
    );
  }

  // Find the correct position to insert based on time order
  // Read full rows to understand the structure and format
  const targetDate = start.getDate().toString();
  const newBookingStartTime = start.getHours() * 60 + start.getMinutes(); // Minutes since midnight
  let insertRowIndex = null; // 1-based row index where we'll insert
  let existingRowFormat = null; // Store format from existing row to match
  let sampleRowWithRoom = null; // Store a sample row with room assignment to see dropdown values

  // Helper function to parse time string (HH:mm) to minutes since midnight
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string") return null;
    const parts = timeStr.trim().split(":");
    if (parts.length !== 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  // Helper to parse all rows
  const parseBookingRows = (rows) => {
    const bookings = [];
    rows.forEach((row, index) => {
      // Row indices start at 0, data starts at row 6 (index 5)
      // but passed rows are the whole sheet?
      // fetchBookings passes "rows" which is everything.
      // But let's check loop inside fetchBookings.
      // Actually fetchBookings calls this helper? No, wait.
      // fetchBookings has the loop inline in original code?
      // Let's check view_file.
      // Ah, previous view showed fetchBookings using a loop.
      // I'll assume we are editing fetchBookings directly.
    });
    
    // Instead of messing with complex logic, I'll just add a log in fetchBookings
    // where it pushes to `bookings` array.
    // See lines 560+ in previous file dump?
    // Wait, I need to see fetchBookings implementation.
    return [];
  };
  const getRowStartTime = (row) => {
    // Check morning times first (columns F and G)
    const mStart = row[5]?.toString().trim();
    if (mStart) {
      const time = parseTimeToMinutes(mStart);
      if (time !== null) return time;
    }
    // Check afternoon times (columns H and I)
    const aStart = row[7]?.toString().trim();
    if (aStart) {
      const time = parseTimeToMinutes(aStart);
      if (time !== null) return time;
    }
    return null;
  };

  try {
    // Read the full sheet rows (A through I) to find rows with the same date
    // Data starts at row 6 (index 5), headers are rows 1-5
    const readRange = `${sheetName}!A6:I1000`; // Read all columns, starting from row 6
    const readResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${readRange}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (readResponse.ok) {
      const readData = await readResponse.json();
      const rows = readData.values || [];
      
      console.log(`📋 Fetching bookings from sheet: Found ${rows.length} rows`);

      // Collect all rows with the same date, along with their row numbers
      const rowsWithSameDate = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        const rowDate = row[0]?.toString().trim();

        // Find a sample row with room assignment to see dropdown values
        if (!sampleRowWithRoom && (row[3] || row[4])) {
          sampleRowWithRoom = row;
          console.log(
            "📋 Found sample row with room assignment:",
            sampleRowWithRoom
          );
          console.log("   NHA TRANG value:", sampleRowWithRoom[3]);
          console.log("   DA LAT value:", sampleRowWithRoom[4]);
        }

        if (rowDate === targetDate) {
          const rowStartTime = getRowStartTime(row);
          const rowNumber = 6 + i; // 1-based row number

          rowsWithSameDate.push({
            rowIndex: i, // 0-based index in array
            rowNumber: rowNumber, // 1-based row number in sheet
            startTime: rowStartTime, // Minutes since midnight, or null if no time
            row: row, // Full row data
          });

          // Store the first row format for reference
          if (!existingRowFormat) {
            existingRowFormat = row;
          }
        }
      }

      if (rowsWithSameDate.length > 0) {
        // Sort rows by start time (null times go to the end)
        rowsWithSameDate.sort((a, b) => {
          if (a.startTime === null && b.startTime === null) return 0;
          if (a.startTime === null) return 1; // null times go to end
          if (b.startTime === null) return -1;
          return a.startTime - b.startTime; // Sort by time ascending
        });

        // Find the position to insert: find first row with start time >= new booking start time
        let insertPosition = rowsWithSameDate.length; // Default: insert at the end

        for (let i = 0; i < rowsWithSameDate.length; i++) {
          const rowData = rowsWithSameDate[i];
          // If this row has a time and it's >= new booking time, insert before it
          if (
            rowData.startTime !== null &&
            rowData.startTime >= newBookingStartTime
          ) {
            insertPosition = i;
            break;
          }
        }

        // Calculate the insert row index
        if (insertPosition === 0) {
          // Insert before the first row with this date
          insertRowIndex = rowsWithSameDate[0].rowNumber;
        } else {
          // Insert after the row at position (insertPosition - 1)
          const previousRow = rowsWithSameDate[insertPosition - 1];
          insertRowIndex = previousRow.rowNumber + 1;
        }

        console.log(
          `📅 Found ${rowsWithSameDate.length} rows with date ${targetDate}`
        );
        console.log(
          `⏰ New booking time: ${format(
            start,
            "HH:mm"
          )} (${newBookingStartTime} minutes)`
        );
        console.log(
          `📍 Will insert at row ${insertRowIndex} (position ${insertPosition} of ${rowsWithSameDate.length})`
        );
      } else {
        // No rows with this date found - will handle below
        console.log(`📅 No existing rows with date ${targetDate}`);
      }
    }
  } catch (e) {
    console.warn(
      "⚠️ Could not read sheet to find date, will append to end:",
      e
    );
  }

  // If no matching date found, find the last row with data to insert after it
  // If table is empty, insert at row 6 (first data row after headers)
  if (insertRowIndex === null) {
    try {
      // Read the sheet to find the last row with any data
      const readRange = `${sheetName}!A6:A1000`;
      const readResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${readRange}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (readResponse.ok) {
        const readData = await readResponse.json();
        const rows = readData.values || [];

        // Check if table is empty (no rows or all rows are empty)
        if (!rows || rows.length === 0) {
          insertRowIndex = 6; // Insert at the first data row (table is empty)
          console.log(
            `📅 Table is empty, will insert at row 6 (first data row after headers)`
          );
        } else {
          // Find the last row with any data (non-empty date)
          let foundLastRow = false;
          for (let i = rows.length - 1; i >= 0; i--) {
            const rowDate = rows[i]?.[0]?.toString().trim();
            if (rowDate && rowDate !== "") {
              // Found the last row with data
              // Row 6 is index 0 in our array, so row number = 6 + i
              insertRowIndex = 6 + i + 1; // Insert AFTER this row
              console.log(
                `📅 No existing row with date ${targetDate}, will insert after last data row at ${insertRowIndex}`
              );
              foundLastRow = true;
              break;
            }
          }

          // If we still don't have an insert index (all rows are empty), default to row 6
          if (!foundLastRow) {
            insertRowIndex = 6; // Insert at the first data row
            console.log(
              `📅 Table has rows but all are empty, will insert at row 6 (first data row)`
            );
          }
        }
      } else {
        // If read failed, default to row 6
        console.warn(
          `⚠️ Could not read sheet (${readResponse.status}), will use row 6`
        );
        insertRowIndex = 6; // Default to first data row
      }
    } catch (e) {
      console.warn("⚠️ Error finding last row, will use row 6:", e);
      insertRowIndex = 6; // Default to first data row
    }

    // Final fallback: ensure insertRowIndex is always set
    if (insertRowIndex === null) {
      insertRowIndex = 6;
      console.log(`📅 Using fallback: will insert at row 6`);
    }
  }

  // Prepare the values to write - match the exact format used in the sheet
  // Use proper data types: numbers for dates, exact dropdown values for rooms
  // targetDate is just the day number (e.g., "17"), use start.getDate() directly
  const dateValue = start.getDate(); // Get day of month as number

  // Determine the exact dropdown values from existing rows
  // Prioritize sampleRowWithRoom (has actual room assignments) over existingRowFormat
  // The sample row shows the correct dropdown format (e.g., "NHA TRANG" not "TRUE")
  const referenceRow = sampleRowWithRoom || existingRowFormat;

  let roomNhaTrang = "";
  let roomDaLat = "";

  // Force standard format to prevent "MEETING ROOM" prefix accumulation
  if (booking.room_id === "nha-trang") roomNhaTrang = "NHA TRANG";
  if (booking.room_id === "da-lat") roomDaLat = "DA LAT";

  console.log(
    `🏠 Using room values - NHA TRANG: "${roomNhaTrang}", DA LAT: "${roomDaLat}"`
  );

  const values = [
    [
      dateValue, // Date (column A) - as number
      format(start, "EEEE"), // Day (column B) - e.g., "Monday"
      booking.title || "", // Staff (column C)
      roomNhaTrang, // Nha Trang (column D) - "TRUE" or empty
      roomDaLat, // Da Lat (column E) - "TRUE" or empty
      mStart || "", // Morning Start (column F)
      mEnd || "", // Morning End (column G)
      aStart || "", // Afternoon Start (column H)
      aEnd || "", // Afternoon End (column I)
    ],
  ];

  console.log("📝 Prepared booking values:", values[0]);

  try {
    if (insertRowIndex !== null) {
      // Insert a new row at the specified index, then update it
      // Step 1: Insert a new BLANK row (inheritFromBefore: false)
      // This ensures no old data is copied automatically.
      const insertResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: parseInt(gid),
                    dimension: "ROWS",
                    startIndex: insertRowIndex - 1, // 0-based index
                    endIndex: insertRowIndex, // Insert 1 row
                  },
                  inheritFromBefore: false, // Don't copy anything! Clean slate.
                },
              },
            ],
          }),
        }
      );

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        throw new Error(`Failed to insert row: ${errorText}`);
      }

      // Step 2: Write the values using standard PUT (values.update)
      // This is the most reliable way to write data.
       const values = [
        [
          dateValue,
          format(start, "EEEE"),
          booking.title || "", 
          roomNhaTrang,
          roomDaLat,
          mStart || "",
          mEnd || "",
          aStart || "",
          aEnd || "",
         ],
       ];
      const updateRange = `${sheetName}!A${insertRowIndex}:I${insertRowIndex}`;
      const updateResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${updateRange}?valueInputOption=${valueInputOption}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update row data: ${errorText}`);
      }
      
      const updateResult = await updateResponse.json();
      console.log(`✅ Data written successfully to row ${insertRowIndex}`, updateResult);

      // Step 3: Copy formatting (Borders/Colors) ONLY
      // Determine source row
      let sourceRowForFormat = null;
      if (insertRowIndex === 6) {
        sourceRowForFormat = 5; // Header
      } else if (insertRowIndex > 6) {
        sourceRowForFormat = insertRowIndex - 1; // Row above
      }

      if (sourceRowForFormat && sourceRowForFormat > 0) {
        try {
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
                {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    requests: [
                    {
                        copyPaste: {
                        source: {
                            sheetId: parseInt(gid),
                            startRowIndex: sourceRowForFormat - 1,
                            endRowIndex: sourceRowForFormat,
                            startColumnIndex: 0,
                            endColumnIndex: 9,
                        },
                        destination: {
                            sheetId: parseInt(gid),
                            startRowIndex: insertRowIndex - 1,
                            endRowIndex: insertRowIndex,
                            startColumnIndex: 0,
                            endColumnIndex: 9,
                        },
                        pasteType: "PASTE_FORMAT", // CRITICAL: Only copy format!
                        },
                    },
                    ],
                }),
                }
            );
            console.log(`✅ Formatting applied to row ${insertRowIndex}`);
        } catch (e) {
            console.warn("⚠️ Formatting copy failed (but data is safe):", e);
        }
      }

      // Return booking info including row number and sheet details for link generation
      return {
        success: true,
        rowNumber: insertRowIndex,
        sheetName: sheetName,
        sheetId: SHEET_ID,
        gid: gid,
        range: `A${insertRowIndex}:I${insertRowIndex}`,
      };
    } else {
      // insertRowIndex should be set above, but if not, use same insert method
      // This ensures the row is inserted within the table structure
      if (insertRowIndex === null) {
        insertRowIndex = 6; // Default to first data row
        console.warn("⚠️ insertRowIndex was null, using fallback row 6");
      }

      // Insert a new row at the specified index
      const insertResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: parseInt(gid),
                    dimension: "ROWS",
                    startIndex: insertRowIndex - 1, // 0-based index
                    endIndex: insertRowIndex, // Insert 1 row
                  },
                  inheritFromBefore: true, // Copy formatting and data validation from row above
                },
              },
            ],
          }),
        }
      );

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        throw new Error(`Failed to insert row: ${errorText}`);
      }

      // Copy borders/formatting from a reference row
      // If empty table (row 6), copy from row 5 (header row)
      // Otherwise, copy from the row above
      let sourceRowForFormat = null;

      if (insertRowIndex === 6) {
        // Empty table - copy from row 5 (header row)
        sourceRowForFormat = 5;
      } else if (insertRowIndex > 6) {
        // Not empty table - copy from row above
        sourceRowForFormat = insertRowIndex - 1;
      }

      if (sourceRowForFormat && sourceRowForFormat > 0) {
        try {
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requests: [
                  {
                    copyPaste: {
                      source: {
                        sheetId: parseInt(gid),
                        startRowIndex: sourceRowForFormat - 1, // 0-based
                        endRowIndex: sourceRowForFormat,
                        startColumnIndex: 0, // Column A
                        endColumnIndex: 9, // Column I (0-indexed, so 9 = column I+1)
                      },
                      destination: {
                        sheetId: parseInt(gid),
                        startRowIndex: insertRowIndex - 1, // 0-based, new row
                        endRowIndex: insertRowIndex,
                        startColumnIndex: 0,
                        endColumnIndex: 9,
                      },
                      pasteType: "PASTE_NORMAL", // Copy everything (formatting + values)
                    },
                  },
                ],
              }),
            }
          );
          console.log(
            `✅ Copied formatting from row ${sourceRowForFormat} to row ${insertRowIndex}`
          );
        } catch (e) {
          console.warn(
            `⚠️ Could not copy formatting from row ${sourceRowForFormat}:`,
            e
          );
          // Continue anyway - we'll still write the values
        }
      }

      // Update the newly inserted row with our values
      const updateRange = `${sheetName}!A${insertRowIndex}:I${insertRowIndex}`;
      const updateResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${updateRange}?valueInputOption=${valueInputOption}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update row: ${errorText}`);
      }

      const result = await updateResponse.json();
      console.log(
        `✅ Booking created successfully at row ${insertRowIndex}:`,
        result
      );

      // Return booking info including row number and sheet details for link generation
      return {
        success: true,
        rowNumber: insertRowIndex,
        sheetName: sheetName,
        sheetId: SHEET_ID,
        gid: gid,
        range: `A${insertRowIndex}:I${insertRowIndex}`,
      };
    }
  } catch (error) {
    console.error("❌ Booking Error:", error);
    // Return error info for dialog display
    throw new Error(error.message || "Booking failed. Please try again.");
  }
};

// Helper to separate search logic
const findBookingRow = async (bookingId, targetDate, currentGid = null) => {
  const parts = bookingId.split("-");
  if (parts.length < 4) throw new Error("Invalid booking ID format");

  const endStr = parts.pop().trim();
  const startStr = parts.pop().trim();
  const indexStr = parts.pop();
  const roomId = parts.join("-");
  const embeddedRowIndex = parseInt(indexStr);

  let gid = currentGid;
  let targetDay = null;

  if (targetDate) {
      if (typeof targetDate === 'string') {
          const dParts = targetDate.split('-');
          if (dParts.length === 3) {
            const year = parseInt(dParts[0]);
            const monthIndex = parseInt(dParts[1]) - 1;
            const day = parseInt(dParts[2]);
            const d = new Date(year, monthIndex, day);
            gid = await getMonthSheetGID(d);
            targetDay = day;
          } else {
             const d = new Date(targetDate);
             if (!isNaN(d.getTime())) {
                 gid = await getMonthSheetGID(d);
                 targetDay = d.getDate();
             } else {
                 gid = await getCurrentMonthSheetGID();
             }
          }
      } else if (targetDate instanceof Date) {
          gid = await getMonthSheetGID(targetDate);
          targetDay = targetDate.getDate();
      }
  } else {
      if (!gid) gid = await getCurrentMonthSheetGID(); 
  }

  console.log(`🔍 Searching for ${roomId} booking at ${startStr}-${endStr} (Day ${targetDay || 'any'}, GID ${gid})...`);

  // Determine Sheet Name for API Query
  const accessToken = await getAccessToken();
  let sheetName = await getSheetNameFromGid(gid);
  
  if (!sheetName) {
      console.warn(`⚠️ Could not determine Sheet Name for GID ${gid}. Defaulting to 'DECEMBER'.`);
      sheetName = "DECEMBER"; // Fallback
  }
  
  // Clean sheet name for URL
  const safeSheetName = sheetName.includes(' ') ? `'${sheetName}'` : sheetName;
  
  console.log(`🔍 Searching via API: ${roomId} @ ${startStr}-${endStr} (Day ${targetDay || 'any'}, Sheet: ${sheetName})...`);

  // Fetch Values via API (Guarantees Index Alignment with batchUpdate)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${safeSheetName}!A:I`;
  const response = await fetch(url, {
      headers: {
          Authorization: `Bearer ${accessToken}`
      }
  });

  if (!response.ok) {
       console.error("❌ Failed to fetch sheet data for search:", await response.text());
       return { realRowIndex: -1, gid, allMatches: [] };
  }

  const data = await response.json();
  const rows = data.values || [];
  const candidates = [];

  // Start checking from Row 5 (Index 4) to skip headers, same as before
  for (let i = 4; i < rows.length; i++) {
      const row = rows[i];
      // API rows might be empty or shorter than I columns.
      if (!row || row.length === 0) continue;
      
      // Column Indices (0-based):
      // 0: Date/Day (A)
      // 1: Day Name (B)
      // 2: Staff/Title (C)
      // 3: Nha Trang (D)
      // 4: Da Lat (E)
      // 5: Morning Start (F)
      // 6: Morning End (G)
      // 7: Afternoon Start (H)
      // 8: Afternoon End (I)

      const nhaTrangValue = (row[3] || "").toString().toUpperCase().trim();
      const daLatValue = (row[4] || "").toString().toUpperCase().trim();
      const isNhaTrang = nhaTrangValue !== "" && (nhaTrangValue === "TRUE" || nhaTrangValue.includes("NHA TRANG"));
      const isDaLat = daLatValue !== "" && (daLatValue === "TRUE" || daLatValue.includes("DA LAT"));

      let isTargetRoom = false;
      if (roomId === 'nha-trang' && isNhaTrang) isTargetRoom = true;
      if (roomId === 'da-lat' && isDaLat) isTargetRoom = true;
      
      if (!isTargetRoom) continue;

      const normalizeTime = (t) => {
          if (!t) return "";
          let clean = t.replace(/\u00A0/g, ' ').replace(/\s+/g, '');
          clean = clean.split(':').slice(0, 2).join(':');
          if (/^\d:\d{2}$/.test(clean)) return "0" + clean;
          return clean;
      };

      const nStartStr = normalizeTime(startStr);
      const nEndStr = normalizeTime(endStr);
      const nmStart = normalizeTime((row[5] || "").toString());
      const nmEnd = normalizeTime((row[6] || "").toString());
      const naStart = normalizeTime((row[7] || "").toString());
      const naEnd = normalizeTime((row[8] || "").toString());

      const matchMorning = (nmStart === nStartStr && nmEnd === nEndStr);
      const matchAfternoon = (naStart === nStartStr && naEnd === nEndStr);
      const matchMorningStart = (nmStart === nStartStr && nmStart !== "");
      const matchAfternoonStart = (naStart === nStartStr && naStart !== "");

      // Accept if Exact OR Partial (Start Time Only)
      if (matchMorning || matchAfternoon || matchMorningStart || matchAfternoonStart) {
          let day = 0;
          const dayCell = row[0]; // Column A
          
          if (dayCell) {
              day = parseInt(dayCell);
              // Legacy Date Object Check
              if (day > 31) {
                  const d = new Date(dayCell);
                  if (!isNaN(d.getTime())) day = d.getDate();
              }
          }
          
          const isDayMatch = targetDay && day === targetDay;
          
          if (isDayMatch) {
               console.log(`✅ MATCH ACCEPTED Row ${i} (Index ${i})`);
               console.log(`   DATA: Day=${dayCell}, Title=${row[2]}, Room=${roomId}, Times=${row[5]}-${row[6]} / ${row[7]}-${row[8]}`);
               candidates.push({ index: i, day, isDayMatch });
          } else {
               // Log ignored mismatch
               // console.log(`Skipping Row ${i}: Time match but Day Mismatch (${day} vs ${targetDay})`);
          }
      }
  }
  
  console.log(`🏁 End of API Search. Total Candidates: ${candidates.length}`);

  if (candidates.length > 0) {
      const matches = candidates.map(c => ({ 
          realRowIndex: c.index, 
          gid,
          isDayMatch: c.isDayMatch
      }));
      
      console.log(`✅ Matches found:`, JSON.stringify(matches));
      
      return {
          allMatches: matches,
          gid: gid
      };
  }
  
  return { 
      realRowIndex: -1, 
      gid,
      allMatches: []
  };
};

const getSheetNameFromGid = async (gid) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
         headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const sheet = data.sheets.find(s => s.properties.sheetId == gid);
    return sheet ? sheet.properties.title : null;
  } catch (e) {
      console.warn("Failed to fetch sheet name", e);
      return null;
  }
};

export const updateBooking = async (originalBookingId, originalDate, newBookingData) => {
    console.log(`✏️ updateBooking: USING SAFE CREATE-THEN-DELETE FOR ALL UPDATES`);
    console.log(`   Original ID: ${originalBookingId}, Original Date: ${originalDate}`);
    console.log(`   New booking data:`, newBookingData);

    // STRATEGY: Always use Create-Then-Delete (safest approach)
    // This prevents data loss even if deletion fails (duplicate is better than data loss)
    
    // 1. LOCATE the old booking first
    let targetToDelete = null;
    try {
        const finderResult = await findBookingRow(originalBookingId, originalDate);
        console.log(`🔍 findBookingRow result:`, finderResult);
        
        // findBookingRow returns { allMatches: [...], gid } when found
        // or { realRowIndex: -1, gid, allMatches: [] } when not found
        if (finderResult && finderResult.allMatches && finderResult.allMatches.length > 0) {
            // Take the first match (should only be one for a specific booking)
            const match = finderResult.allMatches[0];
            targetToDelete = {
                realRowIndex: match.realRowIndex,
                gid: finderResult.gid
            };
            console.log(`🎯 Located original booking at Row ${targetToDelete.realRowIndex} (GID: ${targetToDelete.gid})`);
        } else {
            console.warn(`⚠️ Could not locate original booking ${originalBookingId}`);
        }
    } catch (e) {
        console.warn(`⚠️ Error finding original booking: ${e.message}`);
    }

    // 2. CREATE the new booking
    // createBooking expects: { room_id, title, start_time (ISO), end_time (ISO) }
    // newBookingData already has this format, so just pass it through
    console.log(`   Passing newBookingData directly to createBooking:`, newBookingData);
    
    let createResult;
    try {
        createResult = await createBooking(newBookingData);
        console.log(`✅ New booking created at Row ${createResult.rowNumber}`);
    } catch (e) {
        console.error(`Failed to create new booking`, e);
        throw new Error(`Update failed: Could not create new booking. ${e.message}`);
    }

    // 3. DELETE the old booking
    if (targetToDelete) {
        try {
            const accessToken = await getAccessToken();
            
            // CRITICAL FIX: Adjust deletion index if the new booking was inserted ABOVE or AT the old booking
            let indexToDelete = targetToDelete.realRowIndex;
            const newRowIndexZeroBased = createResult.rowNumber - 1; // Convert 1-based to 0-based
            
            // If new row is on the same sheet AND inserted at/before the old row, the old row shifts down
            if (parseInt(createResult.gid) === parseInt(targetToDelete.gid)) {
                if (newRowIndexZeroBased <= targetToDelete.realRowIndex) {
                    console.log(`⚠️ New booking inserted at/above old one. Shifting deletion index from ${indexToDelete} to ${indexToDelete + 1}`);
                    indexToDelete += 1;
                }
            }

            const deleteRequest = {
                deleteDimension: {
                    range: {
                        sheetId: parseInt(targetToDelete.gid),
                        dimension: 'ROWS',
                        startIndex: indexToDelete,
                        endIndex: indexToDelete + 1
                    }
                }
            };
            
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ requests: [deleteRequest] }),
                }
            );
            console.log(`✅ Old booking deleted from Row ${targetToDelete.realRowIndex}`);
        } catch (e) {
            console.error(`Failed to delete old booking, duplicate may exist`, e);
            // Don't throw - duplicate is better than data loss
        }
    }
    
    localStorage.removeItem(CACHE_KEYS.BOOKINGS);
    return createResult;
};

export const deleteBooking = async (bookingId, targetDate = null) => {
    // Legacy delete wrapper using new finder
    const finderResult = await findBookingRow(bookingId, targetDate);
    
    // Handle both single and array return
    let targets = [];
    let gid = finderResult.gid;
    
    if (finderResult.allMatches && Array.isArray(finderResult.allMatches)) {
        targets = finderResult.allMatches;
    } else if (finderResult.realRowIndex !== -1) {
        targets = [{ realRowIndex: finderResult.realRowIndex, gid: finderResult.gid }];
    }
    
    if (targets.length === 0) throw new Error("Could not find booking to delete.");
    
    // Delete ALL found copies
    // Sort descending to ensure index validity during deletion?
    // Actually batchUpdate can handle multiple unrelated ranges, but if we delete Row 10 then Row 9...
    // If we use separate deleteRequests in one batch, they are processed.
    // However, if we delete row 10, does row 11 become row 10? Yes.
    // If we delete multiple rows simultaneously, we should use START index descending?
    // Google Sheets API batchUpdate applies changes transactionally?
    // "The requests will be applied in the order they are specified."
    // So if we delete Row 10, then Row 9:
    // Delete Row 10 -> Row 11 becomes Row 10. Row 9 stays Row 9.
    // Delete Row 9 -> Row 9 is gone.
    // So order matters if ranges shift.
    // BUT we are using absolute indices.
    // Safer to delete from BOTTOM UP (Highest index first).
    
    targets.sort((a, b) => b.realRowIndex - a.realRowIndex);

    const accessToken = await getAccessToken();
    
    const requests = targets.map(target => ({
        deleteDimension: {
          range: {
            sheetId: parseInt(gid),
            dimension: "ROWS",
            startIndex: target.realRowIndex,
            endIndex: target.realRowIndex + 1, 
          },
        },
    }));

    const deleteResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );
     if (!deleteResp.ok) throw new Error("Delete API failed");
     localStorage.removeItem(CACHE_KEYS.BOOKINGS);
};

export const getRoomStatus = (roomId, bookings) => {
  // Add safety checks
  if (!roomId) {
    console.warn("getRoomStatus called without roomId");
    return {
      status: "available",
      nextBooking: null,
    };
  }

  if (!bookings || !Array.isArray(bookings)) {
    console.warn("getRoomStatus called with invalid bookings:", bookings);
    return {
      status: "available",
      nextBooking: null,
    };
  }

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  // Helper to check if a date is today (ignoring time)
  const isToday = (dateString) => {
    try {
      if (!dateString) return false;
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return false; // Invalid date
      return (
        d.getFullYear() === todayYear &&
        d.getMonth() === todayMonth &&
        d.getDate() === todayDate
      );
    } catch (e) {
      return false;
    }
  };

  // Filter bookings for this room and today only
  const roomBookings = bookings.filter((b) => {
    if (!b || typeof b !== "object") return false;
    if (b.room_id !== roomId) return false;
    if (!b.start_time || !b.end_time) return false;
    return isToday(b.start_time);
  });

  console.log(`🔍 Room ${roomId} status check:`, {
    totalBookings: bookings.length,
    todayBookings: roomBookings.length,
    now: now.toISOString(),
    bookings: roomBookings.map((b) => ({
      start: b.start_time,
      end: b.end_time,
      staff: b.requested_by || b.title,
    })),
  });

  // Check if there's a current booking (now is within booking time range)
  // A room is occupied if: start <= now < end
  const currentBooking = roomBookings.find((b) => {
    try {
      if (!b || !b.start_time || !b.end_time) return false;
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn(`Invalid date in booking:`, b);
        return false;
      }

      // Use getTime() for precise comparison
      const nowTime = now.getTime();
      const startTime = start.getTime();
      const endTime = end.getTime();

      // Room is occupied if current time is >= start and < end
      const isCurrentlyOccupied = nowTime >= startTime && nowTime < endTime;

      if (isCurrentlyOccupied) {
        console.log(`✅ Room ${roomId} is OCCUPIED by booking:`, {
          start: b.start_time,
          end: b.end_time,
          staff: b.requested_by || b.title,
          nowTime: nowTime,
          startTime: startTime,
          endTime: endTime,
        });
      }

      return isCurrentlyOccupied;
    } catch (e) {
      console.warn("Error checking booking time range:", e, b);
      return false;
    }
  });

  // Find next upcoming booking for today (even if it hasn't started yet)
  const nextBooking = roomBookings
    .filter((b) => {
      try {
        if (!b || !b.start_time || !b.end_time) return false;
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        // Get bookings that haven't ended yet (include current and future)
        return end.getTime() > now.getTime();
      } catch (e) {
        console.warn("Error filtering next booking:", e, b);
        return false;
      }
    })
    .sort((a, b) => {
      try {
        if (!a || !a.start_time || !b || !b.start_time) return 0;
        const aTime = new Date(a.start_time).getTime();
        const bTime = new Date(b.start_time).getTime();
        if (isNaN(aTime) || isNaN(bTime)) return 0;
        return aTime - bTime;
      } catch (e) {
        console.warn("Error sorting bookings:", e);
        return 0;
      }
    })[0];

  // If there's a current booking, room is occupied
  if (currentBooking) {
    return {
      status: "occupied",
      booking: currentBooking, // Current active booking
      nextBooking: currentBooking, // Use current booking for display (it's the one that's happening now)
    };
  }

  // Room is available - return next upcoming booking info (if any)
  // nextBooking will be the first upcoming booking that hasn't started yet
  if (nextBooking) {
    console.log(
      `🔵 Room ${roomId} status: AVAILABLE, next booking at`,
      nextBooking.start_time
    );
  } else {
    console.log(
      `⚪ Room ${roomId} status: AVAILABLE, no upcoming bookings today`
    );
  }

  return {
    status: "available",
    nextBooking: nextBooking || null,
  };
};

// Wrapper function to safely get room status with error handling
export const getRoomStatusSafe = (roomId, bookings) => {
  try {
    return getRoomStatus(roomId, bookings);
  } catch (error) {
    console.error("Error in getRoomStatus:", error, {
      roomId,
      bookingsLength: bookings?.length,
    });
    return {
      status: "available",
      nextBooking: null,
    };
  }
};

// Extract unique time slots from CSV data
export const fetchAvailableTimeSlots = async () => {
  // Return a standard set of time slots available for booking
  // Generate time slots every 30 minutes from 08:00 to 18:00
  const timeSlots = [];
  for (let hour = 8; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      // Skip times after 18:00
      if (hour === 18 && minute > 0) break;
      const timeStr = `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;
      timeSlots.push(timeStr);
    }
  }
  saveToCache(CACHE_KEYS.TIME_SLOTS, timeSlots);
  return timeSlots;
};

// Get Google Sheet URL for current month
export const getSheetUrl = async () => {
  try {
    const gid = await getCurrentMonthSheetGID();
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${gid}`;
  } catch (error) {
    // Fallback to base URL if GID detection fails
    console.warn("Failed to get current month GID, using base URL:", error);
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
  }
};

// Fixed Schedule Management
// Fixed schedules are stored in rows 1-3 of the sheet
// Format: Row 1 = Day names, Row 2 = Room assignments, Row 3 = Time ranges

// Fetch fixed schedules from the sheet
export const fetchFixedSchedules = async () => {
  try {
    const accessToken = await getAccessToken();
    const gid = await getCurrentMonthSheetGID();

    // Get sheet name
    let sheetName = "DECEMBER"; // Default
    try {
      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json();
        const sheet = sheetsData.sheets?.find(
          (s) => s.properties?.sheetId?.toString() === gid
        );
        if (sheet) sheetName = sheet.properties.title;
      }
    } catch (e) {
      console.warn("Could not get sheet name, using default", e);
    }

    // Use Google Sheets API directly to get clean row data (no CSV concatenation issues)
    // Read columns A-I to get all data: C=Staff, D=NHA TRANG, E=DA LAT, F/G=Morning, H/I=Afternoon
    const apiResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!A1:I30`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      const rows = apiData.values || [];
      const fixedSchedules = [];

      console.log("📅 Raw API rows (first 10 rows):");
      rows.slice(0, 10).forEach((row, idx) => {
        const rowNum = idx + 1;
        console.log(`Row ${rowNum}:`, {
          A: row[0] || "(empty)",
          B: row[1] || "(empty)",
          C: row[2] || "(empty)",
          D: row[3] || "(empty)",
          E: row[4] || "(empty)",
          F: row[5] || "(empty)",
          G: row[6] || "(empty)",
          H: row[7] || "(empty)",
          I: row[8] || "(empty)",
        });
      });

      const dayNames = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];

      // CORRECT STRUCTURE:
      // C = Staff
      // D = NHA TRANG (if room is nha-trang)
      // E = DA LAT (if room is da-lat)
      // F = Morning start time
      // G = Morning end time
      // H = Afternoon start time
      // I = Afternoon end time

      // Parse rows starting from row 2 (index 1) - fixed schedules start here
      for (let rowIndex = 1; rowIndex < Math.min(rows.length, 30); rowIndex++) {
        const row = rows[rowIndex] || [];
        const rowNum = rowIndex + 1;

        // Read all columns using CORRECT structure
        const colA = (row[0] || "").toString().trim();
        const colB = (row[1] || "").toString().trim();
        const colC = (row[2] || "").toString().trim(); // Staff
        const colD = (row[3] || "").toString().trim().toUpperCase(); // NHA TRANG
        const colE = (row[4] || "").toString().trim().toUpperCase(); // DA LAT
        const colF = (row[5] || "").toString().trim(); // Morning start
        const colG = (row[6] || "").toString().trim(); // Morning end
        const colH = (row[7] || "").toString().trim(); // Afternoon start
        const colI = (row[8] || "").toString().trim(); // Afternoon end

        // Debug: Log what we're reading
        console.log(
          `📋 Row ${rowNum} API data: A="${colA}", B="${colB}", C="${colC}", D="${colD}", E="${colE}", F="${colF}", G="${colG}", H="${colH}", I="${colI}"`
        );

        // Check if this is the header row for the booking table
        if (colA.toUpperCase() === "DATE" && colB.toUpperCase() === "DAY") {
          console.log(
            `🛑 Found header row at row ${rowNum}, stopping fixed schedule parsing`
          );
          break;
        }

        // Read using CORRECT structure: C=Staff, D/E=Room, F/G or H/I=Times
        const staffName = colC;
        let roomValue = "";
        let roomId = null;

        // Determine room from D (NHA TRANG) or E (DA LAT)
        if (colD && colD.includes("NHA TRANG")) {
          roomValue = "NHA TRANG";
          roomId = "nha-trang";
        } else if (colE && colE.includes("DA LAT")) {
          roomValue = "DA LAT";
          roomId = "da-lat";
        }

        // Determine times: check if morning (F/G) or afternoon (H/I) has data
        let startTime = "";
        let endTime = "";

        // Check morning times first (F, G)
        if (
          colF &&
          colF.match(/\d{1,2}:\d{2}/) &&
          colG &&
          colG.match(/\d{1,2}:\d{2}/)
        ) {
          startTime = colF;
          endTime = colG;
        }
        // Check afternoon times (H, I)
        else if (
          colH &&
          colH.match(/\d{1,2}:\d{2}/) &&
          colI &&
          colI.match(/\d{1,2}:\d{2}/)
        ) {
          startTime = colH;
          endTime = colI;
        }
        // Fallback: try to extract any time pattern
        else {
          const timePattern = /(\d{1,2}:\d{2})/g;
          const allCols = [colF, colG, colH, colI];
          const foundTimes = [];
          for (const col of allCols) {
            if (col) {
              const matches = col.match(timePattern);
              if (matches) foundTimes.push(...matches);
            }
          }
          if (foundTimes.length >= 2) {
            startTime = foundTimes[0];
            endTime = foundTimes[1];
          }
        }

        // Skip if missing required fields
        if (
          !staffName ||
          !staffName.trim() ||
          !roomId ||
          !startTime ||
          !endTime
        ) {
          console.log(
            `⏭️ Skipping row ${rowNum} - missing data: staff="${staffName}", room="${roomValue}", start="${startTime}", end="${endTime}"`
          );
          continue;
        }

        // roomId is already determined above

        // Parse times
        const startMatch = startTime.match(/(\d{1,2}):(\d{2})/);
        const endMatch = endTime.match(/(\d{1,2}):(\d{2})/);

        if (!startMatch || !endMatch) {
          console.log(
            `⏭️ Skipping row ${rowNum} - invalid times: start="${startTime}", end="${endTime}"`
          );
          continue;
        }

        const startHour = parseInt(startMatch[1]);
        const startMin = parseInt(startMatch[2]);
        const endHour = parseInt(endMatch[1]);
        const endMin = parseInt(endMatch[2]);

        console.log(
          `✅ Parsed row ${rowNum}: ${staffName} - ${roomId} ${startHour}:${startMin} - ${endHour}:${endMin}`
        );

        // Fixed schedule applies to ALL days (0-6)
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
          fixedSchedules.push({
            id: `fixed-${rowNum}-${dayOfWeek}-${roomId}`,
            dayOfWeek: dayOfWeek,
            dayName: dayNames[dayOfWeek],
            room_id: roomId,
            start_time: `${String(startHour).padStart(2, "0")}:${String(
              startMin
            ).padStart(2, "0")}`,
            end_time: `${String(endHour).padStart(2, "0")}:${String(
              endMin
            ).padStart(2, "0")}`,
            staff_name: staffName,
            row: rowNum, // 1-based row number
          });
        }
      }

      console.log(`✅ Total fixed schedules parsed: ${fixedSchedules.length}`);
      console.log(
        `✅ Found ${fixedSchedules.length} fixed schedules:`,
        fixedSchedules
      );
      saveToCache(CACHE_KEYS.FIXED_SCHEDULES, fixedSchedules);
      return fixedSchedules;
    }

    // Fallback to CSV if API fails
    console.warn(
      "Failed to fetch fixed schedules via API, falling back to CSV"
    );
    const csvUrl = getCSVUrl(gid);
    const csvResponse = await fetch(csvUrl);
    const csvText = await csvResponse.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        complete: (results) => {
          const rows = results.data;
          const fixedSchedules = [];

          if (rows.length < 3) {
            resolve([]);
            return;
          }

          // Fixed schedule area is C2:G3 (columns C-G, rows 2-3)
          // Based on actual data:
          // Row 2: ['', 'NHA TRANG', 'Team Brian', 'NHA TRANG', '', '9:30', '10:00', ...]
          // Row 3: ['', '', 'Team Phan', 'NHA TRANG', '', '10:00', '10:30', ...]
          // So the structure is:
          // Column C (index 2): Staff name
          // Column D (index 3): Room name
          // Column E (index 4): Empty
          // Column F (index 5): Start time
          // Column G (index 6): End time

          console.log("📅 Raw CSV rows (first 6 rows):");
          rows.slice(0, 6).forEach((row, idx) => {
            const rowNum = idx + 1;
            console.log(`Row ${rowNum}:`, {
              A: row[0] || "(empty)",
              B: row[1] || "(empty)",
              C: row[2] || "(empty)",
              D: row[3] || "(empty)",
              E: row[4] || "(empty)",
              F: row[5] || "(empty)",
              G: row[6] || "(empty)",
            });
          });

          const dayNames = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ];

          // Parse rows starting from row 1 (index 0) until we hit the header row
          // Fixed schedules can be in rows 1, 2, 3, 4, etc. (dynamically expanding)
          // The header row (with "BOOKING STAFF") marks the end of fixed schedules
          // Row 1: A="DECEMBER Fixed Daily Booking", C="Team Phanaaa", D="NHA TRANG", F="10:00", G="10:30"
          // Row 2: C="Team Phan", D="NHA TRANG", F="10:00", G="10:30"
          // Row N: B="DAY", C="BOOKING STAFF" (header row - marks the end)
          // CSV Row 1 (index 0) contains concatenated fixed schedule data due to merged cells
          // Row 1: A="DECEMBER Fixed Daily Booking  DATE", B="DAY", C="Team Ocean Team Phan BOOKING STAFF", D="NHA TRANG NHA TRANG MEETING ROOM..."
          // We need to extract schedules from Row 1 first, then check if there are more in subsequent rows
          // Start from row 1 (index 0) to parse the concatenated data
          for (
            let rowIndex = 0;
            rowIndex < Math.min(rows.length, 20); // Read up to 20 rows to find all fixed schedules
            rowIndex++
          ) {
            const row = rows[rowIndex] || [];

            // Check if this is the header row for the booking table
            // Header row has "DATE" in column A (index 0) AND "DAY" in column B (index 1)
            // Note: CSV might concatenate merged cells, so we need to check if cells contain these values
            const firstCell = (row[0] || "").toString().trim().toUpperCase();
            const secondCell = (row[1] || "").toString().trim().toUpperCase();
            const thirdCell = (row[2] || "").toString().trim().toUpperCase();
            const fourthCell = (row[3] || "").toString().trim().toUpperCase();

            const rowNum = rowIndex + 1; // 1-based row number

            // The sheet structure based on actual Google Sheet:
            // Row 2: A="Fixed Daily Booking", B="Team Ocean", C="NHA TRANG", D="10:00", E="10:30"
            // Row 3: A=empty, B="Team Phan", C="NHA TRANG", D="10:00", E="10:30"
            // Actual format: B=Staff, C=Room, D=Start, E=End
            // Column A might have "Fixed Daily Booking" or be empty
            // Note: CSV might concatenate values, so we need to extract clean values FIRST before header check

            const colA = (row[0] || "").toString().trim().toUpperCase();
            const colB = (row[1] || "").toString().trim();
            const colC = (row[2] || "").toString().trim().toUpperCase();
            const colD = (row[3] || "").toString().trim();
            const colE = (row[4] || "").toString().trim();

            // Actual format: B=Staff, C=Room, D=Start, E=End
            // BUT: CSV Row 1 is concatenated, so staff names might be in column C
            // Check if column C contains staff names (like "Team Ocean Team Phan BOOKING STAFF")
            let staffName = colB;
            let roomValue = colC;
            let startTime = colD;
            let endTime = colE;

            // SPECIAL CASE: Row 1 in CSV is concatenated - staff names are in column C, not B
            // Column C: "Team Ocean Team Phan BOOKING STAFF"
            // Column D: "NHA TRANG NHA TRANG MEETING ROOM\nNHA TRANG"
            if (
              rowNum === 1 &&
              colC.includes("TEAM") &&
              colC.includes("BOOKING STAFF")
            ) {
              // Staff names are in column C, rooms might be in column D
              staffName = colC;
              roomValue = colD;
              // Times might be in column E or F - need to extract from concatenated string
              const colF = (row[5] || "").toString().trim();
              const colG = (row[6] || "").toString().trim();
              // Try to find times in any of these columns
              if (colE.match(/\d{1,2}:\d{2}/)) {
                const times = colE.match(/(\d{1,2}:\d{2})/g);
                if (times && times.length >= 2) {
                  startTime = times[0];
                  endTime = times[1];
                }
              } else if (colF.match(/\d{1,2}:\d{2}/)) {
                const times = colF.match(/(\d{1,2}:\d{2})/g);
                if (times && times.length >= 2) {
                  startTime = times[0];
                  endTime = times[1];
                }
              } else if (colG.match(/\d{1,2}:\d{2}/)) {
                const times = colG.match(/(\d{1,2}:\d{2})/g);
                if (times && times.length >= 2) {
                  startTime = times[0];
                  endTime = times[1];
                }
              }
              console.log(
                `🔧 Row 1 is concatenated - using column C for staff, D for room`
              );
            }

            // If values are concatenated (contain multiple values separated by spaces or newlines),
            // try to extract the first valid value (the fixed schedule data comes first)
            // Example: "Team Phan Team Phan BOOKING STAFF" -> extract "Team Phan"
            const originalStaffName = staffName;
            const originalRoomValue = roomValue;
            const originalStartTime = startTime;
            const originalEndTime = endTime;

            // Always try to extract clean staff name (remove duplicates and header keywords)
            // SPECIAL CASE: If CSV Row 1 contains concatenated staff names (like "Team Ocean Team Phan"),
            // we need to extract multiple schedules from this row
            if (staffName) {
              let cleaned = staffName;

              // Remove "BOOKING STAFF" and everything after it
              if (staffName.includes("BOOKING STAFF")) {
                const parts = staffName.split("BOOKING STAFF");
                cleaned = parts[0] || cleaned;
              }

              // Remove other header keywords
              cleaned = cleaned.replace(/DAY|DATE/g, "").trim();

              // Check if we have multiple staff names (like "Team Ocean Team Phan")
              // Pattern: Two words, space, two words (likely two staff names)
              const words = cleaned.split(/\s+/).filter((w) => w.trim() !== "");

              // Detect pattern like "Team Ocean Team Phan" (4 words = likely 2 staff names)
              // Or "Team Ocean TeamPhan" or variations
              // We'll try to split at "Team" boundaries if we see "Team X Team Y"
              let staffNames = [];
              if (
                words.length >= 4 &&
                words[0].toUpperCase() === "TEAM" &&
                words[2] &&
                words[2].toUpperCase() === "TEAM"
              ) {
                // Pattern: "Team X Team Y" - split into ["Team X", "Team Y"]
                staffNames = [
                  words.slice(0, 2).join(" "), // "Team Ocean"
                  words.slice(2).join(" "), // "Team Phan" (or "Team Phan ...")
                ];
                console.log(
                  `🔧 Detected multiple staff names in concatenated data: ${staffNames.join(
                    ", "
                  )}`
                );
              } else {
                // Single staff name - remove duplicate words (case-insensitive)
                const seen = new Set();
                const cleanParts = words.filter((word) => {
                  const upperWord = word.toUpperCase();
                  if (seen.has(upperWord)) {
                    return false; // Skip duplicate
                  }
                  seen.add(upperWord);
                  return true; // Keep first occurrence
                });
                staffNames = [cleanParts.join(" ")];
              }

              // For now, use the first staff name (we'll handle multiple schedules separately)
              staffName = staffNames[0];
              if (originalStaffName !== staffName || staffNames.length > 1) {
                console.log(
                  `🔧 Extracted staff name(s): "${originalStaffName}" -> "${staffNames.join(
                    " | "
                  )}" (using first: "${staffName}")`
                );
              }
            }

            // Always try to extract clean room value (remove duplicates and header keywords)
            if (roomValue) {
              let cleaned = roomValue;

              // Remove "MEETING ROOM" and everything after it (or split and take first part)
              if (roomValue.includes("MEETING ROOM")) {
                const parts = roomValue.split("MEETING ROOM");
                cleaned = parts[0] || cleaned;
              }

              // Remove newlines and normalize whitespace
              cleaned = cleaned.replace(/\n/g, " ").trim();

              // Remove duplicate words (case-insensitive)
              const words = cleaned.split(/\s+/).filter((w) => w.trim() !== "");
              const seen = new Set();
              const cleanParts = words.filter((word) => {
                const upperWord = word.toUpperCase();
                if (seen.has(upperWord)) {
                  return false; // Skip duplicate
                }
                seen.add(upperWord);
                return true; // Keep first occurrence
              });

              if (cleanParts.length > 0) {
                roomValue = cleanParts.join(" ");
                if (originalRoomValue !== roomValue) {
                  console.log(
                    `🔧 Extracted room: "${originalRoomValue}" -> "${roomValue}"`
                  );
                }
              }
            }

            // Always try to extract time pattern if it doesn't match clean format
            if (startTime && !startTime.match(/^\d{1,2}:\d{2}$/)) {
              const timeMatch = startTime.match(/(\d{1,2}):(\d{2})/);
              if (timeMatch) {
                startTime = timeMatch[0]; // Get the first time found
                console.log(
                  `🔧 Extracted start time: "${originalStartTime}" -> "${startTime}"`
                );
              }
            }

            // Always try to extract time pattern, whether it contains "END" or not
            if (endTime) {
              const timeMatch = endTime.match(/(\d{1,2}):(\d{2})/);
              if (timeMatch) {
                const extractedTime = timeMatch[0];
                // Only update if the extracted time is different (to avoid overwriting clean times)
                if (extractedTime !== endTime) {
                  endTime = extractedTime;
                  console.log(
                    `🔧 Extracted end time: "${originalEndTime}" -> "${endTime}"`
                  );
                }
              }
            }

            console.log(
              `Row ${rowNum}: staff="${staffName}", room="${roomValue}", start="${startTime}", end="${endTime}"`
            );
            console.log(
              `Row ${rowNum} raw data: A="${row[0] || ""}", B="${
                row[1] || ""
              }", C="${row[2] || ""}", D="${row[3] || ""}", E="${
                row[4] || ""
              }", F="${row[5] || ""}", G="${row[6] || ""}"`
            );

            // Skip if no room or times, or if it's a header row
            // Note: We DON'T skip based on staffName being "Fixed Daily Booking" - that's just a label in column A
            // The actual schedule data is in columns C, D, F, G, so we only check those
            // IMPORTANT: If room, start, or end is empty, this is NOT a valid fixed schedule row
            // Also check if this looks like a booking table row (has DATE, DAY, etc.)
            // Note: CSV might concatenate values, so check if cells CONTAIN these values
            const isEmptyRow =
              !roomValue ||
              !startTime ||
              !endTime ||
              roomValue === "" ||
              startTime === "" ||
              endTime === "";

            // Check if this row contains header-like content (might be concatenated in CSV)
            // But also check if it contains valid fixed schedule data
            const hasDateInA =
              firstCell.includes("DATE") && !firstCell.includes("DECEMBER");
            const hasDayInB =
              secondCell.includes("DAY") && !secondCell.includes("DAILY");
            // Check header-like content using ORIGINAL values (before extraction)
            const hasBookingStaffInC =
              originalStaffName.includes("BOOKING STAFF");
            const hasMeetingRoomInD =
              originalRoomValue.includes("MEETING ROOM") &&
              originalRoomValue.includes("\n");
            const hasTimeHeaders =
              originalStartTime.includes("BOOKING TIME") ||
              (originalEndTime.includes("END") &&
                !originalEndTime.match(/^\d{1,2}:\d{2}$/)) ||
              (originalStartTime.includes("START") &&
                !originalStartTime.match(/^\d{1,2}:\d{2}$/));

            // Check if we can extract valid fixed schedule data (has time pattern)
            // Use the EXTRACTED values for validation (after cleaning)
            const hasValidTime =
              startTime &&
              startTime.match(/^\d{1,2}:\d{2}$/) &&
              endTime &&
              endTime.match(/^\d{1,2}:\d{2}$/);
            const hasValidRoom =
              roomValue &&
              roomValue.trim() !== "" &&
              !roomValue.includes("MEETING ROOM") &&
              (roomValue.toUpperCase().includes("NHA TRANG") ||
                roomValue.toUpperCase().includes("DA LAT"));
            const hasValidStaff =
              staffName &&
              staffName.trim() !== "" &&
              !staffName.includes("BOOKING STAFF") &&
              !staffName.includes("DAY") &&
              !staffName.includes("DATE");

            console.log(
              `🔍 Validation: hasValidTime=${hasValidTime}, hasValidRoom=${hasValidRoom}, hasValidStaff=${hasValidStaff}, extracted: staff="${staffName}", room="${roomValue}", start="${startTime}", end="${endTime}"`
            );

            // If row has valid fixed schedule data, try to extract it even if it also has header data
            const hasValidFixedScheduleData =
              hasValidTime && hasValidRoom && hasValidStaff;

            // PRIORITY: If we have valid fixed schedule data, parse it regardless of header-like content
            if (!hasValidFixedScheduleData) {
              // No valid fixed schedule data - check if it's a pure header row
              const isPureHeaderRow =
                (hasDateInA && hasDayInB) ||
                (hasDayInB && hasBookingStaffInC) ||
                hasMeetingRoomInD;

              if (isEmptyRow) {
                console.log(`⏭️ Skipping row ${rowNum} - empty row`);
                continue; // Check next row
              } else if (isPureHeaderRow) {
                console.log(
                  `⏭️ Skipping row ${rowNum} - pure header row (no valid fixed schedule data): staff="${staffName}", room="${roomValue}", start="${startTime}", end="${endTime}"`
                );
                console.log(
                  `🛑 Reached booking table at row ${rowNum}, stopping fixed schedule parsing`
                );
                break; // Stop parsing - we've hit the booking table
              } else {
                console.log(
                  `⏭️ Skipping row ${rowNum} - no valid fixed schedule data: staff="${staffName}", room="${roomValue}", start="${startTime}", end="${endTime}"`
                );
                continue; // Check next row
              }
            }

            // If we have valid fixed schedule data, parse it regardless of header-like content
            if (hasDateInA || hasDayInB || hasBookingStaffInC) {
              console.log(
                `⚠️ Row ${rowNum} contains both header and fixed schedule data, extracting fixed schedule data`
              );
            }
            console.log(
              `✅ Row ${rowNum} passed validation checks - has valid fixed schedule data`
            );

            // If row has both header data and valid fixed schedule data, log a warning but continue
            if (
              hasValidFixedScheduleData &&
              (hasDateInA || hasDayInB || hasBookingStaffInC)
            ) {
              console.log(
                `⚠️ Row ${rowNum} contains both header and fixed schedule data, extracting fixed schedule data`
              );
            }

            console.log(`✅ Row ${rowNum} passed validation checks`);

            // Determine room ID
            let roomId = null;
            if (
              roomValue.includes("NHA TRANG") ||
              roomValue === "NHA TRANG" ||
              roomValue === "NHATRANG"
            ) {
              roomId = "nha-trang";
            } else if (roomValue.includes("DA LAT") || roomValue === "DA LAT") {
              roomId = "da-lat";
            }

            if (!roomId) {
              console.log(
                `⚠️ Could not determine room for row ${rowNum}, value: "${roomValue}"`
              );
              continue;
            }

            // Parse times (format: "9:30" or "09:30")
            const startMatch = startTime.match(/(\d{1,2}):(\d{2})/);
            const endMatch = endTime.match(/(\d{1,2}):(\d{2})/);

            if (!startMatch || !endMatch) {
              console.log(
                `⚠️ Could not parse times for row ${rowNum}: start="${startTime}", end="${endTime}"`
              );
              continue;
            }

            const startHour = parseInt(startMatch[1]);
            const startMin = parseInt(startMatch[2]);
            const endHour = parseInt(endMatch[1]);
            const endMin = parseInt(endMatch[2]);

            console.log(
              `✅ Parsed row ${rowNum}: ${staffName} - ${roomId} ${startHour}:${startMin} - ${endHour}:${endMin}`
            );

            // Check if we detected multiple staff names in the concatenated data
            // If so, create separate schedule entries for each staff member
            let staffNamesToProcess = [staffName];

            // Re-check original data to see if we have multiple staff names
            if (
              originalStaffName &&
              originalStaffName.includes("BOOKING STAFF")
            ) {
              const beforeBookingStaff = originalStaffName
                .split("BOOKING STAFF")[0]
                .trim();
              const words = beforeBookingStaff
                .split(/\s+/)
                .filter((w) => w.trim() !== "");

              // Pattern: "Team Ocean Team Phan" = 4 words, starting with "Team"
              if (
                words.length >= 4 &&
                words[0].toUpperCase() === "TEAM" &&
                words[2] &&
                words[2].toUpperCase() === "TEAM"
              ) {
                // Split into multiple staff names
                staffNamesToProcess = [
                  words.slice(0, 2).join(" "), // "Team Ocean"
                  words.slice(2).join(" "), // "Team Phan"
                ];
                console.log(
                  `🔧 Creating ${
                    staffNamesToProcess.length
                  } separate schedules from concatenated row: ${staffNamesToProcess.join(
                    ", "
                  )}`
                );
              }
            }

            // Create schedule entries for each staff name (or just one if single)
            staffNamesToProcess.forEach((currentStaffName, staffIndex) => {
              // Fixed schedule applies to ALL days (0-6) - user said "repeated days"
              for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                fixedSchedules.push({
                  id: `fixed-${rowNum}-${staffIndex}-${dayOfWeek}-${roomId}`, // Unique ID with staff index
                  dayOfWeek: dayOfWeek,
                  dayName: dayNames[dayOfWeek],
                  room_id: roomId,
                  start_time: `${String(startHour).padStart(2, "0")}:${String(
                    startMin
                  ).padStart(2, "0")}`,
                  end_time: `${String(endHour).padStart(2, "0")}:${String(
                    endMin
                  ).padStart(2, "0")}`,
                  staff_name: currentStaffName.trim(), // Use the specific staff name
                  row: rowNum, // 1-based row number (same row for all)
                });
              }
            });
          }

          console.log(
            `✅ Total fixed schedules parsed: ${fixedSchedules.length}`
          );

          console.log(
            `✅ Found ${fixedSchedules.length} fixed schedules:`,
            fixedSchedules
          );
          saveToCache(CACHE_KEYS.FIXED_SCHEDULES, fixedSchedules);
          resolve(fixedSchedules);
        },
        error: (err) => {
          console.error("CSV Parse Error for fixed schedules", err);
          reject(err);
        },
      });
    });
  } catch (error) {
    console.error("Failed to fetch fixed schedules", error);
    return [];
  }
};

// Create a new fixed schedule
export const createFixedSchedule = async (schedule) => {
  // Check for conflicts with existing bookings
  // Read directly from the sheet to get accurate staff names
  const accessToken = await getAccessToken();
  const gid = await getCurrentMonthSheetGID();

  // Get sheet name first
  let sheetName = "DECEMBER"; // Default
  try {
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (sheetsResponse.ok) {
      const sheetsData = await sheetsResponse.json();
      const sheet = sheetsData.sheets?.find(
        (s) => s.properties?.sheetId?.toString() === gid
      );
      if (sheet) sheetName = sheet.properties.title;
    }
  } catch (e) {
    console.warn("Could not get sheet name, using default", e);
  }

  // Check for conflicts by reading booking table directly from sheet
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Parse fixed schedule times
    const [scheduleStartHour, scheduleStartMin] = schedule.start_time
      .split(":")
      .map(Number);
    const [scheduleEndHour, scheduleEndMin] = schedule.end_time
      .split(":")
      .map(Number);

    // Read booking table from sheet (rows starting from row 5, columns A-I)
    // Row 4 (index 4) is header, Row 5+ (index 5+) are bookings
    const bookingTableResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!A5:I100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (bookingTableResponse.ok) {
      const bookingTableData = await bookingTableResponse.json();
      const bookingRows = bookingTableData.values || [];

      // Check each day in the current month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        // Check each booking row
        for (let rowIndex = 0; rowIndex < bookingRows.length; rowIndex++) {
          const row = bookingRows[rowIndex] || [];
          const rowNum = rowIndex + 5; // Actual row number in sheet (5-based)

          // Skip empty rows
          if (!row[0]) continue;

          // Parse date from column A (index 0)
          const rowDay = parseInt(row[0]);
          if (isNaN(rowDay) || rowDay !== day) continue;

          // Get staff name from column C (index 2) - BOOKING STAFF column
          const staffName = (row[2] || "").toString().trim();

          // Check room assignments - column D (index 3) = NHA TRANG, column E (index 4) = DA LAT
          const nhaTrangValue = (row[3] || "").toString().toUpperCase().trim();
          const daLatValue = (row[4] || "").toString().toUpperCase().trim();
          const isNhaTrang =
            nhaTrangValue !== "" &&
            (nhaTrangValue === "TRUE" || nhaTrangValue.includes("NHA TRANG"));
          const isDaLat =
            daLatValue !== "" &&
            (daLatValue === "TRUE" || daLatValue.includes("DA LAT"));

          // Check if this booking is for the same room
          const bookingRoomId = isNhaTrang
            ? "nha-trang"
            : isDaLat
            ? "da-lat"
            : null;
          if (bookingRoomId !== schedule.room_id) continue;

          // Get times - column F/G (index 5/6) = Morning, column H/I (index 7/8) = Afternoon
          const mStart = (row[5] || "").toString().trim();
          const mEnd = (row[6] || "").toString().trim();
          const aStart = (row[7] || "").toString().trim();
          const aEnd = (row[8] || "").toString().trim();

          // Check both morning and afternoon slots
          const timeSlots = [
            { start: mStart, end: mEnd },
            { start: aStart, end: aEnd },
          ];

          for (const timeSlot of timeSlots) {
            if (!timeSlot.start || !timeSlot.end) continue;

            try {
              // Parse booking times
              const [bookingStartHour, bookingStartMin] = timeSlot.start
                .split(":")
                .map(Number);
              const [bookingEndHour, bookingEndMin] = timeSlot.end
                .split(":")
                .map(Number);

              if (isNaN(bookingStartHour) || isNaN(bookingEndHour)) continue;

              const bookingStart = new Date(
                currentYear,
                currentMonth,
                day,
                bookingStartHour,
                bookingStartMin
              );
              const bookingEnd = new Date(
                currentYear,
                currentMonth,
                day,
                bookingEndHour,
                bookingEndMin
              );

              const scheduleStart = new Date(
                currentYear,
                currentMonth,
                day,
                scheduleStartHour,
                scheduleStartMin
              );
              const scheduleEnd = new Date(
                currentYear,
                currentMonth,
                day,
                scheduleEndHour,
                scheduleEndMin
              );

              // Check for time overlap
              if (scheduleStart < bookingEnd && scheduleEnd > bookingStart) {
                const bookingDateStr = date.toLocaleDateString();
                const bookingName = staffName || "Existing booking";
                throw new Error(
                  `Cannot create fixed schedule: conflicts with existing booking on ${bookingDateStr} (${bookingName}) from ${bookingStart.toLocaleTimeString(
                    "en-US",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )} to ${bookingEnd.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                );
              }
            } catch (e) {
              if (
                e.message &&
                e.message.includes("Cannot create fixed schedule")
              ) {
                throw e; // Re-throw our conflict error
              }
              // Otherwise, continue checking other time slots
            }
          }
        }
      }
    }
  } catch (error) {
    // If it's our conflict error, re-throw it
    if (
      error.message &&
      error.message.includes("Cannot create fixed schedule")
    ) {
      throw error;
    }
    // Otherwise, log warning but continue (don't block if booking check fails)
    console.warn("Failed to check bookings for conflicts:", error);
  }

  // Check for conflicts with existing fixed schedules
  try {
    const existingSchedules = await fetchFixedSchedules();
    const [scheduleStartHour, scheduleStartMin] = schedule.start_time
      .split(":")
      .map(Number);
    const [scheduleEndHour, scheduleEndMin] = schedule.end_time
      .split(":")
      .map(Number);

    // Check each existing fixed schedule
    for (const existingSchedule of existingSchedules) {
      // Skip if different room
      if (existingSchedule.room_id !== schedule.room_id) continue;

      // Fixed schedules apply to all days (0-6), so check if times overlap
      const [existingStartHour, existingStartMin] = existingSchedule.start_time
        .split(":")
        .map(Number);
      const [existingEndHour, existingEndMin] = existingSchedule.end_time
        .split(":")
        .map(Number);

      // Convert times to minutes for easier comparison
      const scheduleStartMinutes = scheduleStartHour * 60 + scheduleStartMin;
      const scheduleEndMinutes = scheduleEndHour * 60 + scheduleEndMin;
      const existingStartMinutes = existingStartHour * 60 + existingStartMin;
      const existingEndMinutes = existingEndHour * 60 + existingEndMin;

      // Check for time overlap (any overlap means conflict since fixed schedules apply to all days)
      if (
        scheduleStartMinutes < existingEndMinutes &&
        scheduleEndMinutes > existingStartMinutes
      ) {
        throw new Error(
          `Cannot create fixed schedule: conflicts with existing fixed schedule (${existingSchedule.staff_name}) from ${existingSchedule.start_time} to ${existingSchedule.end_time}`
        );
      }
    }
  } catch (error) {
    // If it's our conflict error, re-throw it
    if (
      error.message &&
      error.message.includes("Cannot create fixed schedule")
    ) {
      throw error;
    }
    // Otherwise, log warning but continue (don't block if fixed schedule check fails)
    console.warn("Failed to check fixed schedules for conflicts:", error);
  }

  // sheetName, accessToken, and gid are already set from the conflict check above

  // Dynamically find the last fixed schedule row (before the header row)
  // Format: B=Staff, C=Room, D=Start, E=End
  // Find the next available row in the fixed schedule area
  // If all are filled, INSERT a new row before the header row

  // First, read existing rows to find where to insert
  let insertRowIndex = 1; // Start from row 1 (1-based)
  let shouldInsertRow = false;
  let headerRowIndex = 3; // Default header row (row 3)
  let sourceRowForFormat = -1; // Track which row to copy formatting from

  try {
    // Read a wider range including columns A through I to detect fixed schedules correctly
    const readFullResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!A1:I20`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (readFullResponse.ok) {
      const fullData = await readFullResponse.json();
      const fullValues = fullData.values || [];

      // Find the header row and the last fixed schedule row using full row data
      // Structure: C=Staff, D=NHA TRANG, E=DA LAT, F/G=Morning times, H/I=Afternoon times
      let lastFixedScheduleRow = 0;
      for (let i = 0; i < fullValues.length; i++) {
        const fullRow = fullValues[i] || [];
        const colA = (fullRow[0] || "").toString().trim().toUpperCase();
        const colB = (fullRow[1] || "").toString().trim().toUpperCase();
        const colC = (fullRow[2] || "").toString().trim(); // Column C = Staff
        const colD = (fullRow[3] || "").toString().trim().toUpperCase(); // Column D = NHA TRANG
        const colE = (fullRow[4] || "").toString().trim().toUpperCase(); // Column E = DA LAT
        const colF = (fullRow[5] || "").toString().trim(); // Column F = Morning start
        const colG = (fullRow[6] || "").toString().trim(); // Column G = Morning end
        const colH = (fullRow[7] || "").toString().trim(); // Column H = Afternoon start
        const colI = (fullRow[8] || "").toString().trim(); // Column I = Afternoon end

        // Check if this is the header row
        if (
          (colA === "DATE" && colB === "DAY") ||
          (colB === "DAY" && colC === "BOOKING STAFF") ||
          (colD.includes("MEETING ROOM") && colD.includes("NHA TRANG"))
        ) {
          headerRowIndex = i + 1; // Convert to 1-based
          console.log(
            `📍 Found header row at row ${headerRowIndex} (A="${colA}", B="${colB}", C="${colC}")`
          );
          break;
        }

        // Check if this row has valid fixed schedule data
        // Must have: Staff (C) AND (NHA TRANG (D) OR DA LAT (E)) AND (Morning times (F/G) OR Afternoon times (H/I))
        const hasStaff = colC && colC.trim() !== "";
        const hasRoom =
          (colD && colD.includes("NHA TRANG")) ||
          (colE && colE.includes("DA LAT"));
        const hasMorningTimes =
          (colF && colF.match(/\d{1,2}:\d{2}/)) ||
          (colG && colG.match(/\d{1,2}:\d{2}/));
        const hasAfternoonTimes =
          (colH && colH.match(/\d{1,2}:\d{2}/)) ||
          (colI && colI.match(/\d{1,2}:\d{2}/));
        const hasTimes = hasMorningTimes || hasAfternoonTimes;

        if (
          hasStaff &&
          hasRoom &&
          hasTimes &&
          !colD.includes("MEETING ROOM") &&
          colC !== "BOOKING STAFF" &&
          colA !== "DATE" &&
          colB !== "DAY"
        ) {
          lastFixedScheduleRow = i + 1; // Convert to 1-based
          sourceRowForFormat = i; // Use this row for formatting (0-based)
          console.log(`✅ Found fixed schedule at row ${lastFixedScheduleRow}`);
        }
      }

      // Determine where to insert: at the end after existing rows
      // If it's the first one, add at row 2 (C2)
      if (lastFixedScheduleRow === 0) {
        // No fixed schedules found, use row 2 (C2)
        insertRowIndex = 2;
        console.log(`📝 First fixed schedule, will add at row 2 (C2)`);
      } else {
        // Add after the last fixed schedule row
        insertRowIndex = lastFixedScheduleRow + 1;
        // If this would be at or after the header row, insert before the header
        if (insertRowIndex >= headerRowIndex) {
          insertRowIndex = headerRowIndex;
          shouldInsertRow = true;
          console.log(
            `📝 Will insert new row before header at row ${insertRowIndex}`
          );
        } else {
          console.log(
            `📝 Will add at row ${insertRowIndex} (after last fixed schedule at row ${lastFixedScheduleRow})`
          );
        }
      }

      console.log(
        `📝 Will insert at row ${insertRowIndex}, header is at row ${headerRowIndex}`
      );
    }
  } catch (e) {
    console.warn("Could not read existing rows, using default row 1", e);
  }

  const staffName = schedule.staff_name || ""; // Staff name from form

  // Determine if morning or afternoon based on START and END times
  // If END time is >= 12:00, it should go to afternoon columns (H/I)
  // Parse time strings (format: "HH:mm" or "H:mm")
  const startTimeParts = schedule.start_time.split(":");
  const endTimeParts = schedule.end_time.split(":");
  const startHour = parseInt(startTimeParts[0], 10);
  const endHour = parseInt(endTimeParts[0], 10);

  // Morning is before 12:00, afternoon is 12:00 and later
  // Start and end times are INDEPENDENT - each goes to its own column based on its own time
  const startIsMorning = startHour < 12;
  const endIsMorning = endHour < 12;

  console.log(
    `🕐 Time detection: start_time="${
      schedule.start_time
    }" (hour=${startHour}, ${
      startIsMorning ? "morning" : "afternoon"
    }), end_time="${schedule.end_time}" (hour=${endHour}, ${
      endIsMorning ? "morning" : "afternoon"
    })`
  );

  // CORRECT STRUCTURE:
  // C = Staff
  // D = NHA TRANG (if room is nha-trang, write "NHA TRANG", otherwise clear)
  // E = DA LAT (if room is da-lat, write "DA LAT", otherwise clear)
  // F = Morning start time (if start < 12:00, otherwise clear)
  // G = Morning end time (if end < 12:00, otherwise clear)
  // H = Afternoon start time (if start >= 12:00, otherwise clear)
  // I = Afternoon end time (if end >= 12:00, otherwise clear)

  const nhaTrangValue = schedule.room_id === "nha-trang" ? "NHA TRANG" : "";
  const daLatValue = schedule.room_id === "da-lat" ? "DA LAT" : "";

  // Start and end times are INDEPENDENT - each goes to its own column
  const morningStart = startIsMorning ? schedule.start_time : ""; // F if morning start
  const morningEnd = endIsMorning ? schedule.end_time : ""; // G if morning end
  const afternoonStart = !startIsMorning ? schedule.start_time : ""; // H if afternoon start
  const afternoonEnd = !endIsMorning ? schedule.end_time : ""; // I if afternoon end

  let requests = [];
  let needsFormatCopy = false;
  let sourceRowIndex = -1;

  // Find a source row to copy formatting from (prefer the last fixed schedule row)
  // sourceRowForFormat is set in the loop above
  if (sourceRowForFormat >= 0) {
    sourceRowIndex = sourceRowForFormat; // Already 0-based
    needsFormatCopy = true;
    console.log(
      `📋 Will copy formatting from row ${
        sourceRowForFormat + 1
      } (0-based: ${sourceRowForFormat})`
    );
  } else if (insertRowIndex > 1) {
    // If no fixed schedules exist, try to copy from row 1 (which might have the label)
    sourceRowIndex = 0; // Row 1 (0-based)
    needsFormatCopy = true;
    console.log(`📋 Will copy formatting from row 1 (fallback)`);
  }

  if (shouldInsertRow) {
    // Step 1: Insert a blank row first (to avoid overwriting the table below)
    requests.push({
      insertDimension: {
        range: {
          sheetId: parseInt(gid),
          dimension: "ROWS",
          startIndex: insertRowIndex - 1, // Before header row (0-based: insertRowIndex - 1)
          endIndex: insertRowIndex,
        },
      },
    });

    // Step 2: Copy formatting from the previous fixed schedule row (if available)
    if (needsFormatCopy && sourceRowIndex >= 0) {
      requests.push({
        copyPaste: {
          source: {
            sheetId: parseInt(gid),
            startRowIndex: sourceRowIndex, // Source row (0-based)
            endRowIndex: sourceRowIndex + 1,
            startColumnIndex: 0, // Copy from column A
            endColumnIndex: 26, // Copy to column Z (full row)
          },
          destination: {
            sheetId: parseInt(gid),
            startRowIndex: insertRowIndex - 1, // Destination (the newly inserted row, 0-based)
            endRowIndex: insertRowIndex,
            startColumnIndex: 0,
            endColumnIndex: 26,
          },
          pasteType: "PASTE_FORMAT", // Copy only formatting, not values (values will be set below)
        },
      });
    }
  } else if (needsFormatCopy && sourceRowIndex >= 0) {
    // Even if not inserting, copy formatting to the empty row to ensure consistent style
    requests.push({
      copyPaste: {
        source: {
          sheetId: parseInt(gid),
          startRowIndex: sourceRowIndex, // Source row (0-based)
          endRowIndex: sourceRowIndex + 1,
          startColumnIndex: 0, // Copy from column A
          endColumnIndex: 26, // Copy to column Z (full row)
        },
        destination: {
          sheetId: parseInt(gid),
          startRowIndex: insertRowIndex - 1, // Destination row (0-based)
          endRowIndex: insertRowIndex,
          startColumnIndex: 0,
          endColumnIndex: 26,
        },
        pasteType: "PASTE_FORMAT", // Copy only formatting, not values
      },
    });
  }

  // Write Staff (C), NHA TRANG (D), DA LAT (E)
  requests.push({
    updateCells: {
      range: {
        sheetId: parseInt(gid),
        startRowIndex: insertRowIndex - 1, // Convert to 0-based (row 2 = index 1, row 3 = index 2)
        endRowIndex: insertRowIndex,
        startColumnIndex: 2, // Column C (0-based: 2)
        endColumnIndex: 5, // Column E (0-based: 5, exclusive) - writes to C, D, E
      },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: staffName } }, // Column C (index 2)
            { userEnteredValue: { stringValue: nhaTrangValue } }, // Column D (index 3)
            { userEnteredValue: { stringValue: daLatValue } }, // Column E (index 4)
          ],
        },
      ],
      fields: "userEnteredValue", // Only update values, preserve existing cell styles
    },
  });

  // Write Morning times (F, G) - always write (empty string clears if not morning)
  requests.push({
    updateCells: {
      range: {
        sheetId: parseInt(gid),
        startRowIndex: insertRowIndex - 1, // Convert to 0-based
        endRowIndex: insertRowIndex,
        startColumnIndex: 5, // Column F (0-based: 5)
        endColumnIndex: 7, // Column G (0-based: 7, exclusive) - writes to F, G
      },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: morningStart } }, // Column F (index 5)
            { userEnteredValue: { stringValue: morningEnd } }, // Column G (index 6)
          ],
        },
      ],
      fields: "userEnteredValue", // Only update values, preserve existing cell styles
    },
  });

  // Write Afternoon times (H, I) - always write (empty string clears if not afternoon)
  requests.push({
    updateCells: {
      range: {
        sheetId: parseInt(gid),
        startRowIndex: insertRowIndex - 1, // Convert to 0-based
        endRowIndex: insertRowIndex,
        startColumnIndex: 7, // Column H (0-based: 7)
        endColumnIndex: 9, // Column I (0-based: 9, exclusive) - writes to H, I
      },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: afternoonStart } }, // Column H (index 7)
            { userEnteredValue: { stringValue: afternoonEnd } }, // Column I (index 8)
          ],
        },
      ],
      fields: "userEnteredValue", // Only update values, preserve existing cell styles
    },
  });

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create fixed schedule: ${errorText}`);
  }

  return {
    success: true,
    id: `fixed-${insertRowIndex}-${schedule.dayOfWeek}-${schedule.room_id}`,
    row: insertRowIndex,
  };
};

// Update an existing fixed schedule
export const updateFixedSchedule = async (scheduleId, schedule) => {
  // Check for conflicts with existing bookings
  // Read directly from the sheet to get accurate staff names
  const accessToken = await getAccessToken();
  const gid = await getCurrentMonthSheetGID();

  // Get sheet name first
  let sheetName = "DECEMBER"; // Default
  try {
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (sheetsResponse.ok) {
      const sheetsData = await sheetsResponse.json();
      const sheet = sheetsData.sheets?.find(
        (s) => s.properties?.sheetId?.toString() === gid
      );
      if (sheet) sheetName = sheet.properties.title;
    }
  } catch (e) {
    console.warn("Could not get sheet name, using default", e);
  }

  // Check for conflicts by reading booking table directly from sheet
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Parse fixed schedule times
    const [scheduleStartHour, scheduleStartMin] = schedule.start_time
      .split(":")
      .map(Number);
    const [scheduleEndHour, scheduleEndMin] = schedule.end_time
      .split(":")
      .map(Number);

    // Read booking table from sheet (rows starting from row 5, columns A-I)
    // Row 4 (index 4) is header, Row 5+ (index 5+) are bookings
    const bookingTableResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!A5:I100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (bookingTableResponse.ok) {
      const bookingTableData = await bookingTableResponse.json();
      const bookingRows = bookingTableData.values || [];

      // Check each day in the current month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);

        // Check each booking row
        for (let rowIndex = 0; rowIndex < bookingRows.length; rowIndex++) {
          const row = bookingRows[rowIndex] || [];
          const rowNum = rowIndex + 5; // Actual row number in sheet (5-based)

          // Skip empty rows
          if (!row[0]) continue;

          // Parse date from column A (index 0)
          const rowDay = parseInt(row[0]);
          if (isNaN(rowDay) || rowDay !== day) continue;

          // Get staff name from column C (index 2) - BOOKING STAFF column
          const staffName = (row[2] || "").toString().trim();

          // Check room assignments - column D (index 3) = NHA TRANG, column E (index 4) = DA LAT
          const nhaTrangValue = (row[3] || "").toString().toUpperCase().trim();
          const daLatValue = (row[4] || "").toString().toUpperCase().trim();
          const isNhaTrang =
            nhaTrangValue !== "" &&
            (nhaTrangValue === "TRUE" || nhaTrangValue.includes("NHA TRANG"));
          const isDaLat =
            daLatValue !== "" &&
            (daLatValue === "TRUE" || daLatValue.includes("DA LAT"));

          // Check if this booking is for the same room
          const bookingRoomId = isNhaTrang
            ? "nha-trang"
            : isDaLat
            ? "da-lat"
            : null;
          if (bookingRoomId !== schedule.room_id) continue;

          // Get times - column F/G (index 5/6) = Morning, column H/I (index 7/8) = Afternoon
          const mStart = (row[5] || "").toString().trim();
          const mEnd = (row[6] || "").toString().trim();
          const aStart = (row[7] || "").toString().trim();
          const aEnd = (row[8] || "").toString().trim();

          // Check both morning and afternoon slots
          const timeSlots = [
            { start: mStart, end: mEnd },
            { start: aStart, end: aEnd },
          ];

          for (const timeSlot of timeSlots) {
            if (!timeSlot.start || !timeSlot.end) continue;

            try {
              // Parse booking times
              const [bookingStartHour, bookingStartMin] = timeSlot.start
                .split(":")
                .map(Number);
              const [bookingEndHour, bookingEndMin] = timeSlot.end
                .split(":")
                .map(Number);

              if (isNaN(bookingStartHour) || isNaN(bookingEndHour)) continue;

              const bookingStart = new Date(
                currentYear,
                currentMonth,
                day,
                bookingStartHour,
                bookingStartMin
              );
              const bookingEnd = new Date(
                currentYear,
                currentMonth,
                day,
                bookingEndHour,
                bookingEndMin
              );

              const scheduleStart = new Date(
                currentYear,
                currentMonth,
                day,
                scheduleStartHour,
                scheduleStartMin
              );
              const scheduleEnd = new Date(
                currentYear,
                currentMonth,
                day,
                scheduleEndHour,
                scheduleEndMin
              );

              // Check for time overlap
              if (scheduleStart < bookingEnd && scheduleEnd > bookingStart) {
                const bookingDateStr = date.toLocaleDateString();
                const bookingName = staffName || "Existing booking";
                throw new Error(
                  `Cannot update fixed schedule: conflicts with existing booking on ${bookingDateStr} (${bookingName}) from ${bookingStart.toLocaleTimeString(
                    "en-US",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )} to ${bookingEnd.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                );
              }
            } catch (e) {
              if (
                e.message &&
                e.message.includes("Cannot update fixed schedule")
              ) {
                throw e; // Re-throw our conflict error
              }
              // Otherwise, continue checking other time slots
            }
          }
        }
      }
    }
  } catch (error) {
    // If it's our conflict error, re-throw it
    if (
      error.message &&
      error.message.includes("Cannot update fixed schedule")
    ) {
      throw error;
    }
    // Otherwise, log warning but continue (don't block if booking check fails)
    console.warn("Failed to check bookings for conflicts:", error);
  }

  // Extract row index from scheduleId (format: "fixed-{rowNum}-{dayOfWeek}-{room_id}")
  const match = scheduleId.match(/fixed-(\d+)-(\d+)-(.+)/);
  if (!match) {
    console.error("❌ Invalid schedule ID format:", scheduleId);
    throw new Error("Invalid schedule ID format");
  }

  const rowNum = parseInt(match[1]); // 1-based row number (2 or 3)

  // Check for conflicts with existing fixed schedules (excluding the one being updated)
  try {
    const existingSchedules = await fetchFixedSchedules();
    const [scheduleStartHour, scheduleStartMin] = schedule.start_time
      .split(":")
      .map(Number);
    const [scheduleEndHour, scheduleEndMin] = schedule.end_time
      .split(":")
      .map(Number);

    // Check each existing fixed schedule
    for (const existingSchedule of existingSchedules) {
      // Skip if different room
      if (existingSchedule.room_id !== schedule.room_id) continue;

      // Skip if this is the schedule being updated (same row)
      if (existingSchedule.row === rowNum) continue;

      // Fixed schedules apply to all days (0-6), so check if times overlap
      const [existingStartHour, existingStartMin] = existingSchedule.start_time
        .split(":")
        .map(Number);
      const [existingEndHour, existingEndMin] = existingSchedule.end_time
        .split(":")
        .map(Number);

      // Convert times to minutes for easier comparison
      const scheduleStartMinutes = scheduleStartHour * 60 + scheduleStartMin;
      const scheduleEndMinutes = scheduleEndHour * 60 + scheduleEndMin;
      const existingStartMinutes = existingStartHour * 60 + existingStartMin;
      const existingEndMinutes = existingEndHour * 60 + existingEndMin;

      // Check for time overlap (any overlap means conflict since fixed schedules apply to all days)
      if (
        scheduleStartMinutes < existingEndMinutes &&
        scheduleEndMinutes > existingStartMinutes
      ) {
        throw new Error(
          `Cannot update fixed schedule: conflicts with existing fixed schedule (${existingSchedule.staff_name}) from ${existingSchedule.start_time} to ${existingSchedule.end_time}`
        );
      }
    }
  } catch (error) {
    // If it's our conflict error, re-throw it
    if (
      error.message &&
      error.message.includes("Cannot update fixed schedule")
    ) {
      throw error;
    }
    // Otherwise, log warning but continue (don't block if fixed schedule check fails)
    console.warn("Failed to check fixed schedules for conflicts:", error);
  }
  console.log(
    `🔄 Updating fixed schedule in row ${rowNum} (0-based: ${rowNum - 1})`
  );
  console.log("📝 Update data:", schedule);

  // Get sheet name if not already set (accessToken and gid already available from conflict check above)
  if (!sheetName || sheetName === "DECEMBER") {
    try {
      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json();
        const sheet = sheetsData.sheets?.find(
          (s) => s.properties?.sheetId?.toString() === gid
        );
        if (sheet) sheetName = sheet.properties.title;
      }
    } catch (e) {
      console.warn("Could not get sheet name, using default", e);
    }
  }

  const staffName = schedule.staff_name || ""; // Staff name from form

  // Determine if morning or afternoon based on START and END times
  // If END time is >= 12:00, it should go to afternoon columns (H/I)
  // Parse time strings (format: "HH:mm" or "H:mm")
  const startTimeParts = schedule.start_time.split(":");
  const endTimeParts = schedule.end_time.split(":");
  const startHour = parseInt(startTimeParts[0], 10);
  const endHour = parseInt(endTimeParts[0], 10);

  // Morning is before 12:00, afternoon is 12:00 and later
  // Start and end times are INDEPENDENT - each goes to its own column based on its own time
  const startIsMorning = startHour < 12;
  const endIsMorning = endHour < 12;

  console.log(
    `🕐 Time detection: start_time="${
      schedule.start_time
    }" (hour=${startHour}, ${
      startIsMorning ? "morning" : "afternoon"
    }), end_time="${schedule.end_time}" (hour=${endHour}, ${
      endIsMorning ? "morning" : "afternoon"
    })`
  );

  // CORRECT STRUCTURE:
  // C = Staff
  // D = NHA TRANG (if room is nha-trang, write "NHA TRANG", otherwise clear)
  // E = DA LAT (if room is da-lat, write "DA LAT", otherwise clear)
  // F = Morning start time (if start < 12:00, otherwise clear)
  // G = Morning end time (if end < 12:00, otherwise clear)
  // H = Afternoon start time (if start >= 12:00, otherwise clear)
  // I = Afternoon end time (if end >= 12:00, otherwise clear)

  const nhaTrangValue = schedule.room_id === "nha-trang" ? "NHA TRANG" : "";
  const daLatValue = schedule.room_id === "da-lat" ? "DA LAT" : "";

  // Start and end times are INDEPENDENT - each goes to its own column
  const morningStart = startIsMorning ? schedule.start_time : ""; // F if morning start
  const morningEnd = endIsMorning ? schedule.end_time : ""; // G if morning end
  const afternoonStart = !startIsMorning ? schedule.start_time : ""; // H if afternoon start
  const afternoonEnd = !endIsMorning ? schedule.end_time : ""; // I if afternoon end

  const requests = [
    // Write Staff (C), NHA TRANG (D), DA LAT (E)
    {
      updateCells: {
        range: {
          sheetId: parseInt(gid),
          startRowIndex: rowNum - 1, // Convert to 0-based
          endRowIndex: rowNum,
          startColumnIndex: 2, // Column C (0-based: 2)
          endColumnIndex: 5, // Column E (0-based: 5, exclusive) - writes to C, D, E
        },
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: staffName } }, // Column C (index 2)
              { userEnteredValue: { stringValue: nhaTrangValue } }, // Column D (index 3)
              { userEnteredValue: { stringValue: daLatValue } }, // Column E (index 4)
            ],
          },
        ],
        fields: "userEnteredValue", // Only update values, preserve existing cell styles
      },
    },
    // Write Morning times (F, G) - always write (empty string clears if not morning)
    {
      updateCells: {
        range: {
          sheetId: parseInt(gid),
          startRowIndex: rowNum - 1, // Convert to 0-based
          endRowIndex: rowNum,
          startColumnIndex: 5, // Column F (0-based: 5)
          endColumnIndex: 7, // Column G (0-based: 7, exclusive) - writes to F, G
        },
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: morningStart } }, // Column F (index 5)
              { userEnteredValue: { stringValue: morningEnd } }, // Column G (index 6)
            ],
          },
        ],
        fields: "userEnteredValue", // Only update values, preserve existing cell styles
      },
    },
    // Write Afternoon times (H, I) - always write (empty string clears if not afternoon)
    {
      updateCells: {
        range: {
          sheetId: parseInt(gid),
          startRowIndex: rowNum - 1, // Convert to 0-based
          endRowIndex: rowNum,
          startColumnIndex: 7, // Column H (0-based: 7)
          endColumnIndex: 9, // Column I (0-based: 9, exclusive) - writes to H, I
        },
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: afternoonStart } }, // Column H (index 7)
              { userEnteredValue: { stringValue: afternoonEnd } }, // Column I (index 8)
            ],
          },
        ],
        fields: "userEnteredValue", // Only update values, preserve existing cell styles
      },
    },
  ];

  console.log(
    `📤 Writing to row ${rowNum} using CORRECT structure: C=Staff, D=NHA TRANG, E=DA LAT, F/G=Morning, H/I=Afternoon:`,
    {
      "Column C (Staff)": staffName,
      "Column D (NHA TRANG)": nhaTrangValue || "(empty)",
      "Column E (DA LAT)": daLatValue || "(empty)",
      "Column F (Morning Start)": morningStart || "(empty)",
      "Column G (Morning End)": morningEnd || "(empty)",
      "Column H (Afternoon Start)": afternoonStart || "(empty)",
      "Column I (Afternoon End)": afternoonEnd || "(empty)",
      "Time period":
        startIsMorning && endIsMorning
          ? "Morning"
          : startIsMorning
          ? "Morning Start, Afternoon End"
          : "Afternoon",
    }
  );
  console.log(
    `📤 Schedule ID: ${scheduleId}, Row: ${rowNum}, GID: ${gid}, Sheet: ${sheetName}`
  );

  // First clear the range to remove any old data (C through I)
  // This ensures old values are completely removed before writing new ones
  const clearRange = `${sheetName}!C${rowNum}:I${rowNum}`;
  const clearResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${clearRange}:clear`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!clearResponse.ok) {
    const errorText = await clearResponse.text();
    console.warn(`⚠️ Clear failed (will continue anyway): ${errorText}`);
  } else {
    console.log(`✅ Cleared range ${clearRange} before writing new values`);
  }

  // Wait a moment for clear to complete
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Then write using batchUpdate
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Update failed:", errorText);
    throw new Error(`Failed to update fixed schedule: ${errorText}`);
  }

  const result = await response.json();
  console.log("✅ Update response:", result);
  return { success: true };
};

// Delete a fixed schedule and shift remaining rows up (array-like behavior)
export const deleteFixedSchedule = async (scheduleId) => {
  const match = scheduleId.match(/fixed-(\d+)-(\d+)-(.+)/);
  if (!match) throw new Error("Invalid schedule ID format");

  const rowNum = parseInt(match[1]); // 1-based row number
  console.log(`🗑️ Deleting fixed schedule in row ${rowNum}`);

  const accessToken = await getAccessToken();
  const gid = await getCurrentMonthSheetGID();

  // Get sheet name
  let sheetName = "DECEMBER"; // Default
  try {
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (sheetsResponse.ok) {
      const sheetsData = await sheetsResponse.json();
      const sheet = sheetsData.sheets?.find(
        (s) => s.properties?.sheetId?.toString() === gid
      );
      if (sheet) sheetName = sheet.properties.title;
    }
  } catch (e) {
    console.warn("Could not get sheet name, using default", e);
  }

  // Read all fixed schedule rows to find the last one and get data for shifting
  // IMPORTANT: Fixed schedules can expand dynamically (rows 1, 2, 3, 4, etc.)
  // The header row (with "BOOKING STAFF") marks the end of fixed schedules
  let lastFixedScheduleRow = rowNum;
  let allRowsData = [];

  try {
    // Read a range that includes fixed schedule rows and the header row
    // Fixed schedules can expand, so read more rows to find the header (rows 1-20)
    // Read columns C through I to include all fixed schedule data
    const readResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!C1:I20`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (readResponse.ok) {
      const data = await readResponse.json();
      const values = data.values || [];
      allRowsData = values;

      // Find the last row with valid fixed schedule data
      // Go forward and stop when we hit the header row (row 3 has "BOOKING STAFF" in column C)
      for (let i = 0; i < values.length; i++) {
        const row = values[i] || [];
        const staff = (row[0] || "").toString().trim().toUpperCase(); // Column C
        const room = (row[1] || "").toString().trim().toUpperCase(); // Column D (index 1 in C:I range)
        const morningStart = (row[3] || "").toString().trim(); // Column F (index 3 in C:I range)
        const morningEnd = (row[4] || "").toString().trim(); // Column G (index 4 in C:I range)
        const afternoonStart = (row[5] || "").toString().trim(); // Column H (index 5 in C:I range)
        const afternoonEnd = (row[6] || "").toString().trim(); // Column I (index 6 in C:I range)
        // Check if row has any time (morning or afternoon)
        const hasTime =
          morningStart || morningEnd || afternoonStart || afternoonEnd;

        // Check if this is the header row (row 3 typically has "BOOKING STAFF" in column C)
        if (
          staff === "BOOKING STAFF" ||
          (room.includes("MEETING ROOM") && room.includes("NHA TRANG"))
        ) {
          // This is the header row, so the last fixed schedule row is the previous one
          // Don't update lastFixedScheduleRow, keep the last valid one we found
          console.log(
            `🛑 Found header row at index ${i} (row ${i + 1}), stopping search`
          );
          break;
        }

        // Check if this row has valid fixed schedule data
        if (
          staff &&
          room &&
          hasTime &&
          staff !== "" &&
          room !== "" &&
          !room.includes("MEETING ROOM") &&
          staff !== "BOOKING STAFF"
        ) {
          lastFixedScheduleRow = i + 1; // Convert to 1-based (i=0 is row 1, i=1 is row 2)
          console.log(`✅ Found fixed schedule at row ${i + 1}`);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read rows for shifting, will just delete", e);
  }

  console.log(
    `📊 Last fixed schedule row: ${lastFixedScheduleRow}, deleting row: ${rowNum}`
  );
  console.log(`📊 All rows data length: ${allRowsData.length}`);

  const requests = [];

  // If there are rows after the deleted row, shift them up
  // IMPORTANT: Only shift within the fixed schedule area (rows 1-2, before header row 3)
  if (rowNum < lastFixedScheduleRow && allRowsData.length > 0) {
    console.log(
      `🔄 Shifting rows from ${rowNum + 1} to ${lastFixedScheduleRow} up by one`
    );

    // For each row from rowNum+1 to lastFixedScheduleRow, copy it up by one
    // allRowsData[0] = row 1, allRowsData[1] = row 2, etc.
    for (
      let sourceRow = rowNum + 1;
      sourceRow <= lastFixedScheduleRow;
      sourceRow++
    ) {
      const targetRow = sourceRow - 1; // The row to write to (one row up)
      const sourceIndex = sourceRow - 1; // Convert to 0-based index for array
      const sourceRowData = allRowsData[sourceIndex] || ["", "", "", "", ""];

      console.log(
        `📋 Shifting row ${sourceRow} to row ${targetRow}:`,
        sourceRowData
      );

      // Write source row's data to target row (shifting up)
      requests.push({
        updateCells: {
          range: {
            sheetId: parseInt(gid),
            startRowIndex: targetRow - 1, // Convert to 0-based (row 1 = index 0)
            endRowIndex: targetRow,
            startColumnIndex: 2, // Column C
            endColumnIndex: 9, // Column I (0-based: 9, exclusive) - includes C, D, E, F, G, H, I
          },
          rows: [
            {
              values: [
                { userEnteredValue: { stringValue: sourceRowData[0] || "" } }, // Column C
                { userEnteredValue: { stringValue: sourceRowData[1] || "" } }, // Column D
                { userEnteredValue: { stringValue: sourceRowData[2] || "" } }, // Column E
                { userEnteredValue: { stringValue: sourceRowData[3] || "" } }, // Column F
                { userEnteredValue: { stringValue: sourceRowData[4] || "" } }, // Column G
                { userEnteredValue: { stringValue: sourceRowData[5] || "" } }, // Column H
                { userEnteredValue: { stringValue: sourceRowData[6] || "" } }, // Column I
              ],
            },
          ],
          fields: "userEnteredValue", // Only update values, preserve existing cell styles
        },
      });
    }

    // Clear the last fixed schedule row after shifting (to remove the duplicate)
    console.log(
      `🧹 Clearing last fixed schedule row ${lastFixedScheduleRow} after shifting`
    );
    requests.push({
      updateCells: {
        range: {
          sheetId: parseInt(gid),
          startRowIndex: lastFixedScheduleRow - 1, // Convert to 0-based
          endRowIndex: lastFixedScheduleRow,
          startColumnIndex: 2, // Column C
          endColumnIndex: 9, // Column I (0-based: 9, exclusive) - includes C, D, E, F, G, H, I
        },
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: "" } }, // Column C
              { userEnteredValue: { stringValue: "" } }, // Column D
              { userEnteredValue: { stringValue: "" } }, // Column E
              { userEnteredValue: { stringValue: "" } }, // Column F
              { userEnteredValue: { stringValue: "" } }, // Column G
              { userEnteredValue: { stringValue: "" } }, // Column H
              { userEnteredValue: { stringValue: "" } }, // Column I
            ],
          },
        ],
        fields: "userEnteredValue", // Only update values, preserve existing cell styles
      },
    });
  } else {
    // No rows to shift, just clear the deleted row (columns C through I)
    requests.push({
      updateCells: {
        range: {
          sheetId: parseInt(gid),
          startRowIndex: rowNum - 1, // Convert to 0-based
          endRowIndex: rowNum,
          startColumnIndex: 2, // Column C
          endColumnIndex: 9, // Column I (0-based: 9, exclusive) - includes C, D, E, F, G, H, I
        },
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: "" } }, // Column C
              { userEnteredValue: { stringValue: "" } }, // Column D
              { userEnteredValue: { stringValue: "" } }, // Column E
              { userEnteredValue: { stringValue: "" } }, // Column F
              { userEnteredValue: { stringValue: "" } }, // Column G
              { userEnteredValue: { stringValue: "" } }, // Column H
              { userEnteredValue: { stringValue: "" } }, // Column I
            ],
          },
        ],
        fields: "userEnteredValue", // Only update values, preserve existing cell styles
      },
    });
  }

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Delete failed:", errorText);
    throw new Error(`Failed to delete fixed schedule: ${errorText}`);
  }

  const result = await response.json();
  console.log("✅ Delete response:", result);
  return { success: true };
};

// ==========================================
// NETWORK AUTHENTICATION (Dynamic IP Guard)
// ==========================================

const NETWORKS_SHEET_TITLE = "AUTHORIZED_NETWORKS";

// Ensure the AUTHORIZED_NETWORKS sheet exists, create if not
const ensureNetworksSheet = async (accessToken) => {
  try {
    // 1. Get Spreadsheet Metadata to check sheets
    const metaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    
    if (!metaResponse.ok) throw new Error("Failed to fetch spreadsheet metadata");
    const meta = await metaResponse.json();
    const existing = meta.sheets.find(s => s.properties.title === NETWORKS_SHEET_TITLE);
    
    if (existing) return existing.properties.sheetId;

    // 2. Create if missing
    console.log(`Creating sheet: ${NETWORKS_SHEET_TITLE}...`);
    const createResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: {
                title: NETWORKS_SHEET_TITLE,
                gridProperties: { rowCount: 1000, columnCount: 5 }
              }
            }
          }]
        }),
      }
    );
    
    if (!createResponse.ok) throw new Error("Failed to create networks sheet");
    const createResult = await createResponse.json();
    const newSheetId = createResult.replies[0].addSheet.properties.sheetId;
    
    // 3. Add Header Row
    await fetch(
       `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${NETWORKS_SHEET_TITLE}!A1:C1:append?valueInputOption=USER_ENTERED`,
       {
         method: "POST",
         headers: {
           Authorization: `Bearer ${accessToken}`,
           "Content-Type": "application/json",
         },
         body: JSON.stringify({
            values: [["IP Address", "Date Authorized", "User Agent"]]
         })
       }
    );
    
    return newSheetId;

  } catch (e) {
    console.error("Error ensuring networks sheet:", e);
    throw e;
  }
};

export const fetchAuthorizedNetworks = async () => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${NETWORKS_SHEET_TITLE}!A:A`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
       // If sheet doesn't exist, it's fine, just return empty
       const text = await response.text();
       if (text.includes("Unable to parse range") || response.status === 400 || response.status === 404) {
          return [];
       }
       throw new Error(`Failed to fetch networks: ${text}`);
    }

    const data = await response.json();
    if (!data.values || data.values.length <= 1) return []; // Header only

    // Return simple array of IPs (skip header)
    return data.values.slice(1).map(row => row[0]).filter(ip => ip);
  } catch (e) {
    console.warn("Failed to fetch authorized networks (sheet might not exist yet):", e);
    return [];
  }
};

export const authorizeNetwork = async (ip) => {
  try {
    const accessToken = await getAccessToken();
    await ensureNetworksSheet(accessToken);
    
    // Check if already exists (basic check to avoid duplicates)
    // Actually fetchAuthorizedNetworks does this, but for write safety:
    
    // Append the IP
    const values = [
      [
        ip, 
        new Date().toISOString(), 
        navigator.userAgent
      ]
    ];

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${NETWORKS_SHEET_TITLE}!A:C:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );
    
    if (!response.ok) throw new Error(await response.text());
    
    console.log(`✅ Authorized IP: ${ip}`);
    return true;
  } catch (e) {
    console.error("Failed to authorize network:", e);
    throw e;
  }
};
