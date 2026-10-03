'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  computePace,
  fmtInt,
  fmtSaved,
  funnelTargets,
  logTotals,
} from '@/lib/pace';

const EMPTY_FORM = {
  client_name: '',
  close_goal: '',
  bookings_per_100: '',
  show_rate: '',
  close_rate: '',
  working_days: '',
};

const toForm = (c) => ({
  client_name: c.client_name ?? '',
  close_goal: String(c.close_goal ?? ''),
  bookings_per_100: String(c.bookings_per_100 ?? ''),
  show_rate: String(c.show_rate ?? ''),
  close_rate: String(c.close_rate ?? ''),
  working_days: String(c.working_days ?? ''),
});

function formValid(f) {
  return (
    f.client_name.trim() !== '' &&
    Number(f.close_goal) > 0 &&
    Number(f.bookings_per_100) > 0 &&
    Number(f.show_rate) > 0 &&
    Number(f.show_rate) <= 100 &&
    Number(f.close_rate) > 0 &&
    Number(f.close_rate) <= 100 &&
    Number(f.working_days) > 0
  );
}

export default function Tracker({ user }) {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null); // saved row, or null if no setup yet
  const [form, setForm] = useState(EMPTY_FORM);
  const [formDirty, setFormDirty] = useState(false);
  const [logs, setLogs] = useState([]);
  const [draft, setDraft] = useState({ day: '', dials: '', bookings: '' });
  const [lastSaved, setLastSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Serialize outcome writes so rapid +/- taps can't land out of order.
  const outcomeQueue = useRef(Promise.resolve());

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, l] = await Promise.all([
        supabase.from('campaigns').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('call_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('day', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      if (c.error || l.error) setError((c.error || l.error).message);
      if (c.data) {
        setCampaign(c.data);
        setForm(toForm(c.data));
        setLastSaved(c.data.last_saved);
      }
      setLogs(l.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user.id]);

  const nextDay = logs.length ? Math.max(...logs.map((r) => r.day)) + 1 : 1;

  // Pre-fill the Day box with the next session day.
  useEffect(() => {
    setDraft((d) => (d.day === '' || Number(d.day) <= nextDay - 1 ? { ...d, day: String(nextDay) } : d));
  }, [nextDay]);

  // ---------- helpers ----------
  const stamp = useCallback(async () => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('campaigns')
      .update({ last_saved: now })
      .eq('user_id', user.id);
    if (!error) setLastSaved(now);
  }, [supabase, user.id]);

  const draftHasValues = draft.dials !== '' || draft.bookings !== '';
  const draftValid = Number(draft.day) > 0 && draft.dials !== '' && Number(draft.dials) >= 0 && Number(draft.bookings || 0) >= 0;
  const unsaved = formDirty || (draftHasValues && !!campaign);

  // ---------- setup ----------
  async function saveSetup() {
    if (!formValid(form)) {
      setError('Fill in every setup field (rates must be between 0 and 100).');
      return false;
    }
    setError('');
    const now = new Date().toISOString();
    const payload = {
      user_id: user.id,
      client_name: form.client_name.trim(),
      close_goal: Math.round(Number(form.close_goal)),
      bookings_per_100: Number(form.bookings_per_100),
      show_rate: Number(form.show_rate),
      close_rate: Number(form.close_rate),
      working_days: Math.round(Number(form.working_days)),
      last_saved: now,
    };
    // Upsert only touches the columns above, so shows/closes are never overwritten.
    const { data, error } = await supabase
      .from('campaigns')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return false;
    }
    setCampaign(data);
    setForm(toForm(data));
    setFormDirty(false);
    setLastSaved(data.last_saved);
    return true;
  }

  // ---------- daily log ----------
  async function addRow() {
    if (!campaign) return false;
    if (!draftValid) {
      setError('Enter a day and the number of dials.');
      return false;
    }
    setError('');
    const row = {
      user_id: user.id,
      day: Math.round(Number(draft.day)),
      dials: Math.round(Number(draft.dials)),
      bookings: Math.round(Number(draft.bookings || 0)),
    };
    const { data, error } = await supabase.from('call_logs').insert(row).select().single();
    if (error) {
      setError(error.message);
      return false;
    }
    setLogs((prev) =>
      [...prev, data].sort((a, b) => a.day - b.day || a.created_at.localeCompare(b.created_at))
    );
    setDraft({ day: '', dials: '', bookings: '' });
    await stamp();
    return true;
  }

  async function deleteRow(id) {
    const prev = logs;
    setLogs((l) => l.filter((r) => r.id !== id));
    const { error } = await supabase.from('call_logs').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      setLogs(prev);
      setError(error.message);
      return;
    }
    await stamp();
  }

  // ---------- outcomes ----------
  function bump(field, delta) {
    if (!campaign) return;
    const next = Math.max(0, (campaign[field] ?? 0) + delta);
    if (next === campaign[field]) return;
    setCampaign((c) => ({ ...c, [field]: next })); // optimistic
    outcomeQueue.current = outcomeQueue.current.then(async () => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('campaigns')
        .update({ [field]: next, last_saved: now })
        .eq('user_id', user.id);
      if (error) {
        setError(error.message);
        setCampaign((c) => ({ ...c, [field]: Math.max(0, next - delta) }));
      } else {
        setLastSaved(now);
      }
    });
  }

  // ---------- save progress ----------
  async function saveProgress() {
    setBusy(true);
    setError('');
    if (formDirty || !campaign) {
      const ok = await saveSetup();
      if (!ok) {
        setBusy(false);
        return;
      }
    }
    if (draftHasValues && (campaign || formValid(form))) {
      await addRow();
    }
    await outcomeQueue.current;
    await stamp();
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const setField = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFormDirty(true);
  };

  if (loading) return null;

  const totals = logTotals(logs);
  const targets = campaign ? funnelTargets(campaign) : null;
  const pace = campaign ? computePace(campaign, logs) : null;

  let running = 0;
  const rows = logs.map((r) => {
    running += r.dials;
    return { ...r, running };
  });

  const savedLabel = fmtSaved(lastSaved);

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <div className="brand">{campaign?.client_name || 'Dial Tracker'}</div>
          <div className="saved-stamp">
            {savedLabel ? `Last saved: ${savedLabel}` : 'Not saved yet'}
          </div>
        </div>
        <button className="btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* SETUP */}
      <section className="card">
        <h2>{campaign ? 'Campaign setup' : 'Set up your campaign'}</h2>
        <div className="grid-2">
          <div className="field full">
            <label htmlFor="client">Client / campaign name</label>
            <input
              id="client"
              value={form.client_name}
              onChange={setField('client_name')}
              placeholder="e.g. Acme Dental"
            />
          </div>
          <div className="field">
            <label htmlFor="goal">Close goal</label>
            <input
              id="goal"
              type="number"
              inputMode="numeric"
              min="1"
              value={form.close_goal}
              onChange={setField('close_goal')}
              placeholder="8"
            />
          </div>
          <div className="field">
            <label htmlFor="days">Working days in period</label>
            <input
              id="days"
              type="number"
              inputMode="numeric"
              min="1"
              value={form.working_days}
              onChange={setField('working_days')}
              placeholder="20"
            />
          </div>
          <div className="field full">
            <label htmlFor="b100">Bookings per 100 dials</label>
            <input
              id="b100"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={form.bookings_per_100}
              onChange={setField('bookings_per_100')}
              placeholder="2"
            />
          </div>
          <div className="field">
            <label htmlFor="show">Show rate %</label>
            <input
              id="show"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={form.show_rate}
              onChange={setField('show_rate')}
              placeholder="60"
            />
          </div>
          <div className="field">
            <label htmlFor="close">Close rate %</label>
            <input
              id="close"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={form.close_rate}
              onChange={setField('close_rate')}
              placeholder="25"
            />
          </div>
        </div>
        {!campaign && (
          <button className="btn" style={{ marginTop: 16, width: '100%' }} onClick={saveProgress} disabled={busy}>
            {busy ? 'Saving…' : 'Save campaign'}
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {campaign && (
        <>
          {/* BIG NUMBERS */}
          <section className="card">
            <div className="big-row">
              <div className="big-stat">
                <div className="num">{fmtInt(totals.dials)}</div>
                <div className="lbl">
                  dials{targets.targetDials ? ` of ${fmtInt(targets.targetDials)} needed` : ''}
                </div>
              </div>
              <div className="big-stat">
                <div className="num">{fmtInt(totals.bookings)}</div>
                <div className="lbl">
                  bookings{targets.targetBookings ? ` of ${fmtInt(targets.targetBookings)} needed` : ''}
                </div>
              </div>
            </div>
          </section>

          {/* PACE */}
          {pace && (
            <section className="card">
              <h2>Pace</h2>
              <span className={`badge ${pace.status.replace(' ', '-')}`}>{pace.status}</span>
              <p className="pace">{pace.text}</p>
            </section>
          )}

          {/* DAILY LOG */}
          <section className="card">
            <h2>Daily log</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Dials</th>
                    <th>Bookings</th>
                    <th>Totals</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.day}</td>
                      <td>{fmtInt(r.dials)}</td>
                      <td>{fmtInt(r.bookings)}</td>
                      <td>{fmtInt(r.running)}</td>
                      <td className="x">
                        <button
                          className="x-btn"
                          aria-label={`Delete day ${r.day} entry`}
                          onClick={() => deleteRow(r.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{fmtInt(totals.dials)}</td>
                      <td>{fmtInt(totals.bookings)}</td>
                      <td>{fmtInt(totals.dials)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {rows.length === 0 && <div className="empty">No sessions logged yet.</div>}

            <form
              className="add-row"
              onSubmit={(e) => {
                e.preventDefault();
                addRow();
              }}
            >
              <div className="field">
                <label htmlFor="d-day">Day</label>
                <input
                  id="d-day"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={draft.day}
                  onChange={(e) => setDraft({ ...draft, day: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="d-dials">Dials</label>
                <input
                  id="d-dials"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={draft.dials}
                  onChange={(e) => setDraft({ ...draft, dials: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="d-book">Bookings</label>
                <input
                  id="d-book"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={draft.bookings}
                  onChange={(e) => setDraft({ ...draft, bookings: e.target.value })}
                />
              </div>
              <button className="btn" type="submit" disabled={!draftValid}>
                Add
              </button>
            </form>
          </section>

          {/* OUTCOMES */}
          <section className="card">
            <h2>Outcomes</h2>
            <div className="grid-2">
              {[
                ['shows', 'Shows', targets.targetShows],
                ['closes', 'Closes', targets.goal],
              ].map(([field, label, target]) => {
                const value = campaign[field] ?? 0;
                const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
                return (
                  <div className="counter" key={field}>
                    <div className="name">{label}</div>
                    <div className="value">{value}</div>
                    <div className="target">target {fmtInt(target)}</div>
                    <div className="bar">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <div className="btns">
                      <button
                        className="step"
                        aria-label={`Decrease ${label}`}
                        onClick={() => bump(field, -1)}
                      >
                        –
                      </button>
                      <button
                        className="step plus"
                        aria-label={`Increase ${label}`}
                        onClick={() => bump(field, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* SAVE BAR */}
      {campaign && (
        <div className="savebar">
          <div className="savebar-inner">
            <div className={`stamp ${unsaved ? 'dirty' : ''}`}>
              {unsaved
                ? 'Unsaved changes'
                : savedLabel
                ? `Last saved: ${savedLabel}`
                : 'Not saved yet'}
            </div>
            <button className="btn" onClick={saveProgress} disabled={busy || !unsaved}>
              {busy ? 'Saving…' : 'Save Progress'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
