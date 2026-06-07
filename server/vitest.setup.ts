// Runs before any test module is imported. Pins env vars so importing
// config/env.ts (which throws on missing JWT secrets) and pricing.ts
// (which reads delivery/tax env) is deterministic in CI, with or without .env.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.TAX_RATE ||= '0.07';
process.env.DELIVERY_BASE_FEE ||= '3.99';
process.env.DELIVERY_FEE_PER_KM ||= '1.00';
process.env.DELIVERY_FREE_KM ||= '3';
