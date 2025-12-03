export const translations = {
  en: {
    // Dashboard
    pageTitle: "Cigro Meeting Rooms Booking",
    meetingRooms: "Cigro Meeting Rooms Booking",
    realTimeStatus: "Real-time availability status",
    updated: "Updated",
    refresh: "Refresh",

    // Room Card
    available: "Available",
    occupied: "Occupied",
    bookRoom: "Book Room",
    busyUntil: "Busy until",
    bookedBy: "Booked by",
    bookedFrom: "Booked from",
    until: "Until",
    freeForRestOfDay: "Free for the rest of the day",
    unknown: "Unknown",
    largeRoom: "Large Room",
    smallRoom: "Small Room",

    // Booking Modal
    bookMeetingRoom: "Book Meeting Room",
    close: "Close",
    meetingTitle: "Meeting Title (Staff Name)",
    meetingTitlePlaceholder: "e.g. Ocean",
    selectDate: "Select Date",
    startTime: "Start Time",
    endTime: "End Time",
    summary: "Summary",
    room: "Room",
    date: "Date",
    time: "Time",
    confirmBooking: "Confirm Booking",
    booking: "Booking...",

    // Errors
    pleaseSelectValidDate: "Please select a valid date.",
    invalidDateFormat: "Invalid date format. Please select a valid date.",
    cannotBookInPast:
      "Cannot book in the past. Please select today or a future date.",
    cannotBookInPastTime:
      "Cannot book in the past. Please select a future date and time.",
    endTimeAfterStart: "End time must be after start time",
    invalidDateSelected: "Invalid date selected. Please select a valid date.",
    roomAlreadyBooked:
      "This room is already booked from {start} to {end}. Please choose a different time.",
    conflictsWithFixedSchedule:
      "This time conflicts with a fixed schedule ({time}). Please choose a different time.",
    pleaseChooseDifferentTime: "Please choose a different time.",
    pleaseSelectBothTimes: "Please select both start and end times.",
    invalidTimeFormat: "Invalid time format. Please select valid times.",
    invalidTimeValues: "Invalid time values. Please select valid times.",
    selectStartTime: "Select start time",
    selectEndTime: "Select end time",
    noAvailableTimes: "No available times (all past today)",
    today: "Today",
    room: "Room",
    date: "Date",
    time: "Time",

    // Success/Error Messages
    bookingSuccessful: "Booking Successful!",
    bookingFailed: "Booking Failed",
    bookingCreatedSuccessfully: "Your booking has been created successfully.",
    bookingAddedToRow:
      "Your booking has been added to row {rowNumber} in the sheet.",
    bookingSuccessfulToast: "Booking successful! Added to row {rowNumber}.",
    theSheet: "the sheet",
    bookingFailedToast: "Booking failed. Please try again.",
    errorOccurred:
      "An error occurred while creating your booking. Please try again.",
    viewInGoogleSheets: "View in Google Sheets",
    done: "Done",

    // Language Switcher
    language: "Language",
    english: "English",
    korean: "Korean",

    // Sheet Errors
    unableToBookForMonth:
      'Unable to book for {month} {year}. The sheet for this month doesn\'t exist yet. Please create a sheet named "{monthName1} {year}" or "{monthName2} {year}" in your Google Spreadsheet before booking.',
    failedToAccessSheet:
      "Failed to access the sheet for {month} {year}. {error}",

    // Credit Section
    vibeCodedBy: "Yes, this was 100% vibe-coded by",
    checkAnotherWork: "Check another work — SwaggerNav",
    github: "GitHub",

    // View Sheet
    viewSheet: "View Google Sheet",

    // Fixed Schedule Modal
    manageFixedSchedules: "Manage Fixed Schedules",
    editFixedSchedule: "Edit Fixed Schedule",
    createNewFixedSchedule: "Create New Fixed Schedule",
    staffName: "Staff Name",
    enterStaffName: "Enter staff name",
    selectRoom: "Select a room",
    selectStartTime: "Select start time",
    selectEndTime: "Select end time",
    saving: "Saving...",
    updateSchedule: "Update Schedule",
    createSchedule: "Create Schedule",
    cancel: "Cancel",
    fixedSchedules: "Fixed Schedules",
    resetForm: "Reset Form",
    reset: "Reset",
    refreshSchedules: "Refresh Schedules",
    refresh: "Refresh",
    loading: "Loading...",
    noFixedSchedulesFound: "No fixed schedules found",
    row: "Row",
    edit: "Edit",
    delete: "Delete",
    appliesTo: "Applies to:",
    staffNameRequired: "Staff name is required",
    pleaseSelectRoom: "Please select a room",
    pleaseSelectBothTimes: "Please select both start and end times",
    endTimeAfterStart: "End time must be after start time",
    confirmDeleteSchedule: "Are you sure you want to delete this fixed schedule?",
    failedToLoadSchedules: "Failed to load fixed schedules",
    failedToDeleteSchedule: "Failed to delete fixed schedule",
    failedToSaveSchedule: "Failed to save fixed schedule",
    day: "Day",
    cannotCreateFixedScheduleConflict: "Cannot create fixed schedule: conflicts with existing booking on {date} ({staff}) from {startTime} to {endTime}",
    cannotUpdateFixedScheduleConflict: "Cannot update fixed schedule: conflicts with existing booking on {date} ({staff}) from {startTime} to {endTime}",
    cannotCreateFixedScheduleConflictFixed: "Cannot create fixed schedule: conflicts with existing fixed schedule ({staff}) from {startTime} to {endTime}",
    cannotUpdateFixedScheduleConflictFixed: "Cannot update fixed schedule: conflicts with existing fixed schedule ({staff}) from {startTime} to {endTime}",
    fixedScheduleUpdatedSuccessfully: "Fixed schedule updated successfully",
    fixedScheduleCreatedSuccessfully: "Fixed schedule created successfully",
  },
  ko: {
    // Dashboard
    pageTitle: "Cigro 회의실 예약",
    meetingRooms: "Cigro 회의실 예약",
    realTimeStatus: "실시간 예약 현황",
    updated: "업데이트",
    refresh: "새로고침",

    // Room Card
    available: "사용 가능",
    occupied: "사용 중",
    bookRoom: "회의실 예약",
    busyUntil: "사용 중, 종료 시간",
    bookedBy: "예약자",
    bookedFrom: "예약 시작",
    until: "까지",
    freeForRestOfDay: "오늘 하루 사용 가능",
    unknown: "알 수 없음",
    largeRoom: "대형 회의실",
    smallRoom: "소형 회의실",

    // Booking Modal
    bookMeetingRoom: "회의실 예약",
    close: "닫기",
    meetingTitle: "회의 제목 (직원 이름)",
    meetingTitlePlaceholder: "예: Ocean",
    selectDate: "날짜 선택",
    startTime: "시작 시간",
    endTime: "종료 시간",
    summary: "요약",
    room: "회의실",
    date: "날짜",
    time: "시간",
    confirmBooking: "예약 확인",
    booking: "예약 중...",

    // Errors
    pleaseSelectValidDate: "유효한 날짜를 선택해주세요.",
    invalidDateFormat:
      "날짜 형식이 올바르지 않습니다. 유효한 날짜를 선택해주세요.",
    cannotBookInPast:
      "과거 날짜는 예약할 수 없습니다. 오늘 또는 미래 날짜를 선택해주세요.",
    cannotBookInPastTime:
      "과거 시간은 예약할 수 없습니다. 미래 날짜와 시간을 선택해주세요.",
    endTimeAfterStart: "종료 시간은 시작 시간보다 늦어야 합니다",
    invalidDateSelected:
      "선택한 날짜가 유효하지 않습니다. 유효한 날짜를 선택해주세요.",
    roomAlreadyBooked:
      "이 회의실은 {start}부터 {end}까지 이미 예약되어 있습니다. 다른 시간을 선택해주세요.",
    conflictsWithFixedSchedule:
      "이 시간은 고정 일정({time})과 충돌합니다. 다른 시간을 선택해주세요.",
    pleaseChooseDifferentTime: "다른 시간을 선택해주세요.",
    pleaseSelectBothTimes: "시작 시간과 종료 시간을 모두 선택해주세요.",
    invalidTimeFormat:
      "시간 형식이 올바르지 않습니다. 유효한 시간을 선택해주세요.",
    invalidTimeValues:
      "시간 값이 올바르지 않습니다. 유효한 시간을 선택해주세요.",
    selectStartTime: "시작 시간 선택",
    selectEndTime: "종료 시간 선택",
    noAvailableTimes:
      "사용 가능한 시간이 없습니다 (오늘의 모든 시간이 지났습니다)",
    today: "오늘",
    room: "회의실",
    date: "날짜",
    time: "시간",

    // Success/Error Messages
    bookingSuccessful: "예약 성공!",
    bookingFailed: "예약 실패",
    bookingCreatedSuccessfully: "예약이 성공적으로 생성되었습니다.",
    bookingAddedToRow: "예약이 시트의 {rowNumber}행에 추가되었습니다.",
    bookingSuccessfulToast: "예약 성공! {rowNumber}행에 추가되었습니다.",
    theSheet: "시트",
    bookingFailedToast: "예약에 실패했습니다. 다시 시도해주세요.",
    errorOccurred: "예약 생성 중 오류가 발생했습니다. 다시 시도해주세요.",
    viewInGoogleSheets: "Google 시트에서 보기",
    done: "완료",

    // Language Switcher
    language: "언어",
    english: "English",
    korean: "한국어",

    // Sheet Errors
    unableToBookForMonth:
      '{month} {year}에 예약할 수 없습니다. 이 달의 시트가 아직 존재하지 않습니다. 예약하기 전에 Google 스프레드시트에 "{monthName1} {year}" 또는 "{monthName2} {year}"라는 이름의 시트를 만들어주세요.',
    failedToAccessSheet:
      "{month} {year}의 시트에 액세스하는 데 실패했습니다. {error}",

    // Credit Section
    vibeCodedBy: "네, 이것은 100% 바이브 코딩으로 만들어졌습니다. 제작자:",
    checkAnotherWork: "다른 작품 보기 — SwaggerNav",
    github: "GitHub",

    // View Sheet
    viewSheet: "Google 시트 보기",

    // Fixed Schedule Modal
    manageFixedSchedules: "고정 일정 관리",
    editFixedSchedule: "고정 일정 편집",
    createNewFixedSchedule: "새 고정 일정 만들기",
    staffName: "직원 이름",
    enterStaffName: "직원 이름 입력",
    selectRoom: "회의실 선택",
    selectStartTime: "시작 시간 선택",
    selectEndTime: "종료 시간 선택",
    saving: "저장 중...",
    updateSchedule: "일정 업데이트",
    createSchedule: "일정 만들기",
    cancel: "취소",
    fixedSchedules: "고정 일정",
    resetForm: "양식 초기화",
    reset: "초기화",
    refreshSchedules: "일정 새로고침",
    refresh: "새로고침",
    loading: "로딩 중...",
    noFixedSchedulesFound: "고정 일정이 없습니다",
    row: "행",
    edit: "편집",
    delete: "삭제",
    appliesTo: "적용 대상:",
    staffNameRequired: "직원 이름은 필수입니다",
    pleaseSelectRoom: "회의실을 선택해주세요",
    pleaseSelectBothTimes: "시작 시간과 종료 시간을 모두 선택해주세요",
    endTimeAfterStart: "종료 시간은 시작 시간보다 늦어야 합니다",
    confirmDeleteSchedule: "이 고정 일정을 삭제하시겠습니까?",
    failedToLoadSchedules: "고정 일정을 불러오는데 실패했습니다",
    failedToDeleteSchedule: "고정 일정을 삭제하는데 실패했습니다",
    failedToSaveSchedule: "고정 일정을 저장하는데 실패했습니다",
    day: "요일",
    cannotCreateFixedScheduleConflict: "고정 일정을 생성할 수 없습니다: {date} ({staff})의 기존 예약과 충돌합니다 ({startTime} ~ {endTime})",
    cannotUpdateFixedScheduleConflict: "고정 일정을 업데이트할 수 없습니다: {date} ({staff})의 기존 예약과 충돌합니다 ({startTime} ~ {endTime})",
    cannotCreateFixedScheduleConflictFixed: "고정 일정을 생성할 수 없습니다: 기존 고정 일정 ({staff}, {startTime} ~ {endTime})과 충돌합니다",
    cannotUpdateFixedScheduleConflictFixed: "고정 일정을 업데이트할 수 없습니다: 기존 고정 일정 ({staff}, {startTime} ~ {endTime})과 충돌합니다",
    fixedScheduleUpdatedSuccessfully: "고정 일정이 성공적으로 업데이트되었습니다",
    fixedScheduleCreatedSuccessfully: "고정 일정이 성공적으로 생성되었습니다",
  },
};

export const getTranslation = (key, language = "en", params = {}) => {
  const translation =
    translations[language]?.[key] || translations.en[key] || key;

  // Replace parameters in translation string
  if (params && Object.keys(params).length > 0) {
    return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] || match;
    });
  }

  return translation;
};
