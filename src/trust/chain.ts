import {
  decode as decodeJwt,
  verify as verifyJwt,
} from "@pagopa/io-react-native-jwt";
import {
  EntityConfiguration,
  EntityStatement,
  TrustAnchorEntityConfiguration,
} from "./types";
import { JWK } from "../utils/jwk";
import { IoWalletError } from "../utils/errors";
import * as z from "zod";
import type { JWTDecodeResult } from "@pagopa/io-react-native-jwt/lib/typescript/types";
import { getSignedEntityConfiguration, getSignedEntityStatement } from ".";

type ParsedToken = {
  header: JWTDecodeResult["protectedHeader"];
  payload: JWTDecodeResult["payload"];
};

// Verify a token signature
// The kid is extracted from the token header
const verify = async (
  token: string,
  kid: string,
  jwks: JWK[]
): Promise<ParsedToken> => {
  const jwk = jwks.find((k) => k.kid === kid);
  if (!jwk) {
    throw new Error(`Invalid kid: ${kid}, token: ${token}`);
  }
  const { protectedHeader: header, payload } = await verifyJwt(token, jwk);
  return { header, payload };
};

const decode = (token: string) => {
  const { protectedHeader: header, payload } = decodeJwt(token);
  return { header, payload };
};

// The first element of the chain is supposed to be the Entity Configuration for the document issuer
const FirstElementShape = EntityConfiguration;
// Each element but the first is supposed to be an Entity Statement
const MiddleElementShape = EntityStatement;
// The last element of the chain can either be an Entity Statement
//  or the Entity Configuration for the known Trust Anchor
const LastElementShape = z.union([
  EntityStatement,
  TrustAnchorEntityConfiguration,
]);

/**
 * Validates a provided trust chain against a known trust
 *
 * @param trustAnchorEntity The entity configuration of the known trust anchor
 * @param chain The chain of statements to be validated
 * @returns The list of parsed token representing the chain
 * @throws {IoWalletError} If the chain is not valid
 */
export async function validateTrustChain(
  trustAnchorEntity: TrustAnchorEntityConfiguration,
  chain: string[]
): Promise<ParsedToken[]> {
  // If the chain is empty, fail
  if (chain.length === 0) {
    throw new IoWalletError("Cannot verify empty trust chain");
  }

  // Select the expected token shape
  const selectTokenShape = (elementIndex: number) =>
    elementIndex === 0
      ? FirstElementShape
      : elementIndex === chain.length - 1
      ? LastElementShape
      : MiddleElementShape;

  // select the kid from the current index
  const selectKid = (currentIndex: number): string => {
    const token = chain[currentIndex];
    if (!token) {
      throw new IoWalletError(`Cannot select kid: empty token`);
    }
    const shape = selectTokenShape(currentIndex);
    return shape.parse(decode(token)).header.kid;
  };

  // select keys from the next token
  // if the current token is the last, keys from trust anchor will be used
  const selectKeys = (currentIndex: number): JWK[] => {
    if (currentIndex === chain.length - 1) {
      return trustAnchorEntity.payload.jwks.keys;
    }

    const nextIndex = currentIndex + 1;
    const nextToken = chain[nextIndex];
    if (!nextToken) {
      throw new IoWalletError(`Cannot select keys: empty nextToken`);
    }
    const shape = selectTokenShape(nextIndex);
    return shape.parse(decode(nextToken)).payload.jwks.keys;
  };

  // Iterate the chain and validate each element's signature against the public keys of its next
  // If there is no next, hence it's the end of the chain, and it must be verified by the Trust Anchor
  return Promise.all(
    chain
      .map((token, i) => [token, selectKid(i), selectKeys(i)] as const)
      .map((args) => verify(...args))
  );
}

/**
 * Given a trust chain, obtain a new trust chain by fetching each element's fresh version
 *
 * @param chain The original chain
 * @param appFetch (optional) fetch api implementation
 * @returns A list of signed token that represent the trust chain, in the same order of the provided chain
 * @throws IoWalletError When an element of the chain fails to parse
 */
export function renewTrustChain(
  chain: string[],
  appFetch: GlobalFetch["fetch"] = fetch
) {
  return Promise.all(
    chain
      // Decode each item to determine its shape
      .map(decode)
      .map(
        (e) =>
          [
            EntityStatement.safeParse(e),
            EntityConfiguration.safeParse(e),
          ] as const
      )
      // fetch the element according to its shape
      .map(([es, ec], i) =>
        ec.success
          ? getSignedEntityConfiguration(ec.data.payload.iss, { appFetch })
          : es.success
          ? getSignedEntityStatement(es.data.payload.iss, es.data.payload.sub, {
              appFetch,
            })
          : // if the element fail to parse in both EntityStatement and EntityConfiguration, raise an error
            Promise.reject(
              new IoWalletError(
                `Cannot renew trust chain because the element #${i} failed to be parsed.`
              )
            )
      )
  );
}
