import {
  type CryptoContext,
  decode as decodeJwt,
} from "@pagopa/io-react-native-jwt";
import { verify as verifyJwt } from "@pagopa/io-react-native-jwt";
import { SignJWT, thumbprint } from "@pagopa/io-react-native-jwt";
import { JWK, fixBase64EncodingOnKey } from "../utils/jwk";
import { WalletInstanceAttestationRequestJwt } from "./types";
import uuid from "react-native-uuid";
import { WalletInstanceAttestationIssuingError } from "../utils/errors";
import type { WalletProviderEntityConfiguration } from "../trust/types";

async function getAttestationRequest(
  wiaCryptoContext: CryptoContext,
  walletProviderEntityConfiguration: WalletProviderEntityConfiguration
): Promise<string> {
  const jwk = await wiaCryptoContext.getPublicKey();
  const parsedJwk = JWK.parse(jwk);
  const keyThumbprint = await thumbprint(parsedJwk);
  const publicKey = { ...parsedJwk, kid: keyThumbprint };

  return new SignJWT(wiaCryptoContext)
    .setPayload({
      iss: keyThumbprint,
      aud: walletProviderEntityConfiguration.payload.iss,
      jti: `${uuid.v4()}`,
      nonce: `${uuid.v4()}`,
      cnf: {
        jwk: fixBase64EncodingOnKey(publicKey),
      },
    })
    .setProtectedHeader({
      kid: publicKey.kid,
      typ: "wiar+jwt",
    })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign();
}

/**
 * Request a Wallet Instance Attestation (WIA) to the Wallet provider
 *
 * @param params.wiaCryptoContext The key pair associated with the WIA. Will be use to prove the ownership of the attestation.
 * @param params.appFetch (optional) Http client
 * @param walletProviderBaseUrl Base url for the Wallet Provider
 * @returns The retrieved Wallet Instance Attestation token
 */
export const getAttestation =
  ({
    wiaCryptoContext,
    appFetch = fetch,
  }: {
    wiaCryptoContext: CryptoContext;
    appFetch?: GlobalFetch["fetch"];
  }) =>
  async (
    walletProviderEntityConfiguration: WalletProviderEntityConfiguration
  ): Promise<string> => {
    const signedAttestationRequest = await getAttestationRequest(
      wiaCryptoContext,
      walletProviderEntityConfiguration
    );

    const decodedRequest = decodeJwt(signedAttestationRequest);
    const parsedRequest = WalletInstanceAttestationRequestJwt.parse({
      payload: decodedRequest.payload,
      header: decodedRequest.protectedHeader,
    });
    const publicKey = parsedRequest.payload.cnf.jwk;

    await verifyJwt(signedAttestationRequest, publicKey);

    const tokenUrl =
      walletProviderEntityConfiguration.payload.metadata.wallet_provider
        .token_endpoint;
    const requestBody = {
      grant_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-client-attestation",
      assertion: signedAttestationRequest,
    };
    const response = await appFetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 201) {
      return await response.text();
    }

    throw new WalletInstanceAttestationIssuingError(
      "Unable to obtain wallet instance attestation from wallet provider",
      `Response code: ${response.status}`
    );
  };
