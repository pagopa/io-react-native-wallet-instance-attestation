import { JWKS, JWK } from "../../utils/jwk";
import { hasStatusOrThrow } from "../../utils/misc";
import { RelyingPartyEntityConfiguration } from "../../trust/types";
import { decode as decodeJwt } from "@pagopa/io-react-native-jwt";
import { NoSuitableKeysFoundInEntityConfiguration } from "./errors";

/**
 * Defines the signature for a function that retrieves JSON Web Key Sets (JWKS) from a client.
 *
 * @template T - The tuple type representing the function arguments.
 * @param args - The arguments passed to the function.
 * @returns A promise resolving to an object containing an array of JWKs.
 */
export type FetchJwks<T extends Array<unknown> = []> = (...args: T) => Promise<{
  keys: JWK[];
}>;

/**
 * Retrieves the JSON Web Key Set (JWKS) from the specified client's well-known endpoint.
 * It is formed using `{issUrl.base}/.well-known/jar-issuer${issUrl.pah}` as explained in SD-JWT VC issuer metadata section
 *
 * @param requestObjectEncodedJwt - Request Object in JWT format.
 * @param options - Optional context containing a custom fetch implementation.
 * @param options.context - Optional context object.
 * @param options.context.appFetch - Optional custom fetch function to use instead of the global `fetch`.
 * @returns A promise resolving to an object containing an array of JWKs.
 * @throws Will throw an error if the JWKS retrieval fails.
 */
export const fetchJwksFromRequestObject: FetchJwks<
  [string, { context?: { appFetch?: GlobalFetch["fetch"] } }]
> = async (requestObjectEncodedJwt, { context = {} } = {}) => {
  const { appFetch = fetch } = context;
  const requestObjectJwt = decodeJwt(requestObjectEncodedJwt);

  // 1. check if request object jwt contains the 'jwk' attribute
  if (requestObjectJwt.protectedHeader?.jwk) {
    return {
      keys: [JWK.parse(requestObjectJwt.protectedHeader.jwk)],
    };
  }

  // 2. According to Potential profile, retrieve from RP endpoint using iss claim
  const issClaimValue = requestObjectJwt.payload?.iss as string;
  if (issClaimValue) {
    const issUrl = new URL(issClaimValue);
    const wellKnownUrl = new URL(
      `/.well-known/jar-issuer${issUrl.pathname}`,
      `${issUrl.protocol}//${issUrl.host}`
    ).toString();

    // Fetches the JWKS from a specific endpoint of the entity's well-known configuration
    const jwks = await appFetch(wellKnownUrl, {
      method: "GET",
    })
      .then(hasStatusOrThrow(200))
      .then((raw) => raw.json())
      .then((json) => JWKS.parse(json.jwks));

    return {
      keys: jwks.keys,
    };
  }

  throw new NoSuitableKeysFoundInEntityConfiguration(
    "Request Object signature verification"
  );
};

/**
 * Retrieves the JSON Web Key Set (JWKS) from a Relying Party's entity configuration.
 *
 * @param rpConfig - The configuration object of the Relying Party entity.
 * @returns An object containing an array of JWKs.
 * @throws Will throw an error if the configuration is invalid or if JWKS is not found.
 */
export const fetchJwksFromConfig: FetchJwks<
  [RelyingPartyEntityConfiguration["payload"]["metadata"]]
> = async (rpConfig) => {
  const jwks = rpConfig.openid_credential_verifier.jwks;

  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error("JWKS not found in Relying Party configuration.");
  }

  return {
    keys: jwks.keys,
  };
};
