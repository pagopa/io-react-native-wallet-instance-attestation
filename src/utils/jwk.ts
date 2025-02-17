import { removePadding } from "@pagopa/io-react-native-jwt";
import { z } from "zod";

export type JWK = z.infer<typeof JWK>;
export const JWK = z.object({
  /** JWK "alg" (Algorithm) Parameter. */
  alg: z.string().optional(),
  crv: z.string().optional(),
  d: z.string().optional(),
  dp: z.string().optional(),
  dq: z.string().optional(),
  e: z.string().optional(),
  /** JWK "ext" (Extractable) Parameter. */
  ext: z.boolean().optional(),
  k: z.string().optional(),
  /** JWK "key_ops" (Key Operations) Parameter. */
  key_ops: z.array(z.string()).optional(),
  /** JWK "kid" (Key ID) Parameter. */
  kid: z.string().optional(),
  /** JWK "kty" (Key Type) Parameter.
   * This attribute is required to discriminate the
   * type of EC/RSA algorithm */
  kty: z.union([z.literal("RSA"), z.literal("EC")]),
  n: z.string().optional(),
  p: z.string().optional(),
  q: z.string().optional(),
  qi: z.string().optional(),
  /** JWK "use" (Public Key Use) Parameter. */
  use: z.string().optional(),
  x: z.string().optional(),
  y: z.string().optional(),
  /** JWK "x5c" (X.509 Certificate Chain) Parameter. */
  x5c: z.array(z.string()).optional(),
  /** JWK "x5t" (X.509 Certificate SHA-1 Thumbprint) Parameter. */
  x5t: z.string().optional(),
  /** "x5t#S256" (X.509 Certificate SHA-256 Thumbprint) Parameter. */
  "x5t#S256": z.string().optional(),
  /** JWK "x5u" (X.509 URL) Parameter. */
  x5u: z.string().optional(),
});

/**
 * Ensure key values are encoded using base64url and not just base64, as defined in https://datatracker.ietf.org/doc/html/rfc7517
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7517
 *
 * @param key The key to fix
 * @returns THe same input key with fixed values
 */
export function fixBase64EncodingOnKey(key: JWK): JWK {
  const { x, y, e, n, ...pk } = key;

  return {
    ...pk,
    ...(x ? { x: removePadding(x) } : {}),
    ...(y ? { y: removePadding(y) } : {}),
    ...(e ? { e: removePadding(e) } : {}),
    ...(n ? { n: removePadding(n) } : {}),
  };
}

export type JWKS = z.infer<typeof JWKS>;
export const JWKS = z.object({
  keys: z.array(JWK),
});
