// ============================================
// UPTIKALERTS — JoinGroupPage.jsx
// Handles /join/:code invite links
// ============================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function JoinGroupPage({ session }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | joining | success | already | error | needLogin
  const [groupName, setGroupName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMsg('Invalid invite link');
      return;
    }

    if (!session) {
      // Save invite code so we can join after login
      localStorage.setItem('uptik_pending_invite', code);
      setStatus('needLogin');
      return;
    }

    joinGroup();
  }, [code, session]);

  const joinGroup = async () => {
    setStatus('joining');

    const { data, error } = await supabase.rpc('join_custom_group', {
      p_invite_code: code,
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }

    if (!data?.success) {
      setStatus('error');
      setErrorMsg(data?.error || 'Could not join group');
      return;
    }

    setGroupName(data.group_name);

    if (data.already_member) {
      setStatus('already');
    } else {
      setStatus('success');
    }

    // Set as active group and navigate after a short delay
    localStorage.setItem('uptik_active_group', data.group_id);
    localStorage.setItem('uptik_join_redirect', 'chat');
    setTimeout(() => navigate('/app'), 1800);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 50 50" fill="none" stroke="#8cd9a0" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -6, verticalAlign: 'bottom', position: 'relative', top: 7 }}>
              <path d="M15 14 L15 32 C15 42 35 42 35 32 L35 8" strokeWidth="3.5" />
              <path d="M20 18 L20 31 C20 38 30 38 30 31 L30 14" strokeWidth="2.5" opacity="0.6" />
              <path d="M25 22 L25 30 C25 34 25 34 25 30 L25 22" strokeWidth="1.8" opacity="0.35" />
              <path d="M35 8 L29 14 M35 8 L41 14" strokeWidth="3.5" />
            </svg>
            <span style={{ color: '#8cd9a0', fontSize: 24, fontWeight: 700 }}>p</span>
            <span style={{ color: '#f0f0f0', fontSize: 24, fontWeight: 700 }}>tik</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 400, color: '#d4e4f2', letterSpacing: 1.5, marginTop: -2, paddingLeft: 30, fontFamily: "'Outfit', sans-serif" }}>a l e r t s</div>
        </div>

        {status === 'loading' && (
          <>
            <div style={styles.spinner} />
            <div style={styles.text}>Loading invite...</div>
          </>
        )}

        {status === 'joining' && (
          <>
            <div style={styles.spinner} />
            <div style={styles.text}>Joining group...</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={styles.checkCircle}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={styles.title}>You're in!</div>
            <div style={styles.text}>Joined <strong>{groupName}</strong></div>
            <div style={styles.subtext}>Redirecting to chat...</div>
          </>
        )}

        {status === 'already' && (
          <>
            <div style={{ ...styles.checkCircle, background: '#42A5F5' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={styles.title}>Already a member</div>
            <div style={styles.text}>You're already in <strong>{groupName}</strong></div>
            <div style={styles.subtext}>Redirecting to chat...</div>
          </>
        )}

        {status === 'needLogin' && (
          <>
            <div style={styles.title}>Join a group</div>
            <div style={styles.text}>Sign in to accept this invite</div>
            <button style={styles.btn} onClick={() => navigate('/login')}>
              Sign in
            </button>
            <div style={styles.subtext}>
              Don't have an account? You'll be able to create one.
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ ...styles.checkCircle, background: '#EF4444' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div style={styles.title}>Invite failed</div>
            <div style={styles.text}>{errorMsg}</div>
            <button style={styles.btn} onClick={() => navigate(session ? '/app' : '/login')}>
              {session ? 'Go to app' : 'Sign in'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#132d52',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: '#2a3a2a',
    borderRadius: 16,
    padding: '40px 28px',
    textAlign: 'center',
    maxWidth: 340,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid rgba(255,255,255,0.15)',
    borderTopColor: '#4CAF50',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  checkCircle: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: '#4CAF50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#f0f0f0',
  },
  text: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
  },
  subtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  btn: {
    background: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 40px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
};
