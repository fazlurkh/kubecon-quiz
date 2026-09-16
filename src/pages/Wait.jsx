import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Wait() {
  const { sessionId, participantId } = useParams()
  const navigate = useNavigate()
  const [participant, setParticipant] = useState(null)
  const [totalJoined, setTotalJoined] = useState(0)
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '.' : d + '.')
    }, 600)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    supabase
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .single()
      .then(({ data }) => setParticipant(data))
  }, [participantId])

  useEffect(() => {
    supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .then(({ count }) => setTotalJoined(count || 0))

    const channel = supabase
      .channel(`wait-count-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'participants',
        filter: `session_id=eq.${sessionId}`
      }, () => setTotalJoined(c => c + 1))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [sessionId])

  useEffect(() => {
    const channel = supabase
      .channel(`wait-session-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, (payload) => {
        if (payload.new.status === 'active') {
          navigate(`/question/${sessionId}/${participantId}`)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [sessionId, participantId])

  return (
    <div style={styles.container}>
      <div style={styles.bg} />
      <div style={styles.card} className="fade-in-up">
        <div style={styles.logoRow}>
          <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
          <div style={styles.logoDivider} />
          <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
        </div>

        {participant && (
          <div style={styles.nameBox}>
            <div style={styles.nameLabel}>You're in!</div>
            <div style={styles.name}>{participant.full_name}</div>
          </div>
        )}

        <div style={styles.waitBox}>
          <div style={styles.waitTitle}>Waiting for quiz to start{dots}</div>
          <div style={styles.waitSub}>The moderator will start the quiz shortly</div>
        </div>

        <div style={styles.countBox}>
          <span style={styles.countNum}>{totalJoined}</span>
          <span style={styles.countLabel}>participants ready</span>
        </div>

        <div style={styles.tips}>
          <div style={styles.tipTitle}>💡 Quick Tips</div>
          <div style={styles.tipItem}>⚡ Answer fast — speed matters for scoring</div>
          <div style={styles.tipItem}>✅ Correct answer + fastest time = most points</div>
         <div style={styles.tipItem}>🎁 Special prizes for winners — stay tuned!</div>
          <div style={styles.tipItem}>📱 Keep this screen open and don't refresh</div>
        </div>
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
      radial-gradient(ellipse at 50% 30%, rgba(50,108,229,0.12) 0%, transparent 60%)
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
    gap: 20,
    position: 'relative',
    zIndex: 1,
    boxShadow: '0 0 80px rgba(50,108,229,0.15)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  lfLogo: {
    height: 48,
    objectFit: 'contain',
  },
  logoDivider: {
    width: 1,
    height: 28,
    background: 'var(--border)',
  },
  kcLogo: {
    height: 48,
    objectFit: 'contain',
  },
  nameBox: {
    textAlign: 'center',
    padding: '16px 24px',
    background: 'rgba(0,230,118,0.08)',
    border: '1px solid rgba(0,230,118,0.3)',
    borderRadius: 12,
    width: '100%',
  },
  nameLabel: {
    fontSize: 12,
    color: 'var(--green)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--white)',
  },
  waitBox: {
    textAlign: 'center',
  },
  waitTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--accent2)',
    fontFamily: 'var(--font-mono)',
  },
  waitSub: {
    fontSize: 13,
    color: 'var(--text2)',
    marginTop: 4,
  },
  countBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  countNum: {
    fontSize: 48,
    fontWeight: 900,
    color: 'var(--accent2)',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1,
  },
  countLabel: {
    fontSize: 14,
    color: 'var(--text2)',
  },
  tips: {
    width: '100%',
    background: 'var(--bg2)',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 4,
  },
  tipItem: {
    fontSize: 13,
    color: 'var(--text2)',
    lineHeight: 1.5,
  },
}
