const Stripe = require('stripe');

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Fetch up to 100 most recent sessions; Stripe returns newest first
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });

    const bookings = sessions.data
      .filter(s => s.payment_status === 'paid' && s.metadata && s.metadata.svcId)
      .map(s => {
        const m        = s.metadata;
        const addons   = m.addons ? m.addons.split(',').filter(Boolean) : [];
        const totalAmt = s.amount_total / 100;
        const subtotal = m.subtotal ? parseFloat(m.subtotal) : Math.round(totalAmt / 1.13 * 100) / 100;
        const hst      = m.hst      ? parseFloat(m.hst)      : Math.round((totalAmt - subtotal) * 100) / 100;

        let svcLabel = m.svcName || '';
        const extrasCount = addons.length + (m.petHair === 'true' ? 1 : 0);
        if (extrasCount > 0) svcLabel += ` + ${extrasCount} add-on${extrasCount > 1 ? 's' : ''}`;

        return {
          id:        s.id,
          svcId:     m.svcId,
          svcName:   m.svcName,
          svcLabel,
          sz:        m.sz,
          addons,
          addonNames: addons.map(id => ADDON_NAMES[id] || id),
          petHair:   m.petHair === 'true',
          fname:     m.fname || '',
          lname:     m.lname || '',
          email:     m.email || '',
          phone:     m.phone || '',
          date:      m.date  || '',
          time:      m.time  || '',
          location:  m.location || '',
          vehicle:   m.vehicle  || '',
          notes:     m.notes    || '',
          subtotal,
          hst,
          total:     totalAmt,
          createdAt: new Date(s.created * 1000).toISOString(),
        };
      });

    res.status(200).json({ bookings });
  } catch (err) {
    console.error('Bookings error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
