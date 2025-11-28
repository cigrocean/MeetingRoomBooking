import Papa from "papaparse";
import {
  isWithinInterval,
  parse,
  set,
  getYear,
  getMonth,
  format,
} from "date-fns";

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
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
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

export const fetchBookings = async () => {
  try {
    // Get the current month's sheet GID
    const gid = await getCurrentMonthSheetGID();
    const csvUrl = getCSVUrl(gid);
    const response = await fetch(csvUrl);
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        complete: (results) => {
          const rows = results.data;
          const bookings = [];

          if (rows.length < 5) {
            resolve([]);
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
                bookings.push({
                  id: `${roomId}-${i}-${startStr}-${endStr}`,
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

  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
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

  // Helper function to get the start time from a row (morning or afternoon)
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

      // Collect all rows with the same date, along with their row numbers and start times
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
  const dateValue = parseInt(targetDate); // Store as number, not string

  // Determine the exact dropdown values from existing rows
  // Prioritize sampleRowWithRoom (has actual room assignments) over existingRowFormat
  // The sample row shows the correct dropdown format (e.g., "NHA TRANG" not "TRUE")
  const referenceRow = sampleRowWithRoom || existingRowFormat;

  let roomNhaTrang = "";
  let roomDaLat = "";

  if (referenceRow) {
    // Check what value is used for rooms in existing rows
    const nhaTrangValue = referenceRow[3]?.toString().trim();
    const daLatValue = referenceRow[4]?.toString().trim();

    console.log(
      `🔍 Found reference row - NHA TRANG: "${nhaTrangValue}", DA LAT: "${daLatValue}"`
    );

    // Use the exact value format from the reference row
    // If reference row doesn't have the room we need, check sampleRowWithRoom specifically
    if (booking.room_id === "nha-trang") {
      if (nhaTrangValue) {
        roomNhaTrang = nhaTrangValue; // Use the exact format found
      } else if (sampleRowWithRoom && sampleRowWithRoom[3]) {
        // Fallback to sample row if reference doesn't have it
        roomNhaTrang = sampleRowWithRoom[3].toString().trim();
      } else {
        roomNhaTrang = "NHA TRANG"; // Final fallback
      }
    }

    if (booking.room_id === "da-lat") {
      if (daLatValue) {
        roomDaLat = daLatValue; // Use the exact format found
      } else if (sampleRowWithRoom && sampleRowWithRoom[4]) {
        // Fallback to sample row if reference doesn't have it
        roomDaLat = sampleRowWithRoom[4].toString().trim();
      } else {
        roomDaLat = "DA LAT"; // Final fallback
      }
    }
  } else {
    // No reference row found, use room names (most common dropdown format)
    roomNhaTrang = booking.room_id === "nha-trang" ? "NHA TRANG" : "";
    roomDaLat = booking.room_id === "da-lat" ? "DA LAT" : "";
  }

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
      // Step 1: Insert a new row
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

      // Step 2: Copy entire row (formatting + values) from row above, then overwrite values
      // This ensures all formatting including table borders are copied
      // Determine source row for copying formatting:
      // - If inserting at row 6 (empty table), copy from row 5 (header row) or last data row if exists
      // - Otherwise, copy from the row above
      let sourceRowForFormat = null;

      if (insertRowIndex === 6) {
        // Empty table - try to copy from row 5 (header row) or find any existing data row
        // Check if there's a data row we can copy from
        if (existingRowFormat) {
          // We have a reference to an existing row, use its row number
          // But existingRowFormat is from the CSV data, we need to find its actual row number
          // For now, try row 5 (header row)
          sourceRowForFormat = 5;
        } else {
          // No data rows exist, copy from row 5 (header row)
          sourceRowForFormat = 5;
        }
      } else if (insertRowIndex > 6) {
        // Not empty table - copy from row above
        sourceRowForFormat = insertRowIndex - 1;
      }

      // Copy formatting if we have a source row
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
          // Now we'll overwrite just the values below
        } catch (e) {
          console.warn(
            `⚠️ Could not copy formatting from row ${sourceRowForFormat}:`,
            e
          );
          // Continue anyway - we'll still write the values
        }
      }

      // Step 3: Update the newly inserted row with our values
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
        `✅ Booking created successfully at row ${insertRowIndex} with table formatting:`,
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

export const getRoomStatus = (roomId, bookings) => {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  // Helper to check if a date is today (ignoring time)
  const isToday = (dateString) => {
    try {
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
    if (!b || b.room_id !== roomId) return false;
    if (!b.start_time || !b.end_time) return false;
    return isToday(b.start_time);
  });

  // Check if there's a current booking (now is within booking time range)
  // A room is occupied if: start <= now < end
  const currentBooking = roomBookings.find((b) => {
    try {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);

      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      // Use getTime() for precise comparison
      const nowTime = now.getTime();
      const startTime = start.getTime();
      const endTime = end.getTime();

      // Room is occupied if current time is >= start and < end
      return nowTime >= startTime && nowTime < endTime;
    } catch (e) {
      return false;
    }
  });

  // Find next upcoming booking for today (even if it hasn't started yet)
  const nextBooking = roomBookings
    .filter((b) => {
      try {
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        // Get bookings that haven't ended yet (include current and future)
        return end.getTime() > now.getTime();
      } catch (e) {
        return false;
      }
    })
    .sort((a, b) => {
      try {
        const aTime = new Date(a.start_time).getTime();
        const bTime = new Date(b.start_time).getTime();
        return aTime - bTime;
      } catch (e) {
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
  return {
    status: "available",
    nextBooking: nextBooking || null,
  };
};

// Extract unique time slots from CSV data
export const fetchAvailableTimeSlots = async () => {
  try {
    // Get the current month's sheet GID
    const gid = await getCurrentMonthSheetGID();
    const csvUrl = getCSVUrl(gid);
    const response = await fetch(csvUrl);
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        complete: (results) => {
          const rows = results.data;
          const timeSet = new Set();

          // Iterate through rows starting from index 4 (where data starts)
          for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row[0]) continue; // Skip empty dates

            // Extract times from columns 5, 6, 7, 8 (morning start/end, afternoon start/end)
            const times = [row[5], row[6], row[7], row[8]];

            times.forEach((timeStr) => {
              if (timeStr && timeStr.trim()) {
                // Normalize time format (handle both "9:00" and "09:00")
                const normalized = timeStr.trim();
                // Validate it's a time format (H:mm or HH:mm)
                if (/^\d{1,2}:\d{2}$/.test(normalized)) {
                  // Convert to HH:mm format
                  const [hours, mins] = normalized.split(":");
                  const formatted = `${hours.padStart(2, "0")}:${mins}`;
                  timeSet.add(formatted);
                }
              }
            });
          }

          // Convert to array and sort
          const timeSlots = Array.from(timeSet).sort((a, b) => {
            const [aHours, aMins] = a.split(":").map(Number);
            const [bHours, bMins] = b.split(":").map(Number);
            return aHours * 60 + aMins - (bHours * 60 + bMins);
          });

          resolve(timeSlots);
        },
        error: (err) => {
          console.error("CSV Parse Error", err);
          reject(err);
        },
      });
    });
  } catch (error) {
    console.error("Fetch Error", error);
    // Return default time slots if fetch fails
    return [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "17:00",
      "18:00",
    ];
  }
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
