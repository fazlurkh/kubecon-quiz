import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Join() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkResume = async () => {
      // Check if participant already joined this session
      try {
        const saved = localStorage.getItem('kubecon_session')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.sessionId === sessionId && parsed.participantId) {
            // Verify participant still exists
            const { data: participant } = await supabase
              .from('participants')
              .select('id')
              .eq('id', parsed.participantId)
              .single()

            if (participant) {
              // Verify session status
              const { data: sess } = await supabase
                .from('sessions')
                .select('status')
                .eq('id', sessionId)
                .single()

              if (sess?.status === 'active') {
                navigate(`/question/${sessionId}/${parsed.participantId}`)
                return
              } else if (sess?.status === 'waiting') {
                navigate(`/wait/${sessionId}/${parsed.participantId}`)
                return
              } else if (sess?.status === 'finished') {
                navigate(`/winner/${sessionId}`)
                return
              }
            }
          }
        }
      } catch (e) {}

      // No resume — load session normally
      supabase
        .from('sessions')
        .select('*, quizzes(name)')
        .eq('id', sessionId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            setError('Session not found. Please scan the QR code again.')
          } else if (data.status === 'finished') {
            setError('This quiz session has ended.')
          } else {
            setSession(data)
          }
          setChecking(false)
        })
    }

    checkResume()
  }, [sessionId])

  const handleJoin = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    try {
      const { count } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)

      if (count >= 250) {
        setError('Session is full (250 participants max). Please see the moderator.')
        setLoading(false)
        return
      }

      const { data: existing } = await supabase
        .from('participants')
        .select('id')
        .eq('session_id', sessionId)
        .ilike('full_name', trimmed)
        .single()

      if (existing) {
        setError('This name is already taken in this session. Please use your full name.')
        setLoading(false)
        return
      }

      const { data, error: insertError } = await supabase
        .from('participants')
        .insert({ session_id: sessionId, full_name: trimmed })
        .select()
        .single()

      if (insertError) throw insertError

      // Save to localStorage for resume
      localStorage.setItem('kubecon_session', JSON.stringify({
        sessionId,
        participantId: data.id,
      }))

      if (session?.status === 'active') {
        navigate(`/question/${sessionId}/${data.id}`)
      } else {
        navigate(`/wait/${sessionId}/${data.id}`)
      }
    } catch (e) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <div style={styles.loadingText}>Connecting...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.bg} />
      <div style={styles.card} className="fade-in-up">
        <div style={styles.logoRow}>
          <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
          <div style={styles.logoDivider} />
          <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
        </div>
        <div style={styles.title}>Join the Quiz</div>
        {session && (
          <div style={styles.dayBadge}>
            {session.quizzes?.name || 'Quiz'}
          </div>
        )}
        {error ? (
          <div style={styles.errorBox}>{error}</div>
        ) : (
          <form onSubmit={handleJoin} style={styles.form}>
            <div style={styles.fieldLabel}>Your Full Name</div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              style={styles.input}
              maxLength={50}
              autoFocus
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                ...styles.btn,
                opacity: (!name.trim() || loading) ? 0.5 : 1
              }}
            >
              {loading ? 'Joining...' : 'Join Quiz →'}
            </button>
          </form>
        )}
        <div style={styles.hint}>💡 Switch to mobile data for best experience</div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'var(--bg)',
    position: 'relative',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      radial-gradient(ellipse at 30% 20%, rgba(50,108,229,0.15) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 80%, rgba(0,212,255,0.1) 0%, transparent 60%)
    `,
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 24,
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    position: 'relative',
    zIndex: 1,
    boxShadow: '0 0 80px rgba(50,108,229,0.15)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
  },
  lfLogo: {
    height: 48,
    objectFit: 'contain',
  },
  logoDivider: {
    width: 1,
    height: 32,
    background: 'var(--border)',
  },
  kcLogo: {
    height: 48,
    objectFit: 'contain',
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    color: 'var(--white)',
    letterSpacing: 0.5,
  },
  dayBadge: {
    background: 'rgba(50,108,229,0.15)',
    border: '1px solid var(--accent)',
    color: 'var(--accent2)',
    padding: '6px 16px',
    borderRadius: 40,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--white)',
    fontSize: 18,
    fontWeight: 600,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  btn: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    border: 'none',
    borderRadius: 10,
    color: 'var(--white)',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
  errorBox: {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(255,23,68,0.1)',
    border: '1px solid var(--red)',
    borderRadius: 10,
    color: 'var(--red)',
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
  },
  hint: {
    fontSize: 12,
    color: 'var(--text2)',
    textAlign: 'center',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    background: 'var(--bg)',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid var(--border)',
    borderTop: '3px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
  },
}
