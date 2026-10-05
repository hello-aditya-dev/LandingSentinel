/**
 * Minimal typing shim for ipaddr.js (untyped CommonJS dependency).
 * Only the surface used by url-safety is declared.
 */

declare module "ipaddr.js" {
  export interface IpAddress {
    kind(): "ipv4" | "ipv6";
    toNormalizedString(): string;
    /** True when this address falls inside the given network. */
    match(other: IpAddress | [string, number]): boolean;
    /** For IPv4-mapped IPv6 addresses, returns the embedded IPv4 address. */
    toIPv4Address?(): IpAddress;
    /** Named range classification (e.g. "private", "loopback"). */
    range?(): string;
  }

  export function parse(addr: string): IpAddress;
  export function process(addr: string): IpAddress;
  export function isValid(addr: string): boolean;

  export const IPv4: {
    parse(addr: string): IpAddress;
    isValid(addr: string): boolean;
  };
  export const IPv6: {
    parse(addr: string): IpAddress;
    isValid(addr: string): boolean;
  };
}
