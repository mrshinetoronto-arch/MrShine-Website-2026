const Stripe     = require('stripe');
const nodemailer = require('nodemailer');

const ADDON_NAMES = {
  'engine-bay':      'Engine Bay Detail',
  'headlight':       'Headlight Restoration',
  'wax-buff':        'Wax & Buff',
  'undercarriage':   'Undercarriage Wash',
  'seat-restore':    'Seat Restoration',
  'liquid-wax':      'Liquid Wax Protection',
  'odour':           'Odour Removal',
  'interior-polish': 'Interior Polishing',
  'ceramic-wheels':  'Ceramic Wheels',
  'ceramic-windows': 'Ceramic Windows',
};

const SZ_LABELS = { sedan: 'Sedan / Coupe', suv: 'Compact SUV', large: 'Large Vehicle' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

async function sendEmails(m, amountTotal) {
  if (!process.env.GMAIL_PASS) {
    console.error('[EMAIL] GMAIL_PASS env var is not set — emails cannot be sent');
    throw new Error('GMAIL_PASS not configured on server');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'mrshinetoronto@gmail.com',
      pass: process.env.GMAIL_PASS,
    },
  });

  const addons   = m.addons ? m.addons.split(',').filter(Boolean) : [];
  const addonStr = addons.map(id => ADDON_NAMES[id] || id).join(', ') || 'None';
  const petHairStr = m.petHair === 'true' ? 'Yes' : 'No';
  const dateStr  = formatDate(m.date);
  const fullName = `${m.fname} ${m.lname}`.trim();

  // Use stored subtotal/hst if available (new bookings), else back-calculate
  const totalAmt   = amountTotal / 100;
  const subtotalAmt = m.subtotal ? parseFloat(m.subtotal) : Math.round(totalAmt / 1.13 * 100) / 100;
  const hstAmt      = m.hst      ? parseFloat(m.hst)      : Math.round((totalAmt - subtotalAmt) * 100) / 100;

  const bookingTable = `
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:8px 0;color:#888;width:140px;">Service</td><td style="padding:8px 0;font-weight:600;">${m.svcName}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Vehicle Size</td><td style="padding:8px 0;">${SZ_LABELS[m.sz] || m.sz}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Vehicle</td><td style="padding:8px 0;">${m.vehicle || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Add-ons</td><td style="padding:8px 0;">${addonStr}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Pet Hair Removal</td><td style="padding:8px 0;">${petHairStr}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Location</td><td style="padding:8px 0;">${m.location}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Date</td><td style="padding:8px 0;">${dateStr}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Time</td><td style="padding:8px 0;">${m.time}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;">${m.phone || '—'}</td></tr>
      <tr style="border-top:1px solid #eee;">
        <td style="padding:6px 0;color:#888;">Subtotal</td>
        <td style="padding:6px 0;">$${subtotalAmt.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#888;">HST (13%)</td>
        <td style="padding:6px 0;">$${hstAmt.toFixed(2)}</td>
      </tr>
      <tr style="border-top:2px solid #cc0000;">
        <td style="padding:12px 0;font-weight:700;color:#cc0000;">Total Paid</td>
        <td style="padding:12px 0;font-weight:700;font-size:18px;color:#cc0000;">$${totalAmt.toFixed(2)}</td>
      </tr>
    </table>`;

  // ── Email to business ──
  await transporter.sendMail({
    from:    '"MrShine Bookings" <mrshinetoronto@gmail.com>',
    to:      'mrshinetoronto@gmail.com',
    subject: `New Booking — ${fullName} · ${m.svcName} · ${dateStr}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#cc0000;margin-bottom:4px;">New Booking Received</h2>
        <p style="color:#555;margin-top:0;">A new booking has been paid and confirmed.</p>
        <p style="font-size:15px;"><strong>Customer:</strong> ${fullName} &lt;${m.email}&gt;</p>
        ${bookingTable}
        ${m.notes ? `<p style="color:#555;font-size:13px;margin-top:12px;"><strong>Notes:</strong> ${m.notes}</p>` : ''}
      </div>`,
  });

  // ── Confirmation email to customer ──
  if (m.email) {
    await transporter.sendMail({
      from:    '"MrShine Car Detailing" <mrshinetoronto@gmail.com>',
      to:      m.email,
      subject: `Your MrShine Booking is Confirmed — ${dateStr}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#cc0000;">You're booked, ${m.fname}!</h2>
          <p style="color:#555;">Your booking is confirmed and payment received. Here's your summary:</p>
          ${bookingTable}
          ${m.notes ? `<p style="color:#555;font-size:13px;margin-top:12px;"><strong>Notes:</strong> ${m.notes}</p>` : ''}
          <p style="color:#555;font-size:13px;margin-top:20px;">Questions? Reply to this email or reach us at mrshinetoronto@gmail.com</p>
          <p style="color:#999;font-size:12px;">MrShine Car Wash &amp; Detailing · Toronto</p>
        </div>`,
    });
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    // Await emails before responding — serverless functions can terminate after res.json()
    let emailStatus = 'not_sent';
    try {
      await sendEmails(session.metadata, session.amount_total);
      emailStatus = 'sent';
      console.log('[EMAIL] Both confirmation emails sent successfully');
    } catch (emailErr) {
      console.error('[EMAIL FAILED]', emailErr.message);
      emailStatus = `failed: ${emailErr.message}`;
    }

    res.status(200).json({
      metadata:    session.metadata,
      amountTotal: session.amount_total,
      emailStatus,
    });
  } catch (err) {
    console.error('get-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
