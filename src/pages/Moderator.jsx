import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Moderator() {
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [questions, setQuestions] = useState([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [sessionStatus, setSessionStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [quizzes, setQuizzes] = useState([])
  const [selectedQuizId, setSelectedQuizId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadQuizzes()
    loadSessions()
  }, [])

  const loadQuizzes = async () => {
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false })
    setQuizzes(data || [])
  }

  const loadSessions = async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('sessions')
      .select('*, quizzes(name, question_order)')
      .neq('status', 'finished')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
    setSessions(data || [])
  }

  const createSession = async () => {
    if (!selectedQuizId) return
    setCreating(true)
    setMessage(null)
    const { data, error } = await supabase
      .from('sessions')
      .insert({ quiz_id: selectedQuizId, status: 'waiting' })
      .select('*, quizzes(name, question_order)')
      .single()
    if (error) {
      setMessage({ type: 'error', text: 'Failed to create session' })
    } else {
      setMessage({ type: 'success', text: 'Session created! Lobby is now showing QR code.' })
      loadSessions()
      selectSession(data)
    }
    setCreating(false)
  }

  const shuffle = (array) => {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const selectSession = async (session) => {
    setSelectedSession(session)
    setSessionStatus(session.status)
    const { data: parts } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', session.id)
      .order('joined_at')
    setParticipants(parts || [])

    const quizId = session.quiz_id
    const { data: quiz } = await supabase
      .from('quizzes')
      .select('question_order')
      .eq('id', quizId)
      .single()

    const { data: qs } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('order_index')

    const orderedQs = quiz?.question_order === 'random' ? shuffle(qs || []) : (qs || [])
    setQuestions(orderedQs)

    if (session.current_question_id) {
      const idx = orderedQs?.findIndex(q => q.id === session.current_question_id) ?? 0
      setCurrentQIndex(idx >= 0 ? idx : 0)
    }
  }

  const startQuiz = async () => {
    if (!selectedSession || questions.length === 0) return
    setLoading(true)
    setMessage(null)
    const firstQuestion = questions[0]
    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'active',
        current_question_id: firstQuestion.id,
        question_started_at: new Date().toISOString()
      })
      .eq('id', selectedSession.id)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to start quiz' })
    } else {
      setSessionStatus('active')
      setCurrentQIndex(0)
      setMessage({ type: 'success', text: 'Quiz started! Question 1 is live.' })
    }
    setLoading(false)
  }

  const nextQuestion = async () => {
    if (!selectedSession || currentQIndex >= questions.length - 1) return
    setLoading(true)
    setMessage(null)
    const nextIdx = currentQIndex + 1
    const nextQ = questions[nextIdx]
    const { error } = await supabase
      .from('sessions')
      .update({
        current_question_id: nextQ.id,
        question_started_at: new Date().toISOString(),
        show_results: false
      })
      .eq('id', selectedSession.id)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to advance question.' })
    } else {
      setCurrentQIndex(nextIdx)
      setMessage({ type: 'success', text: 'Question ' + (nextIdx + 1) + ' is now live.' })
    }
    setLoading(false)
  }

  const endQuiz = async () => {
    if (!selectedSession) return
    if (!window.confirm('End the quiz now?')) return
    setLoading(true)
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'finished' })
      .eq('id', selectedSession.id)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to end quiz.' })
    } else {
      setSessionStatus('finished')
      setMessage({ type: 'success', text: 'Quiz ended! Winner screen is now showing.' })
    }
    setLoading(false)
  }

  const deleteSession = async (sessionId) => {
    if (!window.confirm('Delete this session?')) return
    await supabase.from('answers').delete().eq('session_id', sessionId)
    await supabase.from('participants').delete().eq('session_id', sessionId)
    await supabase.from('sessions').delete().eq('id', sessionId)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null)
      setSessionStatus(null)
    }
    setMessage({ type: 'success', text: 'Session deleted.' })
  }

  const openLeaderboard = () => {
    if (selectedSession) {
      window.open('/leaderboard/' + selectedSession.id, '_blank')
    }
  }

  const currentQ = questions[currentQIndex]
  const isLastQuestion = currentQIndex === questions.length - 1

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Moderator Panel</div>
        <div style={styles.headerSub}>KubeCon Quiz Control Center</div>
      </div>
      <div style={styles.body}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Create New Session</div>
          <select
            style={styles.select}
            value={selectedQuizId}
            onChange={e => setSelectedQuizId(e.target.value)}
          >
            <option value="">Select a quiz...</option>
            {quizzes.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
          <button
            onClick={createSession}
            disabled={creating || !selectedQuizId}
            style={styles.createBtn}
          >
            {creating ? 'Creating...' : 'Create Session'}
          </button>

          <div style={{ ...styles.panelTitle, marginTop: 24 }}>Active Sessions</div>
          {sessions.length === 0 ? (
            <div style={styles.empty}>No active sessions.</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                style={{
                  ...styles.sessionRow,
                  ...(selectedSession?.id === s.id ? styles.sessionRowActive : {})
                }}
              >
                <div onClick={() => selectSession(s)} style={{ flex: 1, cursor: 'pointer' }}>
                  <div style={styles.sessionRowTitle}>{s.quizzes?.name || 'Unknown Quiz'}</div>
                  <div style={styles.sessionRowSub}>{s.id.slice(0, 8)}... · {s.status}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    ...styles.statusDot,
                    background: s.status === 'active'
                      ? 'var(--green)'
                      : s.status === 'waiting'
                      ? 'var(--yellow)'
                      : 'var(--text2)'
                  }} />
                  <button
                    onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--red)',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '2px 4px',
                    }}
                  >✕</button>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedSession && (
          <div style={styles.controlPanel}>
            <div style={styles.panelTitle}>
              {selectedSession.quizzes?.name} · {participants.length} participants · {sessionStatus}
            </div>

            {message && (
              <div style={{
                ...styles.message,
                background: message.type === 'error' ? 'rgba(255,23,68,0.1)' : 'rgba(0,230,118,0.1)',
                border: message.type === 'error' ? '1px solid var(--red)' : '1px solid var(--green)',
                color: message.type === 'error' ? 'var(--red)' : 'var(--green)',
              }}>
                {message.text}
              </div>
            )}

            {currentQ && sessionStatus === 'active' && (
              <div style={styles.questionPreview}>
                <div style={styles.qPreviewLabel}>
                  LIVE: Question {currentQIndex + 1} / {questions.length}
                </div>
                <div style={styles.qPreviewText}>{currentQ.question}</div>
                <div style={styles.qPreviewMeta}>
                  Time: {currentQ.time_limit}s · Answer: {currentQ.correct_answer}
                </div>
              </div>
            )}

            <div style={styles.actions}>
              {sessionStatus === 'waiting' && (
                <button
                  onClick={startQuiz}
                  disabled={loading || participants.length === 0}
                  style={{ ...styles.btn, ...styles.btnGreen }}
                >
                  {loading ? 'Starting...' : 'Start Quiz (' + participants.length + ' participants)'}
                </button>
              )}

              {sessionStatus === 'active' && !isLastQuestion && (
                <button
                  onClick={nextQuestion}
                  disabled={loading}
                  style={{ ...styles.btn, ...styles.btnBlue }}
                >
                  {loading ? 'Loading...' : 'Next Question (' + (currentQIndex + 2) + '/' + questions.length + ')'}
                </button>
              )}

              {sessionStatus === 'active' && (
                <button
                  onClick={endQuiz}
                  disabled={loading}
                  style={{ ...styles.btn, ...styles.btnRed }}
                >
                  {loading ? 'Ending...' : 'End Quiz and Show Winners'}
                </button>
              )}

              {sessionStatus === 'active' && (
                <button
                  onClick={openLeaderboard}
                  style={{ ...styles.btn, ...styles.btnOutline }}
                >
                  Open TV Leaderboard View
                </button>
              )}
            </div>

            <div style={styles.partList}>
              <div style={styles.partListTitle}>Participants ({participants.length})</div>
              <div style={styles.partListScroll}>
                {participants.map((p, i) => (
                  <div key={p.id} style={styles.partRow}>
                    <span style={styles.partNum}>{i + 1}</span>
                    <span style={styles.partName}>{p.full_name}</span>
                    <span style={styles.partScore}>{p.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  header: {
    padding: '20px 32px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--white)',
  },
  headerSub: {
    fontSize: 13,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
  },
  body: {
    display: 'flex',
    minHeight: 'calc(100vh - 80px)',
  },
  panel: {
    width: 280,
    borderRight: '1px solid var(--border)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  panelTitle: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  select: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg2)',
    color: 'var(--white)',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  },
  createBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
  },
  sessionRow: {
    padding: '12px 16px',
    background: 'var(--panel)',
    borderRadius: 8,
    border: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionRowActive: {
    border: '1px solid var(--accent)',
    background: 'rgba(50,108,229,0.1)',
  },
  sessionRowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--white)',
  },
  sessionRowSub: {
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  controlPanel: {
    flex: 1,
    padding: 32,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  message: {
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
  },
  questionPreview: {
    padding: '20px 24px',
    background: 'var(--panel)',
    border: '1px solid var(--accent)',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  qPreviewLabel: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent2)',
    letterSpacing: 2,
  },
  qPreviewText: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--white)',
    lineHeight: 1.5,
  },
  qPreviewMeta: {
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxWidth: 480,
  },
  btn: {
    padding: '14px 24px',
    borderRadius: 10,
    border: 'none',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
  },
  btnGreen: {
    background: 'var(--green)',
    color: '#000',
  },
  btnBlue: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
  },
  btnRed: {
    background: 'var(--red)',
    color: 'var(--white)',
  },
  btnOutline: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  partList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  partListTitle: {
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  partListScroll: {
    overflowY: 'auto',
    maxHeight: 300,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  partRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--panel)',
    borderRadius: 6,
    border: '1px solid var(--border)',
  },
  partNum: {
    width: 24,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textAlign: 'center',
  },
  partName: {
    flex: 1,
    fontSize: 14,
    color: 'var(--text)',
  },
  partScore: {
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent2)',
  },
  empty: {
    color: 'var(--text2)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  },
}
