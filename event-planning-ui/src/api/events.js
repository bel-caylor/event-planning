export async function fetchEventSnapshot(eventId, { signal } = {}) {
  const response = await fetch(
    `/wp-json/event-planning/v1/events/${encodeURIComponent(eventId)}`,
    { signal },
  )

  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      `Failed to load event ${eventId} (${response.status})`
    const err = new Error(message)
    err.status = response.status
    err.payload = payload
    throw err
  }

  return payload
}
