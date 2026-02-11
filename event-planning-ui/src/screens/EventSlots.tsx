import * as React from 'react'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

type Slot = {
  id: number
  title: string
  remaining: number
}

const mockSlots: Slot[] = [
  { id: 101, title: 'Welcome shift', remaining: 3 },
  { id: 102, title: 'Registration desk', remaining: 0 },
  { id: 103, title: 'Speaker support', remaining: 5 },
  { id: 104, title: 'Room reset', remaining: 1 },
]

export default function EventSlots() {
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [signedUpSlot, setSignedUpSlot] = React.useState<Slot | null>(null)

  const filteredSlots = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return mockSlots
    return mockSlots.filter((slot) =>
      slot.title.toLowerCase().includes(normalized),
    )
  }, [query])

  function handleSignup(slot: Slot) {
    setLoading(true)
    setSignedUpSlot(null)
    window.setTimeout(() => {
      setSignedUpSlot(slot)
      setLoading(false)
    }, 600)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Event slots
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Volunteer Orientation
            </h1>
            <p className="text-sm text-slate-600">
              Saturday, March 15 · 9:00 AM - 12:00 PM
            </p>
          </div>
          <Badge variant="success">Open for signup</Badge>
        </div>
      </header>

      {signedUpSlot ? (
        <Alert variant="success">
          Signed up for {signedUpSlot.title}. We have you on the list.
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Slots</h2>
            <p className="text-sm text-slate-500">
              Filter and choose an available slot.
            </p>
          </div>
          <div className="min-w-[240px]">
            <Input
              label="Search slots"
              placeholder="Search by title"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-16 animate-pulse rounded-lg bg-slate-100"
                />
              ))}
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No slots match your search.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredSlots.map((slot) => {
                const isFull = slot.remaining === 0
                return (
                  <Card key={slot.id} className="border-slate-100">
                    <CardBody className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {slot.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          Slot #{slot.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={isFull ? 'warning' : 'default'}>
                          {isFull
                            ? 'Full'
                            : `${slot.remaining} remaining`}
                        </Badge>
                        <Button
                          size="sm"
                          disabled={isFull || loading}
                          onClick={() => handleSignup(slot)}
                        >
                          Sign up
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
