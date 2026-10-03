'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import AuthForm from '@/components/AuthForm';
import Tracker from '@/components/Tracker';

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [configError, setConfigError] = useState(null);

  useEffect(() => {
    let sub;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
      const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
      sub = data.subscription;
    } catch (e) {
      setConfigError(e.message);
      setSession(null);
    }
    return () => sub?.unsubscribe();
  }, []);

  if (configError) {
    return (
      <div className="auth">
        <h1>Setup needed</h1>
        <p className="error">{configError}</p>
      </div>
    );
  }

  if (session === undefined) return null;
  if (!session) return <AuthForm />;
  return <Tracker user={session.user} />;
}
