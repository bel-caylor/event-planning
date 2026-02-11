const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
}

function buildHeaders(nonce) {
  if (!nonce) return DEFAULT_HEADERS
  return {
    ...DEFAULT_HEADERS,
    'X-WP-Nonce': nonce,
  }
}

async function parseJson(response) {
  try {
    return await response.json()
  } catch (error) {
    return null
  }
}

function normalizeError(response, payload) {
  const status = response?.status ?? null
  const errors = payload?.errors ?? []
  const snapshot = payload?.data?.availability || payload?.data?.snapshot || null
  return { status, errors, snapshot }
}

async function request(path, { method = 'GET', body, nonce, signal } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: buildHeaders(nonce),
    signal,
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(path, options)
  const payload = await parseJson(response)

  if (!response.ok) {
    const error = new Error(
      payload?.errors?.[0]?.message || `Request failed (${response.status})`,
    )
    error.details = normalizeError(response, payload)
    throw error
  }

  return payload
}

export function getEvent(eventId, options = {}) {
  return request(`/wp-json/event-planning/v1/events/${eventId}`, options)
}

export function createSignup(payload, options = {}) {
  return request('/wp-json/event-planning/v1/signups', {
    ...options,
    method: 'POST',
    body: payload,
  })
}

export function cancelSignup(signupId, payload = {}, options = {}) {
  return request(`/wp-json/event-planning/v1/signups/${signupId}/cancel`, {
    ...options,
    method: 'POST',
    body: payload,
  })
}

export { normalizeError }
