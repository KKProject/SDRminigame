function originAllowed(req, allowedOrigins) {
  if (!allowedOrigins || !allowedOrigins.length) return true;
  const origin = req && req.headers ? (req.headers.origin || '') : '';
  if (!origin) return true;
  return allowedOrigins.indexOf(origin) >= 0;
}

module.exports = {
  originAllowed,
};
