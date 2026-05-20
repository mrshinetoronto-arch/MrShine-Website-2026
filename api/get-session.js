const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (session.payment_status !== 'paid') {
    return res.status(402).json({ error: 'Payment not completed' });
  }

  res.status(200).json({
    metadata:    session.metadata,
    amountTotal: session.amount_total,
  });
};
