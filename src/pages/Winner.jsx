import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Winner() {
  const { sessionId } = useParams()
  const [winners, setWinners] = useState([])
  const [session, setSession] = useState(null)
  const [confetti, setConfetti] = useState([])
  const [myRank, setMyRank] = useState(null)
  const [myName, setMyName] = useState(null)

  useEffect(() => {
    // Clear saved session on quiz end
    const saved = localStorage.getItem('kubecon_session')
    let participantId = null
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.sessionId === sessionId) {
          participantId = parsed.participantId
        }
      } catch (e) {}
    }

    supabase
      .from('sessions')
      .select('*, quizzes(name)')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => setSession(data))

    supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        setWinners(data || [])
        if (participantId && data) {
          const rank = data.findIndex(p => p.id === participantId) + 1
          if (rank > 0) {
            setMyRank(rank)
            setMyName(data[rank - 1]?.full_name)
          }
        }
      })

    const pieces = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 3 + Math.random() * 3,
      color: ['#326ce5', '#00d4ff', '#ffd600', '#00e676', '#ff1744', '#ffffff'][Math.floor(Math.random() * 6)],
      size: 6 + Math.random() * 8,
    }))
    setConfetti(pieces)

    // Clear saved session
    localStorage.removeItem('kubecon_session')
  }, [sessionId])

  const POSITIONS = [
    { rank: 2, label: '2nd Place', medal: '🥈', scale: 0.85, order: 0 },
    { rank: 1, label: '1st Place', medal: '🥇', scale: 1, order: 1 },
    { rank: 3, label: '3rd Place', medal: '🥉', scale: 0.75, order: 2 },
  ]

  const isWinner = myRank && myRank <= 3
  const winnerMessages = {
    1: { emoji: '🏆', text: "You're #1!", sub: 'Outstanding performance!' },
    2: { emoji: '🥈', text: '2nd Place!', sub: 'Brilliant effort!' },
    3: { emoji: '🥉', text: '3rd Place!', sub: 'Well done!' },
  }

  return (
    <div style={styles.container}>
      {confetti.map(c => (
        <div
          key={c.id}
          style={{
            position: 'absolute',
            left: `${c.left}%`,
            top: -20,
            width: c.size,
            height: c.size,
            background: c.color,
            borderRadius: Math.random() > 0.5 ? '50%' : 2,
            animation: `confetti-fall ${c.duration}s ${c.delay}s ease-in infinite`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      ))}

      <div style={styles.content}>
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
            <div style={styles.logoDivider} />
            <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarat 2026" style={styles.kcLogo} />
          </div>
          <div style={styles.title}>Quiz Complete!</div>
          {session && (
            <div style={styles.dayBadge}>
              {session.quizzes?.name || 'Champions'}
            </div>
          )}
        </div>

        {/* Personal winner banner */}
        {isWinner && (
          <div style={{
            background: myRank === 1
              ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,140,0,0.2))'
              : myRank === 2
              ? 'linear-gradient(135deg, rgba(192,192,192,0.2), rgba(136,136,136,0.2))'
              : 'linear-gradient(135deg, rgba(205,127,50,0.2), rgba(139,69,19,0.2))',
            border: myRank === 1
              ? '2px solid #ffd700'
              : myRank === 2
              ? '2px solid #c0c0c0'
              : '2px solid #cd7f32',
            borderRadius: 16,
            padding: '20px 32px',
            textAlign: 'center',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}>
            <div style={{ fontSize: 48 }}>{winnerMessages[myRank].emoji}</div>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              color: 'var(--white)',
              marginTop: 8,
            }}>
              {myName}, {winnerMessages[myRank].text}
            </div>
            <div style={{
              fontSize: 16,
              color: 'var(--text2)',
              marginTop: 4,
            }}>
              {winnerMessages[myRank].sub}
            </div>
          </div>
        )}

        <div style={styles.podium}>
          {POSITIONS.map(pos => {
            const winner = winners[pos.rank - 1]
            if (!winner) return null
            return (
              <div
                key={pos.rank}
                style={{
                  ...styles.podiumSpot,
                  transform: `scale(${pos.scale})`,
                  order: pos.order,
                  zIndex: pos.rank === 1 ? 2 : 1,
                }}
                className="pop-in"
              >
                <div style={styles.medal}>{pos.medal === '🥇' ? '🥇' : pos.medal === '🥈' ? '🥈' : '🥉'}</div>
                <div style={styles.winnerName}>{winner.full_name}</div>
                <div style={styles.winnerScore}>
                  {winner.score.toLocaleString()} pts
                </div>
                <div style={{
                  ...styles.podiumBar,
                  height: pos.rank === 1 ? 120 : pos.rank === 2 ? 90 : 70,
                  background: pos.rank === 1
                    ? 'linear-gradient(180deg, #ffd700, #ff8c00)'
                    : pos.rank === 2
                    ? 'linear-gradient(180deg, #c0c0c0, #888)'
                    : 'linear-gradient(180deg, #cd7f32, #8b4513)',
                }}>
                  <span style={styles.podiumRank}>{pos.rank}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={styles.footer}>
          <div style={styles.footerText}>🎉 Congratulations to all participants!</div>
          <div style={styles.footerSub}>
            Thank you for joining the KubeCon Quiz — Linux Foundation
          </div>
          <a href="/" style={styles.restartBtn}>↩ Back to Lobby</a>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at center, #0f1629 0%, #0a0e1a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 40,
    padding: '40px 20px',
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 800,
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 4,
  },
  lfLogo: {
    height: 40,
    objectFit: 'contain',
  },
  logoDivider: {
    width: 1,
    height: 36,
    background: 'var(--border)',
  },
  kcLogo: {
    height: 40,
    objectFit: 'contain',
  },
  title: {
    fontSize: 48,
    fontWeight: 900,
    color: 'var(--white)',
    letterSpacing: 1,
    lineHeight: 1.1,
  },
  dayBadge: {
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
    padding: '8px 24px',
    borderRadius: 40,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
  },
  podium: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 0,
    width: '100%',
  },
  podiumSpot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    width: 220,
  },
  medal: {
    fontSize: 48,
    lineHeight: 1,
  },
  winnerName: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--white)',
    textAlign: 'center',
    maxWidth: 200,
    wordBreak: 'break-word',
  },
  winnerScore: {
    fontSize: 20,
    fontWeight: 900,
    color: 'var(--accent2)',
    fontFamily: 'var(--font-mono)',
  },
  podiumBar: {
    width: '100%',
    borderRadius: '8px 8px 0 0',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  podiumRank: {
    fontSize: 28,
    fontWeight: 900,
    color: 'rgba(0,0,0,0.5)',
  },
  footer: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--white)',
  },
  footerSub: {
    fontSize: 14,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
  },
  restartBtn: {
    padding: '12px 32px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    marginTop: 8,
    display: 'inline-block',
  },
}
