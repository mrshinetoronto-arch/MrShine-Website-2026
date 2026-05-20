module.exports = (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  res.status(200).json({
    hasKey:  !!key,
    preview: key ? key.slice(0, 12) + '…' : null,
    nodeEnv: process.env.NODE_ENV || 'not set',
  });
};
