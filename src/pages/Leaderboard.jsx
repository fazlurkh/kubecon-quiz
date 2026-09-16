import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../supabaseClient'
const BASE_URL = 'https://kubecon-quiz.vercel.app'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }
const RANK_COLORS = {
  1: 'linear-gradient(135deg, #ffd700, #ffaa00)',
  2: 'linear-gradient(135deg, #c0c0c0, #a0a0a0)',
  3: 'linear-gradient(135deg, #cd7f32, #a0522d)',
}

export default function Leaderboard() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [leaderboard, setLeaderboard] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionNum, setQuestionNum] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [lastAnswerCount, setLastAnswerCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(null)
  const [questionStartedAt, setQuestionStartedAt] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [answerStats, setAnswerStats] = useState({})
  const [allQuestions, setAllQuestions] = useState([])
  const timerRef = React.useRef(null)

  const startTimer = (question, startedAt) => {
    clearInterval(timerRef.current)
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    const remaining = Math.max(0, question.time_limit - elapsed)
    setTimeLeft(remaining)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          supabase
            .from('sessions')
            .update({ show_results: true })
            .eq('id', sessionId)
            .then(() => {})
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .limit(10)
    setLeaderboard(data || [])
  }

  const loadAnswerStats = async (questionId) => {
    const { data } = await supabase
      .from('answers')
      .select('answer')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
    const stats = { A: 0, B: 0, C: 0, D: 0 }
    data?.forEach(a => {
      if (stats[a.answer] !== undefined) stats[a.answer]++
    })
    setAnswerStats(stats)
  }

  useEffect(() => {
    const loadSession = async () => {
      const { data: sess } = await supabase
        .from('sessions')
        .select('*, questions(*)')
        .eq('id', sessionId)
        .single()

      if (sess) {
        if (sess.status === 'finished') {
          navigate('/winner/' + sessionId)
          return
        }

        const { data: allQ } = await supabase
          .from('questions')
          .select('id')
          .eq('quiz_id', sess.quiz_id)
          .order('order_index')
        setTotalQuestions(allQ?.length || 0)
        setAllQuestions(allQ || [])

        if (sess.questions) {
          setCurrentQuestion(sess.questions)
          setQuestionStartedAt(sess.question_started_at)
          setShowResults(sess.show_results || false)
          const idx = allQ?.findIndex(q => q.id === sess.questions.id) ?? 0
          setQuestionNum(idx + 1)
          if (sess.show_results) {
            loadAnswerStats(sess.questions.id)
          } else {
            startTimer(sess.questions, sess.question_started_at)
          }
        }
      }
    }

    loadSession()
    loadLeaderboard()

    const sessionChannel = supabase
      .channel('lb-session-' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: 'id=eq.' + sessionId
      }, async (payload) => {
        if (payload.new.status === 'finished') {
          navigate('/winner/' + sessionId)
          return
        }
        if (payload.new.show_results === true) {
          setShowResults(true)
          clearInterval(timerRef.current)
          if (payload.new.current_question_id) {
            loadAnswerStats(payload.new.current_question_id)
          }
        }
        if (payload.new.show_results === false && payload.new.current_question_id) {
          setShowResults(false)
          const { data: q } = await supabase
            .from('questions')
            .select('*')
            .eq('id', payload.new.current_question_id)
            .single()
          if (q) {
            setCurrentQuestion(q)
            setQuestionStartedAt(payload.new.question_started_at)
            startTimer(q, payload.new.question_started_at)
            setAllQuestions(prev => {
              const idx = prev.findIndex(aq => aq.id === q.id)
              setQuestionNum(idx + 1)
              return prev
            })
          }
          loadLeaderboard()
        }
      })
      .subscribe()

    const answersChannel = supabase
      .channel('lb-answers-' + sessionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'answers',
        filter: 'session_id=eq.' + sessionId
      }, async (payload) => {
        setLastAnswerCount(c => c + 1)
        loadLeaderboard()
        const { data: sess } = await supabase
          .from('sessions')
          .select('current_question_id')
          .eq('id', sessionId)
          .single()
        const { count: participantCount } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
        const { count: answerCount } = await supabase
          .from('answers')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .eq('question_id', sess?.current_question_id)
        if (participantCount > 0 && answerCount >= participantCount) {
          await supabase
            .from('sessions')
            .update({ show_results: true })
            .eq('id', sessionId)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sessionChannel)
      supabase.removeChannel(answersChannel)
      clearInterval(timerRef.current)
    }
  }, [sessionId])

  return (
    <div style={styles.container}>
      <div style={styles.bg} />
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/lf-stacked-color.png" alt="Linux Foundation" style={styles.lfLogo} />
        </div>
        <div style={styles.headerCenter}>
          <div style={styles.questionBadge}>
            Question {questionNum} / {totalQuestions}
          </div>
        </div>
        <div style={styles.headerRight}>
          <img src="/KCDGujaratLogoSmall500x500.png" alt="KCD Gujarart 2026" style={styles.kcLogo} />
        </div>
      </header>

      <div style={styles.body}>
        {currentQuestion && (
          <div style={styles.questionPanel}>
            <div style={styles.questionLabel}>
              {showResults ? 'RESULTS' : 'CURRENT QUESTION'}
            </div>

            <div style={{
              ...styles.questionText,
              opacity: showResults ? 0.6 : 1,
              transition: 'opacity 0.5s',
            }}>
              {currentQuestion.question}
            </div>

            {!showResults && (
              <>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 4,
                    transition: 'width 1s linear, background 1s',
                    width: `${timeLeft !== null ? (timeLeft / currentQuestion.time_limit) * 100 : 100}%`,
                    background: timeLeft > currentQuestion.time_limit * 0.5
                      ? 'var(--green)'
                      : timeLeft > currentQuestion.time_limit * 0.25
                      ? 'var(--yellow)'
                      : 'var(--red)',
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    fontSize: 32,
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono)',
                    color: timeLeft > currentQuestion.time_limit * 0.5
                      ? 'var(--green)'
                      : timeLeft > currentQuestion.time_limit * 0.25
                      ? 'var(--yellow)'
                      : 'var(--red)',
                    minWidth: 60,
                  }}>
                    {timeLeft !== null ? timeLeft : currentQuestion.time_limit}s
                  </div>
                  <div style={styles.questionMeta}>remaining</div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {['A', 'B', 'C', 'D'].map(opt => {
                const optText = currentQuestion[`option_${opt.toLowerCase()}`]
                const isCorrect = opt === currentQuestion.correct_answer
                const count = answerStats[opt] || 0
                const total = Object.values(answerStats).reduce((a, b) => a + b, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0

                return (
                  <div key={opt} style={{
                    borderRadius: 10,
                    border: showResults && isCorrect
                      ? '1px solid var(--green)'
                      : '1px solid var(--border)',
                    background: showResults && isCorrect
                      ? 'rgba(0,230,118,0.1)'
                      : 'var(--bg2)',
                    overflow: 'hidden',
                    opacity: showResults && !isCorrect ? 0.6 : 1,
                    transition: 'all 0.5s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: showResults && isCorrect ? 'var(--green)' : 'var(--border)',
                        color: showResults && isCorrect ? '#000' : 'var(--text2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, flexShrink: 0,
                        fontFamily: 'var(--font-mono)',
                      }}>{opt}</span>
                      <span style={{
                        flex: 1, fontSize: 14,
                        color: showResults && isCorrect ? 'var(--green)' : 'var(--text)',
                        fontWeight: showResults && isCorrect ? 700 : 400,
                      }}>{optText}</span>
                      {showResults && (
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: isCorrect ? 'var(--green)' : 'var(--text2)',
                          fontFamily: 'var(--font-mono)',
                          minWidth: 60, textAlign: 'right',
                        }}>{count} ({pct}%)</span>
                      )}
                    </div>
                    {showResults && (
                      <div style={{ height: 6, background: 'var(--border)' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: isCorrect ? 'var(--green)' : 'var(--text2)',
                          transition: 'width 1s ease',
                        }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={styles.leaderboardPanel}>
          <div style={styles.lbTitle}>🏆 Top 10</div>
          <div style={styles.lbList}>
            {leaderboard.length === 0 ? (
              <div style={styles.empty}>Waiting for answers...</div>
            ) : (
              leaderboard.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    ...styles.lbRow,
                    ...(i === 0 ? styles.lbRow1 : i === 1 ? styles.lbRow2 : i === 2 ? styles.lbRow3 : {}),
                  }}
                  className="fade-in-up"
                >
                  <div style={{
                    ...styles.rank,
                    background: i < 3 ? RANK_COLORS[i + 1] : 'var(--border)',
                    color: i < 3 ? '#000' : 'var(--text2)',
                  }}>
                    {i < 3 ? MEDAL[i + 1] : i + 1}
                  </div>
                  <div style={styles.lbName}>{p.full_name}</div>
                  <div style={styles.lbScore}>{p.score.toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div style={{
  position: 'fixed',
  bottom: 48,
  right: 16,
  background: 'white',
  padding: 8,
  borderRadius: 8,
  boxShadow: '0 0 20px rgba(50,108,229,0.3)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}}>
  <QRCodeSVG
    value={`${BASE_URL}/join/${sessionId}`}
    size={80}
    bgColor="#ffffff"
    fgColor="#0a0e1a"
    level="M"
  />
  <div style={{
    fontSize: 9,
    color: '#333',
    fontFamily: 'monospace',
    fontWeight: 700,
  }}>SCAN TO JOIN</div>
</div>
      <div style={styles.ticker}>
        <div style={styles.tickerInner}>
          KCD Gujarat 2026 &nbsp;✦&nbsp;
          {lastAnswerCount} answers submitted &nbsp;✦&nbsp;
          Kubernetes · Prometheus · Envoy · Argo · Cilium · Istio &nbsp;✦&nbsp;
          KCD Gujarat 2026 &nbsp;✦&nbsp;
          Linux Foundation &nbsp;✦&nbsp;
          Cloud Native Computing Foundation &nbsp;✦&nbsp;
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
  bg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(50,108,229,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(50,108,229,0.04) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px 40px',
    borderBottom: '2px solid var(--border)',
    background: 'rgba(15,22,41,0.98)',
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
  questionBadge: {
    background: 'rgba(50,108,229,0.15)',
    border: '1px solid var(--accent)',
    color: 'var(--accent2)',
    padding: '12px 28px',
    borderRadius: 40,
    fontSize: 18,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  body: {
    flex: 1,
    display: 'flex',
    gap: 24,
    padding: '24px 40px',
    position: 'relative',
    zIndex: 1,
  },
  questionPanel: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    alignSelf: 'flex-start',
  },
  questionLabel: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent2)',
    letterSpacing: 2,
  },
  questionText: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--white)',
    lineHeight: 1.5,
  },
  questionMeta: {
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
  },
  leaderboardPanel: {
    width: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  lbTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--white)',
  },
  lbList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  lbRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 16px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  lbRow1: {
    background: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.3)',
  },
  lbRow2: {
    background: 'rgba(192,192,192,0.06)',
    border: '1px solid rgba(192,192,192,0.2)',
  },
  lbRow3: {
    background: 'rgba(205,127,50,0.07)',
    border: '1px solid rgba(205,127,50,0.25)',
  },
  rank: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    flexShrink: 0,
  },
  lbName: {
    flex: 1,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
  },
  lbScore: {
    fontSize: 16,
    fontWeight: 900,
    color: 'var(--accent2)',
    fontFamily: 'var(--font-mono)',
  },
  empty: {
    color: 'var(--text2)',
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    padding: '20px 0',
    textAlign: 'center',
  },
  ticker: {
    height: 40,
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
