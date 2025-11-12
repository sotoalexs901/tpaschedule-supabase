
import React, { useEffect, useState } from 'react'
import { db } from '../firebase'
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'

export default function DashboardPage() {
  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState([])
  const [docsList, setDocsList] = useState([])
  const [events, setEvents] = useState([])
  const [notices, setNotices] = useState([])

  useEffect(() => {
    async function load() {
      const mainRef = doc(db, 'dashboard', 'main')
      const mainSnap = await getDoc(mainRef)
      if (mainSnap.exists()) setMessage(mainSnap.data().message || '')

      const photosSnap = await getDocs(
        query(collection(db, 'dashboard_photos'), orderBy('createdAt', 'desc'), limit(5))
      )
      setPhotos(photosSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      const docsSnap = await getDocs(
        query(collection(db, 'dashboard_docs'), orderBy('createdAt', 'desc'), limit(5))
      )
      setDocsList(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      const eventsSnap = await getDocs(
        query(collection(db, 'dashboard_events'), orderBy('date', 'asc'), limit(10))
      )
      setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      const noticesSnap = await getDocs(
        query(collection(db, 'dashboard_notices'), orderBy('createdAt', 'desc'), limit(10))
      )
      setNotices(noticesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    load().catch(console.error)
  }, [])

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold mb-1">Station Manager Message</h2>
        <p className="text-sm whitespace-pre-line">{message || 'No notes yet.'}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Photos</h3>
          {photos.map(p => (
            <div key={p.id} className="text-xs space-y-1">
              <img src={p.url} alt={p.caption || 'photo'} className="w-full rounded-lg max-h-40 object-cover" />
              {p.caption && <div className="text-[11px] text-gray-600">{p.caption}</div>}
            </div>
          ))}
          {!photos.length && <p className="text-[11px] text-gray-400">No photos.</p>}
        </div>

        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Documents</h3>
          {docsList.map(d => (
            <div key={d.id} className="text-xs">
              <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {d.title || 'Document'}
              </a>
            </div>
          ))}
          {!docsList.length && <p className="text-[11px] text-gray-400">No documents.</p>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Upcoming Events</h3>
          {events.map(e => (
            <div key={e.id} className="text-xs">
              <div className="font-medium">{e.title}</div>
              <div className="text-[11px] text-gray-600">
                {e.date} {e.time ? `· ${e.time}` : ''}
              </div>
              {e.details && <div className="text-[11px] text-gray-500">{e.details}</div>}
            </div>
          ))}
          {!events.length && <p className="text-[11px] text-gray-400">No events.</p>}
        </div>

        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Notices / Invitations</h3>
          {notices.map(n => (
            <div key={n.id} className="text-xs">
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-[11px] text-gray-600">{n.body}</div>}
              {n.link && (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 underline"
                >
                  Open
                </a>
              )}
            </div>
          ))}
          {!notices.length && <p className="text-[11px] text-gray-400">No notices.</p>}
        </div>
      </div>
    </div>
  )
}
