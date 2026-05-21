import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const OPTION_COLORS = {
  A: { bg: 'rgba(50,108,229,0.15)', border: '#326ce5', label: '#326ce5' },
  B: { bg: 'rgba(255,214,0,0.12)', border: '#ffd600', label: '#ffd600' },
  C: { bg: 'rgba(0,230,118,0.12)', border: '#00e676', label: '#00e676' },
  D: { bg: 'rgba(255,23,68,0.12)', border: '#ff1744', label: '#ff1744' },
}

export default function Question() {
  const { sessionId, participantId } = useParams()
  const navigate = useNavigate()
  const [question, setQuestion] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [isCorrect, setIsCorrect] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [totalScore, setTotalScore] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [answerStats, setAnswerStats] = useState({})
  const [questionNum, setQuestionNum] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [myRank, setMyRank] = useState(null)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const answeredQuestions = useRef(new Set())
  const timerRef = useRef(null)
  const questionStartRef = useRef(null)

  // Save session to localStorage for browser resume
  useEffect(() => {
    localStorage.setItem('kubecon_session', JSON.stringify({ sessionId, participantId }))
  }, [sessionId, participantId])

  useEffect(() => {
    supabase
      .from('participants')
      .select('score')
      .eq('id', participantId)
      .single()
      .then(({ data }) => setTotalScore(data?.score || 0))
  }, [participantId])

  const loadMyRank = async () => {
    const { data } = await supabase
      .from('participants')
      .select('id, score')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
    if (data) {
      setTotalParticipants(data.length)
      const rank = data.findIndex(p => p.id === participantId) + 1
      setMyRank(rank)
    }
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

  const loadQuestionNumber = async (questionId, quizId) => {
    const { data: allQ } = await supabase
      .from('questions')
      .select('id')
      .eq('quiz_id', quizId)
      .order('order_index')
    if (allQ) {
      setTotalQuestions(allQ.length)
      const idx = allQ.findIndex(q => q.id === questionId)
      setQuestionNum(idx + 1)
    }
  }

  useEffect(() => {
    supabase
      .from('sessions')
      .select('*, questions(*)')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data) {
          if (data.status === 'finished') {
            navigate(`/winner/${sessionId}`)
            return
          }
          if (data.questions) {
            loadQuestionNumber(data.questions.id, data.quiz_id)
            setShowResults(data.show_results || false)
            if (data.show_results) {
              setQuestion(data.questions)
              loadAnswerStats(data.questions.id)
              loadMyRank()
            } else {
              loadQuestion(data.questions, data.question_started_at)
            }
          }
        }
      })

    const channel = supabase
      .channel(`question-session-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, async (payload) => {
        const updated = payload.new
        if (updated.status === 'finished') {
          navigate(`/winner/${sessionId}`)
          return
        }
        if (updated.show_results === true) {
          setShowResults(true)
          clearInterval(timerRef.current)
          if (updated.current_question_id) {
            loadAnswerStats(updated.current_question_id)
            loadMyRank()
          }
          return
        }
        if (updated.show_results === false && updated.current_question_id) {
          setShowResults(false)
          setAnswerStats({})
          const { data: q } = await supabase
            .from('questions')
            .select('*')
            .eq('id', updated.current_question_id)
            .single()
          if (q) {
            loadQuestionNumber(q.id, updated.quiz_id)
            loadQuestion(q, updated.question_started_at)
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [sessionId])

  const loadQuestion = (q, startedAt) => {
    if (answeredQuestions.current.has(q.id)) return
    clearInterval(timerRef.current)
    setQuestion(q)
    setAnswered(false)
    setSelectedAnswer(null)
    setIsCorrect(null)
    setShowResults(false)
    setAnswerStats({})
    questionStartRef.current = new Date(startedAt).getTime()

    const elapsed = Math.floor((Date.now() - questionStartRef.current) / 1000)
    const remaining = Math.max(0, q.time_limit - elapsed)
    setTimeLeft(remaining)

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const submitAnswer = async (option) => {
    if (answered || !question) return
    clearInterval(timerRef.current)

    const responseTimeMs = Date.now() - questionStartRef.current
    const correct = option === question.correct_answer
    const timeRemaining = Math.max(0, question.time_limit * 1000 - responseTimeMs)
    const points = correct ? Math.round(100 * (timeRemaining / (question.time_limit * 1000))) : 0

    setAnswered(true)
    setSelectedAnswer(option)
    setIsCorrect(correct)
    answeredQuestions.current.add(question.id)

    await supabase.from('answers').insert({
      session_id: sessionId,
      participant_id: participantId,
      question_id: question.id,
      answer: option,
      is_correct: correct,
      response_time_ms: responseTimeMs,
      points_awarded: points,
    })

    if (points > 0) {
      await supabase.rpc('increment_score', {
        participant_id: participantId,
        points: points
      })
      setTotalScore(s => s + points)
    }
  }

  useEffect(() => {
    return () => clearInterval(timerRef.current)
  }, [])

  if (!question) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <div style={styles.loadingText}>Loading question...</div>
      </div>
    )
  }

  const timerPct = timeLeft !== null ? (timeLeft / question.time_limit) * 100 : 100
  const timerColor = timerPct > 50 ? 'var(--green)' : timerPct > 25 ? 'var(--yellow)' : 'var(--red)'

  const rankLabel = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`

  // Results screen
  if (showResults) {
    const total = Object.values(answerStats).reduce((a, b) => a + b, 0)
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.scoreBadge}>⭐ {totalScore} pts</div>
          <div style={{ fontSize: 12, color: 'var(--accent2)', fontFamily: 'var(--font-mono)' }}>
            Q{questionNum}/{totalQuestions} · RESULTS
          </div>
        </div>
        <div style={styles.body}>
          {myRank && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 12,
              background: myRank <= 3 ? 'rgba(255,215,0,0.1)' : 'var(--panel)',
              border: myRank <= 3 ? '1px solid rgba(255,215,0,0.4)' : '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 24 }}>{rankLabel}</span>
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: myRank <= 3 ? '#ffd700' : 'var(--white)',
                }}>
                  {myRank <= 3 ? 'You are in the top 3!' : `Your rank: #${myRank} of ${totalParticipants}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                  {totalScore} points
                </div>
              </div>
            </div>
          )}

          <div style={{ ...styles.questionText, opacity: 0.7, fontSize: 16 }}>
            {question.question}
          </div>

          <div style={styles.options}>
            {['A', 'B', 'C', 'D'].map(opt => {
              const optText = question[`option_${opt.toLowerCase()}`]
              const isCorrectOpt = opt === question.correct_answer
              const count = answerStats[opt] || 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const isSelected = opt === selectedAnswer

              return (
                <div key={opt} style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: isCorrectOpt
                    ? '2px solid var(--green)'
                    : isSelected && !isCorrectOpt
                    ? '2px solid var(--red)'
                    : '1px solid var(--border)',
                  opacity: !isCorrectOpt && !isSelected ? 0.5 : 1,
                  transition: 'all 0.5s',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: isCorrectOpt
                      ? 'rgba(0,230,118,0.1)'
                      : isSelected && !isCorrectOpt
                      ? 'rgba(255,23,68,0.1)'
                      : 'var(--panel)',
                  }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: isCorrectOpt ? 'var(--green)' : isSelected && !isCorrectOpt ? 'var(--red)' : 'var(--border)',
                      color: isCorrectOpt || (isSelected && !isCorrectOpt) ? '#fff' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13, flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                    }}>{opt}</span>
                    <span style={{
                      flex: 1, fontSize: 14,
                      color: isCorrectOpt ? 'var(--green)' : 'var(--text)',
                      fontWeight: isCorrectOpt ? 700 : 400,
                    }}>{optText}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: isCorrectOpt ? 'var(--green)' : 'var(--text2)',
                      fontFamily: 'var(--font-mono)',
                    }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: isCorrectOpt ? 'var(--green)' : isSelected && !isCorrectOpt ? 'var(--red)' : 'var(--text2)',
                      transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{
            padding: '14px 18px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
            background: isCorrect ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)',
            border: `1px solid ${isCorrect ? 'var(--green)' : 'var(--red)'}`,
          }}>
            {!answered ? (
              <span style={{ color: 'var(--text2)' }}>⏰ Time's up! Correct answer: {question.correct_answer}</span>
            ) : isCorrect ? (
              <span style={{ color: 'var(--green)' }}>✅ Correct! Waiting for next question...</span>
            ) : (
              <span style={{ color: 'var(--red)' }}>❌ Wrong! Correct answer: {question.correct_answer}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Question screen
  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.scoreBadge}>⭐ {totalScore} pts</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
          Q{questionNum}/{totalQuestions}
        </div>
        {!answered && timeLeft !== null && (
          <div style={{ ...styles.timer, color: timerColor }}>
            {timeLeft}s
          </div>
        )}
      </div>

      {!answered && (
        <div style={styles.timerBar}>
          <div style={{
            ...styles.timerFill,
            width: `${timerPct}%`,
            background: timerColor,
            transition: 'width 1s linear, background 1s',
          }} />
        </div>
      )}

      <div style={styles.body}>
        <div style={styles.questionText}>{question.question}</div>

        <div style={styles.options}>
          {['A', 'B', 'C', 'D'].map(opt => {
            const optText = question[`option_${opt.toLowerCase()}`]
            const colors = OPTION_COLORS[opt]

            return (
              <button
                key={opt}
                onClick={() => submitAnswer(opt)}
                disabled={answered}
                style={{
                  ...styles.optionBtn,
                  background: answered
                    ? opt === selectedAnswer
                      ? 'rgba(50,108,229,0.2)'
                      : 'var(--panel)'
                    : colors.bg,
                  border: answered
                    ? opt === selectedAnswer
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)'
                    : `1px solid ${colors.border}`,
                  opacity: answered && opt !== selectedAnswer ? 0.4 : 1,
                }}
              >
                <span style={{
                  ...styles.optionLabel,
                  color: colors.label,
                  background: answered && opt === selectedAnswer
                    ? 'var(--accent)'
                    : colors.bg,
                  border: `1px solid ${colors.border}`,
                }}>
                  {opt}
                </span>
                <span style={styles.optionText}>{optText}</span>
              </button>
            )
          })}
        </div>

        {answered && (
          <div style={{
            padding: '14px 18px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
            background: 'rgba(50,108,229,0.1)',
            border: '1px solid var(--accent)',
            color: 'var(--accent2)',
          }}>
            ⏳ Waiting for results...
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
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)',
  },
  scoreBadge: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--yellow)',
    fontFamily: 'var(--font-mono)',
  },
  timer: {
    fontSize: 22,
    fontWeight: 900,
    fontFamily: 'var(--font-mono)',
    minWidth: 40,
    textAlign: 'right',
  },
  timerBar: {
    height: 5,
    background: 'var(--border)',
    width: '100%',
  },
  timerFill: {
    height: '100%',
    borderRadius: '0 2px 2px 0',
  },
  body: {
    flex: 1,
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 600,
    margin: '0 auto',
    width: '100%',
  },
  questionText: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--white)',
    lineHeight: 1.5,
    padding: '16px 0',
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  optionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'transform 0.1s, opacity 0.2s',
    textAlign: 'left',
    width: '100%',
  },
  optionLabel: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    flexShrink: 0,
  },
  optionText: {
    fontSize: 15,
    color: 'var(--text)',
    fontWeight: 500,
    lineHeight: 1.4,
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
    width: 36,
    height: 36,
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
