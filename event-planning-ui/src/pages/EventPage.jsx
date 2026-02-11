import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cancelSignup, createSignup, getEvent } from '../api/client.js'

const EMPTY_EVENT = {
  id: null,
  title: 'Untitled event',
  description: '',
  slots: [],
}

function formatTimestamp(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function extractSnapshot(payload) {
  const data = payload?.data
  if (!data) return null
  if (data.event) return data
  if (data.snapshot) return data.snapshot
  return null
}

function extractAvailability(payload) {
  return payload?.data?.availability || null
}

export default function EventPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [serverSnapshot, setServerSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [devEventId, setDevEventId] = useState(eventId || '')
  const [devResetting, setDevResetting] = useState(false)
  const [devResetMessage, setDevResetMessage] = useState('')

  useEffect(() => {
    if (!eventId) {
      setServerSnapshot(null)
      setLoading(false)
      setError(new Error('Missing event id.'))
      return
    }
    setDevEventId(eventId)

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    getEvent(eventId, { signal: controller.signal })
      .then((payload) => {
        setServerSnapshot(payload?.data || null)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err)
        setLoading(false)
      })

    return () => controller.abort()
  }, [eventId])

  async function handleDevReset() {
    setDevResetting(true)
    setDevResetMessage('')
    try {
      const headers = {}
      const devSecret = import.meta.env.VITE_EP_DEV_SECRET
      if (devSecret) {
        headers['x-ep-dev-secret'] = devSecret
      }
      const response = await fetch('/wp-json/event-planning/v1/dev/reset', {
        method: 'POST',
        credentials: 'include',
        headers,
      })
      if (!response.ok) {
        const message = `Reset failed (${response.status})`
        setDevResetMessage(message)
      } else {
        setDevResetMessage('Reset complete. Refreshing snapshot...')
        await refreshEventSnapshot()
      }
    } catch (err) {
      setDevResetMessage(err.message)
    } finally {
      setDevResetting(false)
    }
  }

  const event = serverSnapshot?.event || null
  const slots = event?.slots || []
  const mySignups = serverSnapshot?.my_signups || []

  const slotSummary = useMemo(() => {
    return slots.map((slot) => ({
      id: slot.slot_id,
      availability: slot.availability,
      canSignup: slot.can_signup,
      canCancel: slot.can_cancel,
      canEdit: slot.can_edit,
      canClaim: slot.can_claim,
      maxQty: slot.max_qty,
      cutoffAt: slot.cutoff_at,
      locked: slot.locked,
    }))
  }, [slots])

  async function refreshEventSnapshot() {
    const payload = await getEvent(eventId)
    setServerSnapshot(payload?.data || null)
  }

  function applyAvailabilitySnapshot(availability) {
    if (!availability?.slot_id) return false
    setServerSnapshot((current) => {
      if (!current?.event?.slots) return current
      const nextSlots = current.event.slots.map((slot) => {
        if (slot.slot_id !== availability.slot_id) return slot
        return {
          ...slot,
          availability,
          can_signup: availability.can_signup ?? slot.can_signup,
          reason: availability.reason ?? slot.reason,
        }
      })
      return {
        ...current,
        event: {
          ...current.event,
          slots: nextSlots,
        },
      }
    })
    return true
  }

  async function handleSignup(slotId) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = await createSignup({ slot_id: slotId, qty: 1 })
      const nextSnapshot = extractSnapshot(payload)
      if (nextSnapshot) {
        setServerSnapshot(nextSnapshot)
      } else if (!applyAvailabilitySnapshot(extractAvailability(payload))) {
        await refreshEventSnapshot()
      }
    } catch (err) {
      const details = err?.details
      setSubmitError(details?.errors?.[0]?.message || err.message)
      const nextSnapshot = details?.snapshot || extractSnapshot(err?.payload)
      if (nextSnapshot?.event) {
        setServerSnapshot(nextSnapshot)
      } else {
        applyAvailabilitySnapshot(details?.snapshot)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(signupId) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = await cancelSignup(signupId, {})
      const nextSnapshot = extractSnapshot(payload)
      if (nextSnapshot) {
        setServerSnapshot(nextSnapshot)
      } else if (!applyAvailabilitySnapshot(extractAvailability(payload))) {
        await refreshEventSnapshot()
      }
    } catch (err) {
      const details = err?.details
      setSubmitError(details?.errors?.[0]?.message || err.message)
      const nextSnapshot = details?.snapshot || extractSnapshot(err?.payload)
      if (nextSnapshot?.event) {
        setServerSnapshot(nextSnapshot)
      } else {
        applyAvailabilitySnapshot(details?.snapshot)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="page">
        <section className="panel">
          <p className="eyebrow">Event snapshot</p>
          <h1>Loading event...</h1>
          <p className="muted">Fetching the latest server snapshot.</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page">
        <section className="panel">
          <p className="eyebrow">Event snapshot</p>
          <h1>Unable to load event</h1>
          <p className="muted">{error.message}</p>
        </section>
      </main>
    )
  }

  if (!event) {
    return (
      <main className="page">
        <section className="panel">
          <p className="eyebrow">Event snapshot</p>
          <h1>No event data</h1>
          <p className="muted">
            The server did not return an event snapshot for this id.
          </p>
        </section>
      </main>
    )
  }

  const safeEvent = { ...EMPTY_EVENT, ...event }

  return (
    <main className="page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Event snapshot</p>
            <h1>{safeEvent.title}</h1>
            <p className="muted">
              Event ID: {safeEvent.id ?? eventId} · Status:{' '}
              {safeEvent.status ?? 'unknown'}
            </p>
          </div>
          <div className="meta-block">
            <p>
              <span className="label">Starts</span>
              {formatTimestamp(safeEvent.starts_at)}
            </p>
            <p>
              <span className="label">Ends</span>
              {formatTimestamp(safeEvent.ends_at)}
            </p>
          </div>
        </div>

        {safeEvent.description ? (
          <p className="description">{safeEvent.description}</p>
        ) : (
          <p className="muted">No description provided.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Availability</p>
            <h2>Slots</h2>
          </div>
          <div className="meta-block">
            <p>
              <span className="label">My signups</span>
              {mySignups.length}
            </p>
          </div>
        </div>

        {submitError ? (
          <p className="muted">Action failed: {submitError}</p>
        ) : null}

        {slots.length === 0 ? (
          <p className="muted">No slots are available for this event yet.</p>
        ) : (
          <div className="slot-grid">
            {slotSummary.map((slot) => (
              <article key={slot.id} className="slot-card">
                <header>
                  <h3>Slot {slot.id}</h3>
                  <p className="muted">
                    Max per signup: {slot.maxQty ?? 'n/a'}
                  </p>
                </header>
                <div className="slot-metrics">
                  <p>
                    <span className="label">Remaining</span>
                    {slot.availability?.remaining ?? 'n/a'}
                  </p>
                  <p>
                    <span className="label">Can signup</span>
                    {String(slot.availability?.can_signup ?? false)}
                  </p>
                  <p>
                    <span className="label">Reason</span>
                    {slot.availability?.reason ?? 'none'}
                  </p>
                </div>
                <div className="slot-actions">
                  <button
                    type="button"
                    disabled={submitting || !slot.availability?.can_signup}
                    onClick={() => handleSignup(slot.id)}
                  >
                    {submitting ? 'Submitting...' : 'Sign up'}
                  </button>
                </div>
                <div className="slot-flags">
                  <p>
                    <span className="label">Locked</span>
                    {String(slot.locked ?? false)}
                  </p>
                  <p>
                    <span className="label">Cutoff</span>
                    {formatTimestamp(slot.cutoffAt)}
                  </p>
                  <p>
                    <span className="label">Can cancel</span>
                    {String(slot.canCancel ?? false)}
                  </p>
                  <p>
                    <span className="label">Can edit</span>
                    {String(slot.canEdit ?? false)}
                  </p>
                  <p>
                    <span className="label">Can claim</span>
                    {String(slot.canClaim ?? false)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">My signups</p>
            <h2>Signups</h2>
          </div>
        </div>
        {mySignups.length === 0 ? (
          <p className="muted">No signups yet.</p>
        ) : (
          <div className="slot-grid">
            {mySignups.map((signup) => (
              <article key={signup.id} className="slot-card">
                <header>
                  <h3>Signup {signup.id}</h3>
                  <p className="muted">
                    Slot {signup.slot_id} · Qty {signup.qty}
                  </p>
                </header>
                <div className="slot-metrics">
                  <p>
                    <span className="label">Status</span>
                    {signup.status}
                  </p>
                  <p>
                    <span className="label">Can cancel</span>
                    {String(signup.can_cancel ?? false)}
                  </p>
                </div>
                <div className="slot-actions">
                  <button
                    type="button"
                    disabled={submitting || !signup.can_cancel}
                    onClick={() => handleCancel(signup.id)}
                  >
                    {submitting ? 'Submitting...' : 'Cancel'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {import.meta.env.DEV ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Dev mode</p>
              <h2>Local helpers</h2>
            </div>
          </div>
          <div className="slot-grid">
            <article className="slot-card">
              <header>
                <h3>Navigate to event</h3>
                <p className="muted">Jump to a specific event id.</p>
              </header>
              <div className="slot-actions">
                <input
                  className="dev-input"
                  type="text"
                  value={devEventId}
                  onChange={(event) => setDevEventId(event.target.value)}
                  placeholder="Event id"
                />
                <button
                  type="button"
                  disabled={!devEventId}
                  onClick={() => navigate(`/events/${devEventId}`)}
                >
                  Go
                </button>
              </div>
            </article>
            <article className="slot-card">
              <header>
                <h3>Reset demo data</h3>
                <p className="muted">
                  Calls the dev reset endpoint for local testing.
                </p>
              </header>
              <div className="slot-actions">
                <button
                  type="button"
                  disabled={devResetting}
                  onClick={handleDevReset}
                >
                  {devResetting ? 'Resetting...' : 'Reset event data'}
                </button>
              </div>
              {devResetMessage ? (
                <p className="muted">{devResetMessage}</p>
              ) : null}
            </article>
          </div>
        </section>
      ) : null}
    </main>
  )
}
