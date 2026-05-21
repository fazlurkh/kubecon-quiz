import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const login = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid email or password')
    } else {
      navigate('/admin')
    }
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>Admin Login</div>
        <div style={styles.sub}>KubeCon Quiz Management</div>
        {error && <div style={styles.error}>{error}</div>}
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
        />
        <button
          onClick={login}
          disabled={loading}
          style={styles.btn}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--white)',
    textAlign: 'center',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
    marginBottom: 8,
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
    padding: '14px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
    color: 'var(--white)',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
  },
  error: {
    color: 'var(--red)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
    padding: '10px',
    background: 'rgba(255,23,68,0.1)',
    borderRadius: 8,
    border: '1px solid var(--red)',
  },
}
