function padTwo(value) {
  return String(value).padStart(2, "0");
}

/** Return a Date value in the local YYYY-MM-DD format expected by date inputs. */
export function getLocalDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}
