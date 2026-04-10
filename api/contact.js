// api/contact.js
// Receives contact form submissions and emails them to support@preptai.co
// Requires RESEND_API_KEY in Vercel environment variables.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.preptai.co');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email not configured' });

  const { name, email, phone, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  // Basic email validation
  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Sanitize inputs
  const clean = (s) => String(s || '').slice(0, 2000).replace(/<[^>]*>/g, '');

  const html = `
<div style="background:#06060d;padding:40px 32px;max-width:560px;margin:0 auto;border-radius:16px;border:1px solid rgba(255,255,255,0.07);font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="margin-bottom:24px">
    <span style="font-size:20px;font-weight:900;color:#e6c668;letter-spacing:-0.5px">PREPT AI</span>
    <span style="font-size:12px;color:#4d4a66;margin-left:10px">Support Inbox</span>
  </div>
  <h1 style="font-size:22px;font-weight:800;color:#edeaf7;line-height:1.2;margin:0 0 20px 0">
    New contact form submission
  </h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:8px 8px 0 0;font-size:12px;color:#6b6882;text-transform:uppercase;letter-spacing:1px;width:100px">Name</td><td style="padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:8px 8px 0 0;font-size:15px;color:#edeaf7;font-weight:600">${clean(name)}</td></tr>
    <tr><td style="padding:10px 14px;background:rgba(255,255,255,0.03);font-size:12px;color:#6b6882;text-transform:uppercase;letter-spacing:1px">Email</td><td style="padding:10px 14px;background:rgba(255,255,255,0.03);font-size:15px;color:#a498ff"><a href="mailto:${clean(email)}" style="color:#a498ff;text-decoration:none">${clean(email)}</a></td></tr>
    ${phone ? `<tr><td style="padding:10px 14px;background:rgba(255,255,255,0.04);font-size:12px;color:#6b6882;text-transform:uppercase;letter-spacing:1px">Phone</td><td style="padding:10px 14px;background:rgba(255,255,255,0.04);font-size:15px;color:#edeaf7">${clean(phone)}</td></tr>` : ''}
    ${subject ? `<tr><td style="padding:10px 14px;background:rgba(255,255,255,0.03);font-size:12px;color:#6b6882;text-transform:uppercase;letter-spacing:1px">Subject</td><td style="padding:10px 14px;background:rgba(255,255,255,0.03);font-size:15px;color:#edeaf7">${clean(subject)}</td></tr>` : ''}
  </table>
  <div style="background:rgba(123,109,244,0.07);border:1px solid rgba(123,109,244,0.15);border-radius:10px;padding:20px;margin-bottom:24px">
    <div style="font-size:11px;color:#6b6882;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Message</div>
    <div style="font-size:15px;color:#edeaf7;line-height:1.7;white-space:pre-wrap">${clean(message)}</div>
  </div>
  <a href="mailto:${clean(email)}?subject=Re: ${clean(subject || 'Your PREPT AI inquiry')}"
    style="display:inline-block;padding:13px 28px;background:#7b6df4;color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;margin-bottom:24px">
    Reply to ${clean(name)} →
  </a>
  <div style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06)">
    <p style="font-size:12px;color:#4d4a66;margin:0;line-height:1.6">
      Submitted via preptai.co/contact.html · Respond within 1 business day
    </p>
  </div>
</div>`;

  // Also send auto-reply to the user
  const autoReplyHtml = `
<div style="background:#06060d;padding:40px 32px;max-width:520px;margin:0 auto;border-radius:16px;border:1px solid rgba(255,255,255,0.07);font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="margin-bottom:24px">
    <span style="font-size:20px;font-weight:900;color:#e6c668;letter-spacing:-0.5px">PREPT AI</span>
  </div>
  <h1 style="font-size:24px;font-weight:800;color:#edeaf7;line-height:1.2;margin:0 0 14px 0">
    We got your message, ${clean(name).split(' ')[0]}.
  </h1>
  <p style="font-size:15px;color:#b0adc6;line-height:1.7;margin:0 0 16px 0">
    Thanks for reaching out. We will respond within 1 business day.
  </p>
  <p style="font-size:15px;color:#b0adc6;line-height:1.7;margin:0 0 24px 0">
    In the meantime, you can reach us directly at <a href="mailto:support@preptai.co" style="color:#a498ff;text-decoration:none">support@preptai.co</a> or by phone at <a href="tel:+18554773780" style="color:#a498ff;text-decoration:none">(855) 477-3780</a>.
  </p>
  <a href="https://www.preptai.co/prept_v2.html"
    style="display:inline-block;padding:13px 28px;background:#e6c668;color:#06060d;font-size:14px;font-weight:800;text-decoration:none;border-radius:10px;margin-bottom:28px">
    Try PREPT AI Live →
  </a>
  <div style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06)">
    <p style="font-size:12px;color:#4d4a66;margin:0;line-height:1.6">
      PREPT AI · (855) 477-3780 · <a href="mailto:support@preptai.co" style="color:#4d4a66">support@preptai.co</a> · Created with love in San Antonio, TX
    </p>
  </div>
</div>`;

  try {
    // Send notification to support
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'PREPT AI Contact <support@preptai.co>',
        to: ['support@preptai.co'],
        reply_to: email,
        subject: `Contact: ${clean(subject || 'General inquiry')} ,  ${clean(name)}`,
        html,
      }),
    });

    // Send auto-reply to user
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'PREPT AI Support <support@preptai.co>',
        to: [email],
        subject: `We received your message ,  PREPT AI`,
        html: autoReplyHtml,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
 
