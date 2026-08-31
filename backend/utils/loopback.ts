// Whether a request arrived over the container's own loopback interface, used to exempt the
// Docker healthcheck from /health's rate limit — see backend.ts.
//
// Kept away from Express so it can be unit tested — see loopback.spec.ts.

// Read from the socket rather than req.ip: `trust proxy` makes req.ip derive from
// X-Forwarded-For, so a header could otherwise claim to be loopback. The socket peer cannot.
// Node's dual-stack listener reports IPv4 peers in the ::ffff: mapped form.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface RequestWithSocket {
  socket?: { remoteAddress?: string } | null
}

export const isLoopbackRequest = (req: RequestWithSocket): boolean => {
  const address = req.socket?.remoteAddress;
  if (!address) return false;
  // A zone index (fe80::1%eth0) never appears on loopback, but strip it rather than fail closed
  // on a form we did not expect.
  return LOOPBACK_ADDRESSES.has(address.split('%')[0].toLowerCase());
};
