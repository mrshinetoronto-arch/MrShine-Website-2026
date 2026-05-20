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
  if (!process.env.GMAIL_PASS) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'mrshinetoronto@gmail.com',
      pass: process.env.GMAIL_PASS,
    },
  });

  const addons   = m.addons ? m.addons.split(',').filter(Boolean) : [];
  const addonStr = addons.map(id => ADDON_NAMES[id] || id).join(', ') || 'None';
  const dateStr  = formatDate(m.date);
  const total    = `$${(amountTotal / 100).toFixed(2)}`;
  const fullName = `${m.fname} ${m.lname}`.trim();

  const bookingTable = `
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:8px 0;color:#888;width:130px;">Service</td><td style="padding:8px 0;font-weight:600;">${m.svcName}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Vehicle Size</td><td style="padding:8px 0;">${SZ_LABELS[m.sz] || m.sz}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Vehicle</td><td style="padding:8px 0;">${m.vehicle || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Add-ons</td><td style="padding:8px 0;">${addonStr}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Location</td><td style="padding:8px 0;">${m.location}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Date</td><td style="padding:8px 0;">${dateStr}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Time</td><td style="padding:8px 0;">${m.time}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;">${m.phone || '—'}</td></tr>
      <tr style="border-top:2px solid #cc0000;">
        <td style="padding:12px 0;font-weight:700;color:#cc0000;">Total Paid</td>
        <td style="padding:12px 0;font-weight:700;font-size:18px;color:#cc0000;">${total}</td>
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
          <p style="color:#555;font-size:13px;margin-top:20px;">Questions? Reply to this email or reach us at mrshinetoronto@gmail.com</p>
          <p style="color:#999;font-size:12px;">MrShine Car Wash & Detailing · Toronto</p>
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

    // Send emails (non-blocking — don't fail the response if email fails)
    sendEmails(session.metadata, session.amount_total).catch(err =>
      console.error('Email error:', err.message)
    );

    res.status(200).json({
      metadata:    session.metadata,
      amountTotal: session.amount_total,
    });
  } catch (err) {
    console.error('get-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
