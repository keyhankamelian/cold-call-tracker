// Pure calculation helpers — no React, no Supabase.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function fmtInt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtOne(n) {
  return (Math.round(n * 10) / 10).toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });
}

// "Jun 1, 2:34pm"
export function fmtSaved(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${date}, ${h}:${m}${ap}`;
}

// What the campaign needs in total to hit the close goal.
export function funnelTargets(c) {
  const goal = num(c.close_goal);
  const bookRate = num(c.bookings_per_100) / 100;
  const showRate = num(c.show_rate) / 100;
  const closeRate = num(c.close_rate) / 100;

  const targetShows = closeRate > 0 ? goal / closeRate : 0;
  const targetBookings = showRate > 0 ? targetShows / showRate : 0;
  const targetDials = bookRate > 0 ? targetBookings / bookRate : 0;

  return {
    goal,
    targetShows: Math.ceil(targetShows),
    targetBookings: Math.ceil(targetBookings),
    targetDials: Math.ceil(targetDials),
    closesPerDial: bookRate * showRate * closeRate,
  };
}

export function logTotals(logs) {
  return logs.reduce(
    (acc, r) => ({
      dials: acc.dials + num(r.dials),
      bookings: acc.bookings + num(r.bookings),
    }),
    { dials: 0, bookings: 0 }
  );
}

// Plain-English pace summary. Returns null until there is at least one log entry.
export function computePace(c, logs) {
  if (!c || logs.length === 0) return null;

  const t = funnelTargets(c);
  const totals = logTotals(logs);
  const workingDays = Math.max(1, Math.round(num(c.working_days)));
  const daysLogged = new Set(logs.map((r) => r.day)).size;

  const avgDials = totals.dials / daysLogged;
  const projDials = avgDials * workingDays;
  const projCloses = projDials * t.closesPerDial;

  const daysLeft = Math.max(workingDays - daysLogged, 0);
  const dialsStillNeeded = Math.max(t.targetDials - totals.dials, 0);
  const neededPerDay = daysLeft > 0 ? dialsStillNeeded / daysLeft : null;

  let status = 'on track';
  if (t.goal > 0) {
    const ratio = projCloses / t.goal;
    if (ratio >= 1.05) status = 'ahead';
    else if (ratio < 0.95) status = 'behind';
  }

  const dayWord = daysLogged === 1 ? 'day' : 'days';
  let text =
    `You're averaging ${fmtOne(avgDials)} dials per day across ${daysLogged} ${dayWord} logged. ` +
    `At that pace you'll reach about ${fmtInt(projDials)} total dials by the end of your ${workingDays}-day period, ` +
    `which projects to roughly ${fmtOne(projCloses)} closes against your goal of ${fmtInt(t.goal)}. `;

  if (status === 'ahead') {
    text += `You're ahead of pace — keep the volume steady.`;
  } else if (status === 'on track') {
    text += `You're on track — hold this pace and you'll land right around your goal.`;
  } else if (daysLeft === 0) {
    text += `You're behind pace, and the period is out of days.`;
  } else {
    text +=
      `You're behind pace. To hit the goal you need about ${fmtInt(t.targetDials)} total dials, ` +
      `which means roughly ${fmtInt(Math.ceil(neededPerDay))} dials per day for the remaining ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`;
  }

  return { status, text, avgDials, projDials, projCloses, daysLogged };
}
