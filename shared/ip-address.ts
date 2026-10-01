/**
 * IP-address classification shared by the server (server/_core/safeHttp.ts)
 * and the admin form validation (shared/integrations.ts). Pure string work --
 * no node:net, so the browser bundle can import it.
 */

/** True for every IPv4/IPv6 address that is not a public unicast address. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    return octets.some(octet => octet > 255) ? true : isPrivateV4(octets);
  }
  if (ip.includes(":")) return isPrivateV6(ip);
  return true; // not an IP at all: refuse rather than guess
}

function isPrivateV4([a, b, c]: number[]): boolean {
  return a === 0 // "this" network
    || a === 10
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || a === 127
    || (a === 169 && b === 254) // link-local + cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2)) // 192.0.0.0/24 IETF, 192.0.2.0/24 TEST-NET-1
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)) // benchmarking
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224; // multicast, reserved, broadcast
}

function expandV6(ip: string): number[] | null {
  let text = ip;
  // Trailing dotted quad (::ffff:1.2.3.4) -> two hex groups.
  const dotted = text.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const parts = dotted[2].split(".").map(Number);
    if (parts.some(part => part > 255)) return null;
    text = `${dotted[1]}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map(group => parseInt(group, 16));
  return groups.length === 8 && groups.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

function isPrivateV6(ip: string): boolean {
  const groups = expandV6(ip);
  if (!groups) return true;
  const embedded = () => isPrivateV4([groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255]);
  const firstFiveZero = groups.slice(0, 5).every(group => group === 0);
  if (firstFiveZero && groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) return true; // :: and ::1
  if (firstFiveZero && groups[5] === 0xffff) return embedded(); // IPv4-mapped
  if (firstFiveZero && groups[5] === 0) return embedded(); // deprecated IPv4-compatible ::a.b.c.d
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)) return embedded(); // NAT64
  if (groups[0] === 0x2002) return isPrivateV4([groups[1] >> 8, groups[1] & 255, groups[2] >> 8, groups[2] & 255]); // 6to4
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xff00) === 0xff00) return true; // multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  return false;
}
