import React, { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

const BASE_URL = 'https://kubecon-quiz.vercel.app'

export default function Lobby() {
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadActiveSession()

    // Poll every 5 seconds for a new session if none found
    const pollInterval = setInterval(loadActiveSession, 5000)
    return () => clearInterval(pollInterval)
  }, [])

  const loadActiveSession = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*, quizzes(name)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setSession(data)
      setLoading(false)
    } else {
      setSession(null)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session) return

    supabase
      .from('participants')
      .select('*')
      .eq('session_id', session.id)
      .order('joined_at')
      .then(({ data }) => setParticipants(data || []))

    const channel = supabase
      .channel(`lobby-${session.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'participants',
        filter: `session_id=eq.${session.id}`
      }, (payload) => {
        setParticipants(prev => {
          if (prev.find(p => p.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()

    const sessionChannel = supabase
      .channel(`session-status-${session.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${session.id}`
      }, (payload) => {
        if (payload.new.status === 'active') {
          navigate(`/leaderboard/${session.id}`)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(sessionChannel)
    }
  }, [session])

  const joinUrl = session ? `${BASE_URL}/join/${session.id}` : ''

  if (loading) {
    return (
      <div style={styles.waiting}>
        <div style={styles.grid} />
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
          </div>
          <div style={styles.headerCenter}>
            <div style={styles.badge}>LIVE QUIZ</div>
          </div>
          <div style={styles.headerRight}>
            <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
          </div>
        </header>
        <div style={styles.waitingContent}>
          <div style={styles.spinner} />
          <div style={styles.waitingText}>Waiting for moderator to create a session...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={styles.waiting}>
        <div style={styles.grid} />
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
          </div>
          <div style={styles.headerCenter}>
            <div style={styles.badge}>LIVE QUIZ</div>
          </div>
          <div style={styles.headerRight}>
            <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
          </div>
        </header>
        <div style={styles.waitingContent}>
          <div style={styles.waitingText}>No active session. Moderator please create a session.</div>
        </div>
        <div style={styles.ticker}>
          <div style={styles.tickerInner}>
            ☸ KCD Gujarat 2026 &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
            Linux Foundation &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
            Cloud Native Computing Foundation &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
            Kubernetes · Prometheus · Envoy · Argo · Cilium · Istio &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.grid} />
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
        </div>
        <div style={styles.headerCenter}>
          <div style={styles.badge}>LIVE QUIZ</div>
        </div>
        <div style={styles.headerRight}>
          <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
        </div>
      </header>

      <div style={styles.lobbyLayout}>
        <div style={styles.qrPanel}>
          <div style={styles.qrTitle}>Scan to Join</div>
          <div style={styles.qrWrapper}>
            <QRCodeSVG
              value={joinUrl}
              size={280}
              bgColor="#ffffff"
              fgColor="#0a0e1a"
              level="M"
            />
          </div>
          <div style={styles.qrUrl}>{joinUrl}</div>
          <div style={styles.qrHint}>📱 Use mobile data for best experience</div>
          <div style={styles.sessionBadge}>
            {session.quizzes?.name} · Session Active
          </div>
        </div>

        <div style={styles.participantPanel}>
          <div style={styles.participantHeader}>
            <span style={styles.participantTitle}>Participants</span>
            <span style={styles.participantCount}>{participants.length} / 250</span>
          </div>
          <div style={styles.participantList}>
            {participants.length === 0 ? (
              <div style={styles.waitingText}>Waiting for participants to join...</div>
            ) : (
              participants.map((p, i) => (
                <div key={p.id} style={styles.participantRow}>
                  <span style={styles.participantNum}>{i + 1}</span>
                  <span style={styles.participantName}>{p.full_name}</span>
                  <span style={styles.joinedDot}>●</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.ticker}>
        <div style={styles.tickerInner}>
          ☸ KCD Gujarat 2026 &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          Linux Foundation &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          Cloud Native Computing Foundation &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          Kubernetes · Prometheus · Envoy · Argo · Cilium · Istio &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          ☸ KCD Gujarat 2026 &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          Linux Foundation &nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;
          Cloud Native Computing Foundation &nbsp;&nbsp;&nbsp; ✦
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  waiting: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  waitingContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  waitingText: {
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 16,
    textAlign: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid var(--border)',
    borderTop: '3px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(50,108,229,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(50,108,229,0.05) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px 40px',
    borderBottom: '2px solid var(--border)',
    background: 'rgba(15,22,41,0.98)',
    backdropFilter: 'blur(10px)',
    position: 'relative',
    zIndex: 1,
    minHeight: 110,
  },
  headerLeft: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  lfLogo: {
    height: 72,
    objectFit: 'contain',
    maxWidth: 220,
  },
  kcLogo: {
    height: 90,
    objectFit: 'contain',
    maxWidth: 260,
  },
  badge: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
    padding: '16px 40px',
    borderRadius: 40,
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: 4,
    fontFamily: 'var(--font-mono)',
    animation: 'pulse-glow 2s ease-in-out infinite',
    whiteSpace: 'nowrap',
  },
  lobbyLayout: {
    flex: 1,
    display: 'flex',
    gap: 0,
    position: 'relative',
    zIndex: 1,
  },
  qrPanel: {
    width: 420,
    borderRight: '1px solid var(--border)',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    background: 'rgba(15,22,41,0.7)',
  },
  qrTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: 'var(--white)',
    letterSpacing: 1,
  },
  qrWrapper: {
    padding: 20,
    background: 'white',
    borderRadius: 16,
    boxShadow: '0 0 60px rgba(50,108,229,0.4)',
  },
  qrUrl: {
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    wordBreak: 'break-all',
    textAlign: 'center',
  },
  qrHint: {
    fontSize: 14,
    color: 'var(--accent2)',
    fontWeight: 600,
    textAlign: 'center',
  },
  sessionBadge: {
    background: 'rgba(0,214,255,0.1)',
    border: '1px solid var(--accent2)',
    color: 'var(--accent2)',
    padding: '8px 20px',
    borderRadius: 40,
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  },
  participantPanel: {
    flex: 1,
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  participantHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--white)',
  },
  participantCount: {
    fontSize: 18,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent2)',
    fontWeight: 700,
  },
  participantList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  participantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    background: 'var(--panel)',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  participantNum: {
    width: 28,
    height: 28,
    background: 'var(--border)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    flexShrink: 0,
    textAlign: 'center',
    lineHeight: '28px',
  },
  participantName: {
    flex: 1,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
  },
  joinedDot: {
    color: 'var(--green)',
    fontSize: 10,
  },
  ticker: {
    height: 36,
    background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  tickerInner: {
    whiteSpace: 'nowrap',
    animation: 'ticker 40s linear infinite',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--white)',
    letterSpacing: 1,
    fontFamily: 'var(--font-mono)',
  },
}
