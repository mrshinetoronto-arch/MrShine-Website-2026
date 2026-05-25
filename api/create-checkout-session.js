const Stripe = require('stripe');

const HST_RATE = 0.13;

const SERVICES = [
  { id: 'exterior-detail', name: 'Exterior Detail',  prices: { sedan: 79.99,  suv: 89.99,  large: 99.99  } },
  { id: 'interior-detail', name: 'Interior Detail',  prices: { sedan: 199.99, suv: 219.99, large: 239.99 } },
  { id: 'full-detail',     name: 'Full Detail',       prices: { sedan: 279.98, suv: 309.98, large: 339.98 } },
  { id: 'ceramic-coating', name: 'Ceramic Coating',   prices: { sedan: 599.99, suv: 699.99, large: 799.99 } },
];

const ADDONS = [
  { id: 'engine-bay',       price: 79.99  },
  { id: 'headlight',        price: 119.99 },
  { id: 'wax-buff',         prices: { sedan: 249.99, suv: 299.99, large: 349.99 } },
  { id: 'undercarriage',    price: 29.99  },
  { id: 'seat-restore',     price: 49.99  },
  { id: 'liquid-wax',       prices: { sedan: 54.99,  suv: 64.99,  large: 74.99  } },
  { id: 'odour',            price: 59.99  },
  { id: 'interior-polish',  prices: { sedan: 59.99,  suv: 69.99,  large: 79.99  } },
  { id: 'ceramic-wheels',   price: 199.99 },
  { id: 'ceramic-windows',  price: 199.99 },
];

const PET_HAIR_PRICES   = { sedan: 49.99, suv: 59.99, large: 69.99 };
const PET_HAIR_ELIGIBLE = new Set(['interior-detail', 'full-detail']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key not configured on server' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const {
    svcId, sz,
    addons   = [],
    petHair  = false,
    fname, lname, email, phone,
    date, time, location,
    vehicle, notes = '',
  } = req.body;

  const sv = SERVICES.find(s => s.id === svcId);
  if (!sv) return res.status(400).json({ error: 'Invalid service' });
  if (!['sedan', 'suv', 'large'].includes(sz)) return res.status(400).json({ error: 'Invalid size' });

  // Server-side price calculation (never trust the client for amounts)
  let total = sv.prices[sz];
  for (const addonId of addons) {
    const addon = ADDONS.find(a => a.id === addonId);
    if (!addon) continue;
    total += addon.prices ? addon.prices[sz] : addon.price;
  }
  if (petHair && PET_HAIR_ELIGIBLE.has(svcId)) {
    total += PET_HAIR_PRICES[sz];
  }

  const subtotal    = total;
  const hst         = Math.round(subtotal * HST_RATE * 100) / 100;
  const totalWithHst = subtotal + hst;
  const amountCents = Math.round(totalWithHst * 100);
  const origin   = req.headers.origin || `https://${req.headers.host}`;
  const BASE_URL = (origin.includes('localhost') || origin.includes('127.0.0.1'))
    ? origin
    : 'https://www.mrshinetoronto.com';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: sv.name,
          description: `${time} · ${location}`,
        },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${BASE_URL}/`,
    customer_email: email || undefined,
    metadata: {
      svcId,
      svcName:  sv.name,
      sz,
      addons:   addons.join(','),
      petHair:  String(petHair),
      fname:    fname  || '',
      lname:    lname  || '',
      email:    email  || '',
      phone:    phone  || '',
      date:     date   || '',
      time:     time   || '',
      location: location || '',
      vehicle:  vehicle  || '',
      notes:    (notes || '').slice(0, 400),
      subtotal: String(subtotal.toFixed(2)),
      hst:      String(hst.toFixed(2)),
      total:    String(totalWithHst.toFixed(2)),
    },
  });

  res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Checkout session error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
