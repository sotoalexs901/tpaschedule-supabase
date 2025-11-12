
import React, { useState } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useUser } from '../UserContext.jsx'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const { setUser } = useUser()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!username || !pin) {
      setError('Enter user and PIN')
      return
    }
    const q = query(
      collection(db, 'users'),
      where('username', '==', username),
      where('pin', '==', pin)
    )
    const snap = await getDocs(q)
    if (snap.empty) {
      setError('Invalid user or PIN')
      return
    }
    const doc = snap.docs[0]
    const data = doc.data()
    setUser({ id: doc.id, username: data.username, role: data.role })
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="card w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold text-center">TPA Schedule Login</h1>
        <div className="space-y-1 text-sm">
          <label className="font-medium">User</label>
          <input
            className="border rounded w-full px-2 py-1"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-1 text-sm">
          <label className="font-medium">PIN</label>
          <input
            className="border rounded w-full px-2 py-1"
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
          />
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button className="btn btn-primary w-full" type="submit">
          Login
        </button>
      </form>
    </div>
  )
}
