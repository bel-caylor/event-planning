import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import EventPage from './pages/EventPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/events/1" replace />} />
      <Route path="/events/:eventId" element={<EventPage />} />
      <Route
        path="*"
        element={
          <main className="page">
            <section className="panel">
              <h1>Page not found</h1>
              <p>Try visiting an event URL like /events/1.</p>
            </section>
          </main>
        }
      />
    </Routes>
  )
}

export default App
