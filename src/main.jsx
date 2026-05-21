import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Join from './pages/Join'
import Wait from './pages/Wait'
import Moderator from './pages/Moderator'
import AdminLogin from './pages/AdminLogin'
import Question from './pages/Question'
import Leaderboard from './pages/Leaderboard'
import Winner from './pages/Winner'
import './index.css'
import Admin from './pages/Admin'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/join/:sessionId" element={<Join />} />
      <Route path="/wait/:sessionId/:participantId" element={<Wait />} />
      <Route path="/LFchamp8055" element={<Moderator />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/question/:sessionId/:participantId" element={<Question />} />
      <Route path="/leaderboard/:sessionId" element={<Leaderboard />} />
      <Route path="/winner/:sessionId" element={<Winner />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  </BrowserRouter>
)
