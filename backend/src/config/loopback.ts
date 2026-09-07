/**
 * Whether a request arrived over the container's own loopback interface, used to exempt the
 * Docker healthcheck from /health's throttle bucket. See throttling.ts for why.
 */

/** Node's dual-stack listener reports an IPv4 peer in the ::ffff: mapped form. */
const IPV4_MAPPED_PREFIX = '::ffff:'
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export interface RequestPeer {
  socket?: { remoteAddress?: string } | null
}

export const isLoopbackAddress = (raw: string): boolean => {
  // A zone index (fe80::1%eth0) never appears on loopback, but strip it rather than fail on a
  // form we did not expect.
  const address = raw.split('%')[0].toLowerCase()
  if (address === '::1') return true

  const candidate = address.startsWith(IPV4_MAPPED_PREFIX)
    ? address.slice(IPV4_MAPPED_PREFIX.length)
    : address
  const octets = IPV4.exec(candidate)
  if (!octets) return false
  const parts = octets.slice(1).map(Number)
  // The whole of 127.0.0.0/8 is loopback, not just 127.0.0.1.
  return parts.every(part => part <= 255) && parts[0] === 127
}

/**
 * Reads the socket rather than req.ip: `trust proxy` makes req.ip derive from X-Forwarded-For,
 * so a header could otherwise claim to be loopback. The kernel-reported TCP peer cannot.
 */
export const isLoopbackRequest = (req: RequestPeer | null | undefined): boolean => {
  const address = req?.socket?.remoteAddress
  return address ? isLoopbackAddress(address) : false
}
