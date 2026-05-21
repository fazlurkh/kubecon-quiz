import React, { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function Admin() {
  const [user, setUser] = useState(null)
  const [quizzes, setQuizzes] = useState([])
  const [newQuizName, setNewQuizName] = useState('')
  const [newQuizDesc, setNewQuizDesc] = useState('')
  const [questionOrder, setQuestionOrder] = useState('sequential')
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/admin-login')
      } else {
        setUser(session.user)
        loadQuizzes()
      }
    })
  }, [])

  const loadQuizzes = async () => {
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false })
    setQuizzes(data || [])
  }

  const createQuiz = async () => {
    if (!newQuizName.trim()) return
    setCreating(true)
    const { error } = await supabase
      .from('quizzes')
      .insert({ name: newQuizName, description: newQuizDesc, question_order: questionOrder })
    if (error) {
      setMessage({ type: 'error', text: 'Failed to create quiz' })
    } else {
      setMessage({ type: 'success', text: 'Quiz created!' })
      setNewQuizName('')
      setNewQuizDesc('')
      setQuestionOrder('sequential')
      loadQuizzes()
    }
    setCreating(false)
  }

  const parseCSV = (str) => {
    const results = []
    const lines = str.trim().split(/\r?\n/)
    const parseRow = (line) => {
      const cols = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (ch === ',' && !inQuotes) {
          cols.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      cols.push(current.trim())
      return cols
    }
    const headers = parseRow(lines[0]).map(h => h.toLowerCase())
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const cols = parseRow(lines[i])
      const row = {}
      headers.forEach((h, idx) => row[h] = cols[idx] || '')
      results.push(row)
    }
    return results
  }

  const handleFile = async (e, quizId) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setMessage(null)

    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      let rows = []

      if (isExcel) {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      } else {
        const text = await file.text()
        rows = parseCSV(text)
      }

      const questions = rows.map((row, i) => ({
        quiz_id: quizId,
        question: row['question'] || row['Question'],
        option_a: row['option_a'] || row['Option A'] || row['option a'],
        option_b: row['option_b'] || row['Option B'] || row['option b'],
        option_c: row['option_c'] || row['Option C'] || row['option c'],
        option_d: row['option_d'] || row['Option D'] || row['option d'],
        correct_answer: (row['correct_answer'] || row['Correct Answer'] || row['correct answer'] || '').toString().toUpperCase().trim().charAt(0),
        time_limit: parseInt(row['time_limit'] || row['Time Limit'] || row['time limit']) || 30,
        order_index: i + 1,
        day: 1,
      }))

      const { error } = await supabase.from('questions').insert(questions)
      if (error) {
        setMessage({ type: 'error', text: 'Upload failed: ' + error.message })
      } else {
        setMessage({ type: 'success', text: `${questions.length} questions uploaded successfully!` })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error reading file: ' + err.message })
    }
    setUploading(false)
  }

  const deleteQuiz = async (quizId, quizName) => {
    if (!window.confirm(`Delete "${quizName}" and all its questions?`)) return

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('quiz_id', quizId)

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id)
      await supabase.from('answers').delete().in('session_id', sessionIds)
      await supabase.from('participants').delete().in('session_id', sessionIds)
      await supabase.from('sessions').delete().eq('quiz_id', quizId)
    }

    const { error } = await supabase.from('questions').delete().eq('quiz_id', quizId)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete questions' })
      return
    }

    const { error: quizError } = await supabase.from('quizzes').delete().eq('id', quizId)
    if (quizError) {
      setMessage({ type: 'error', text: 'Failed to delete quiz' })
    } else {
      setMessage({ type: 'success', text: `"${quizName}" deleted successfully` })
      loadQuizzes()
    }
  }

  const downloadQuestions = async (quizId, quizName) => {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('order_index')

    if (!data || data.length === 0) {
      setMessage({ type: 'error', text: 'No questions found for this quiz' })
      return
    }

    const rows = data.map(q => ({
      question: q.question,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      time_limit: q.time_limit,
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Questions')
    XLSX.writeFile(wb, `${quizName.replace(/\s+/g, '_')}_questions.xlsx`)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/admin-login')
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Admin Panel</div>
          <div style={styles.headerSub}>KubeCon Quiz Management</div>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>Logout</button>
      </div>

      <div style={styles.body}>
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

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Create New Quiz</div>
          <div style={styles.form}>
            <input
              style={styles.input}
              placeholder="Quiz name (e.g. KubeCon Day 1)"
              value={newQuizName}
              onChange={e => setNewQuizName(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Description (optional)"
              value={newQuizDesc}
              onChange={e => setNewQuizDesc(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              {['sequential', 'random'].map(order => (
                <button
                  key={order}
                  onClick={() => setQuestionOrder(order)}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: questionOrder === order
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)',
                    background: questionOrder === order
                      ? 'rgba(50,108,229,0.15)'
                      : 'var(--bg2)',
                    color: questionOrder === order ? 'var(--white)' : 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: questionOrder === order ? 700 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {order === 'sequential' ? '📋 Sequential' : '🔀 Random'}
                </button>
              ))}
            </div>
            <button
              onClick={createQuiz}
              disabled={creating || !newQuizName.trim()}
              style={styles.btn}
            >
              {creating ? 'Creating...' : 'Create Quiz'}
            </button>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>All Quizzes</div>
          {quizzes.length === 0 ? (
            <div style={styles.empty}>No quizzes yet. Create one above.</div>
          ) : (
            quizzes.map(quiz => (
              <div key={quiz.id} style={styles.quizRow}>
                <div style={styles.quizInfo}>
                  <div style={styles.quizName}>{quiz.name}</div>
                  <div style={styles.quizDesc}>{quiz.description || 'No description'}</div>
                  <div style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {quiz.question_order === 'random' ? '🔀 Random order' : '📋 Sequential order'}
                  </div>
                </div>
                <div style={styles.quizActions}>
                  <button
                    onClick={() => downloadQuestions(quiz.id, quiz.name)}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      border: '1px solid var(--accent)',
                      background: 'rgba(50,108,229,0.1)',
                      color: 'var(--accent2)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Download
                  </button>
                  <button
                    onClick={() => deleteQuiz(quiz.id, quiz.name)}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      border: '1px solid var(--red)',
                      background: 'rgba(255,23,68,0.1)',
                      color: 'var(--red)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                  <label style={styles.uploadBtn}>
                    {uploading ? 'Uploading...' : 'Upload CSV / Excel'}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={e => handleFile(e, quiz.id)}
                    />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>File Format Guide</div>
          <div style={styles.codeBlock}>
            {`question,option_a,option_b,option_c,option_d,correct_answer,time_limit\n"What is Kubernetes?","Container orchestrator","A database","A cloud provider","A language","A",30`}
          </div>
          <div style={styles.hint}>
            Supports .csv and .xlsx files. Column headers must match exactly as shown above.
          </div>
        </div>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  logoutBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 14,
  },
  body: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  message: {
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg2)',
    color: 'var(--white)',
    fontSize: 15,
    outline: 'none',
  },
  btn: {
    padding: '12px 24px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  quizRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  quizInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  quizName: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--white)',
  },
  quizDesc: {
    fontSize: 13,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
  },
  quizActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  uploadBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: '1px solid var(--green)',
    background: 'rgba(0,230,118,0.1)',
    color: 'var(--green)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  codeBlock: {
    padding: '16px',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text2)',
    whiteSpace: 'pre-wrap',
  },
  hint: {
    fontSize: 13,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
  },
  empty: {
    color: 'var(--text2)',
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
  },
}
