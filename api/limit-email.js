// api/limit-email.js
// Sends a follow-up email when a free user hits their session limit.
// Requires RESEND_API_KEY in Vercel environment variables.
// Get a free key at resend.com (3,000 emails/month free).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Silent fail if Resend not configured yet
    return res.status(200).json({ ok: true, note: 'Email not configured' });
  }

  const { email, firstName } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const name = firstName || 'there';

  const html = `
<div style="background:#06060d;padding:40px 32px;max-width:520px;margin:0 auto;border-radius:16px;border:1px solid rgba(255,255,255,0.07);font-family:'Helvetica Neue',Arial,sans-serif">

  <div style="margin-bottom:24px">
    <span style="font-size:20px;font-weight:900;color:#e6c668;letter-spacing:-0.5px">PREPT AI</span>
  </div>

  <h1 style="font-size:24px;font-weight:800;color:#edeaf7;line-height:1.2;margin:0 0 14px 0">
    Hey ${name}, you hit your free limit.
  </h1>

  <p style="font-size:15px;color:#8c89a6;line-height:1.7;margin:0 0 20px 0">
    You have used all 3 of your free interview coaching sessions. That means you were practicing, which means you are serious about landing this role.
  </p>

  <p style="font-size:15px;color:#8c89a6;line-height:1.7;margin:0 0 24px 0">
    Pro unlocks unlimited coaching sessions, unlimited resume analyses, filler word tracking, salary negotiation coaching, and your full progress dashboard. All for $12/month, less than one hour with a career coach.
  </p>

  <a href="https://buy.stripe.com/bJe4gAdlkddX92gfLycbC00"
    style="display:inline-block;padding:15px 34px;background:#e6c668;color:#06060d;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px">
    Start Pro, 7 days free
  </a>

  <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06)">
    <p style="font-size:13px;color:#4d4a66;margin:0;line-height:1.6">
      Questions? Reply to this email or reach us at <a href="mailto:support@preptai.co" style="color:#7b6df4;text-decoration:none">support@preptai.co</a>
    </p>
  </div>

  <div style="margin-top:20px">
    <p style="font-size:11px;color:#2c2a44;margin:0;line-height:1.6">
      PREPT AI · Built in San Antonio, TX · <a href="https://www.preptai.co" style="color:#2c2a44">preptai.co</a>
    </p>
  </div>

</div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'PREPT AI <support@preptai.co>',
        to: [email],
        subject: `${name}, you used all your free sessions`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Resend error:', err);
      return res.status(200).json({ ok: true, note: 'Email failed silently' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('limit-email error:', err);
    return res.status(200).json({ ok: true, note: 'Silent fail' });
  }
}
