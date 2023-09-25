import {
  sha256ToBase64,
  type CryptoContext,
  SignJWT,
  thumbprint,
} from "@pagopa/io-react-native-jwt";
import { JWK } from "../utils/jwk";
import uuid from "react-native-uuid";
import { PidIssuingError } from "../utils/errors";
import { createDPopToken } from "../utils/dpop";
import { CredentialIssuerEntityConfiguration } from "../trust/types";
import { generate, deleteKey } from "@pagopa/io-react-native-crypto";
import { SdJwt } from ".";
import { createCryptoContextFor } from "../utils/crypto";
// This is a temporary type that will be used for demo purposes only
export type CieData = {
  birthDate: string;
  fiscalCode: string;
  name: string;
  surname: string;
};

export type AuthorizationConf = {
  accessToken: string;
  nonce: string;
  clientId: string;
  authorizationCode: string;
  codeVerifier: string;
  walletProviderBaseUrl: string;
};

export type PidResponse = {
  credential: string;
  c_nonce: string;
  c_nonce_expires_in: number;
  format: string;
};

/**
 * Make a PAR request to the PID issuer and return the response url
 */
const getPar =
  ({
    wiaCryptoContext,
    appFetch = fetch,
  }: {
    wiaCryptoContext: CryptoContext;
    appFetch?: GlobalFetch["fetch"];
  }) =>
  async (
    clientId: string,
    codeVerifier: string,
    walletProviderBaseUrl: string,
    pidProviderEntityConfiguration: CredentialIssuerEntityConfiguration,
    walletInstanceAttestation: string
  ): Promise<string> => {
    // Calculate the thumbprint of the public key of the Wallet Instance Attestation.
    // The PAR request token is signed used the Wallet Instance Attestation key.
    // The signature can be verified by reading the public key from the key set shippet with the it will ship the Wallet Instance Attestation;
    //  key is matched by its kid, which is supposed to be the thumbprint of its public key.
    const keyThumbprint = await wiaCryptoContext
      .getPublicKey()
      .then(JWK.parse)
      .then(thumbprint);

    const codeChallenge = await sha256ToBase64(codeVerifier);

    const signedJwtForPar = await new SignJWT(wiaCryptoContext)
      .setProtectedHeader({
        kid: keyThumbprint,
      })
      .setPayload({
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        authorization_details: [
          {
            credentialDefinition: {
              type: ["eu.eudiw.pid.it"],
            },
            format: "vc+sd-jwt",
            type: "type",
          },
        ],
        response_type: "code",
        code_challenge_method: "s256",
        redirect_uri: walletProviderBaseUrl,
        state: `${uuid.v4()}`,
        client_id: clientId,
        code_challenge: codeChallenge,
      })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign();

    const parUrl =
      pidProviderEntityConfiguration.payload.metadata.openid_credential_issuer
        .pushed_authorization_request_endpoint;

    const requestBody = {
      response_type: "code",
      client_id: clientId,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: walletInstanceAttestation,
      request: signedJwtForPar,
    };

    var formBody = new URLSearchParams(requestBody);

    const response = await appFetch(parUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (response.status === 201) {
      const result = await response.json();
      return result.request_uri;
    }

    throw new PidIssuingError(
      `Unable to obtain PAR. Response code: ${await response.text()}`
    );
  };

/**
 * Start the issuing flow by generating an authorization request to the PID Provider. Obtain from the PID Provider an access token to be used to complete the issuing flow.
 *
 * @param params.wiaCryptoContext The key pair associated with the WIA. Will be use to prove the ownership of the attestation.
 * @param params.appFetch (optional) Http client
 * @param walletInstanceAttestation Wallet Instance Attestation token.
 * @param walletProviderBaseUrl Base url for the Wallet Provider
 * @param pidProviderEntityConfiguration The Entity Configuration of the PID Provider, from which discover public endooints.
 * @returns The access token along with the values that identify the issuing session.
 */
export const authorizeIssuing =
  ({
    wiaCryptoContext,
    appFetch = fetch,
  }: {
    wiaCryptoContext: CryptoContext;
    appFetch?: GlobalFetch["fetch"];
  }) =>
  async (
    walletInstanceAttestation: string,
    walletProviderBaseUrl: string,
    pidProviderEntityConfiguration: CredentialIssuerEntityConfiguration
  ): Promise<AuthorizationConf> => {
    // FIXME: do better
    const clientId = await wiaCryptoContext.getPublicKey().then((_) => _.kid);
    const codeVerifier = `${uuid.v4()}`;
    const authorizationCode = `${uuid.v4()}`;
    const tokenUrl =
      pidProviderEntityConfiguration.payload.metadata.openid_credential_issuer
        .token_endpoint;

    await getPar({ wiaCryptoContext, appFetch })(
      clientId,
      codeVerifier,
      walletProviderBaseUrl,
      pidProviderEntityConfiguration,
      walletInstanceAttestation
    );

    // Use an ephemeral key to be destroyed after use
    const keytag = `ephemeral-${uuid.v4()}`;
    await generate(keytag);
    const ephemeralContext = createCryptoContextFor(keytag);

    const signedDPop = await createDPopToken(
      {
        htm: "POST",
        htu: tokenUrl,
        jti: `${uuid.v4()}`,
      },
      ephemeralContext
    );

    await deleteKey(keytag);

    const requestBody = {
      grant_type: "authorization code",
      client_id: clientId,
      code: authorizationCode,
      code_verifier: codeVerifier,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: walletInstanceAttestation,
      redirect_uri: walletProviderBaseUrl,
    };
    var formBody = new URLSearchParams(requestBody);

    const response = await appFetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: signedDPop,
      },
      body: formBody.toString(),
    });

    if (response.status === 200) {
      const { c_nonce, access_token } = await response.json();
      return {
        accessToken: access_token,
        nonce: c_nonce,
        clientId,
        codeVerifier,
        authorizationCode,
        walletProviderBaseUrl,
      };
    }

    throw new PidIssuingError(
      `Unable to obtain token. Response code: ${await response.text()}`
    );
  };

/**
 * Return the signed jwt for nonce proof of possession
 */
const createNonceProof = async (
  nonce: string,
  issuer: string,
  audience: string,
  ctx: CryptoContext
): Promise<string> => {
  return new SignJWT(ctx)
    .setPayload({
      nonce,
    })
    .setProtectedHeader({
      type: "openid4vci-proof+jwt",
    })
    .setAudience(audience)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign();
};

/**
 * Complete the issuing flow and get the PID credential.
 *
 * @param params.pidCryptoContext The key pair associated with the PID. Will be use to prove the ownership of the credential.
 * @param params.appFetch (optional) Http client
 * @param authConf The authorization configuration retrieved with the access token
 * @param cieData Data red from the CIE login process
 * @returns The PID credential token
 */
export const getCredential =
  ({
    pidCryptoContext,
    appFetch = fetch,
  }: {
    pidCryptoContext: CryptoContext;
    appFetch?: GlobalFetch["fetch"];
  }) =>
  async (
    { nonce, accessToken, clientId, walletProviderBaseUrl }: AuthorizationConf,
    pidProviderEntityConfiguration: CredentialIssuerEntityConfiguration,
    cieData: CieData
  ): Promise<PidResponse> => {
    const signedDPopForPid = await createDPopToken(
      {
        htm: "POST",
        htu: pidProviderEntityConfiguration.payload.metadata
          .openid_credential_issuer.token_endpoint,
        jti: `${uuid.v4()}`,
      },
      pidCryptoContext
    );
    const signedNonceProof = await createNonceProof(
      nonce,
      clientId,
      walletProviderBaseUrl,
      pidCryptoContext
    );

    const credentialUrl =
      pidProviderEntityConfiguration.payload.metadata.openid_credential_issuer
        .credential_endpoint;

    const requestBody = {
      credential_definition: JSON.stringify({ type: ["eu.eudiw.pid.it"] }),
      format: "vc+sd-jwt",
      proof: JSON.stringify({
        jwt: signedNonceProof,
        cieData,
        proof_type: "jwt",
      }),
    };
    const formBody = new URLSearchParams(requestBody);

    const response = await appFetch(credentialUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: signedDPopForPid,
        Authorization: accessToken,
      },
      body: formBody.toString(),
    });

    if (response.status === 200) {
      const pidResponse = (await response.json()) as PidResponse;
      await validatePid(pidResponse.credential, pidCryptoContext);
      return pidResponse;
    }

    throw new PidIssuingError(
      `Unable to obtain credential! url=${credentialUrl} status=${
        response.status
      } body=${await response.text()}`
    );
  };

const validatePid = async (pidJwt: string, pidCryptoContext: CryptoContext) => {
  const decoded = SdJwt.decode(pidJwt);
  const pidKey = await pidCryptoContext.getPublicKey();
  const holderBindedKey = decoded.sdJwt.payload.cnf.jwk;

  if ((await thumbprint(pidKey)) !== (await thumbprint(holderBindedKey))) {
    throw new PidIssuingError(
      `The obtained pid does not seem to be valid according to your configuration. Your PID public key is: ${JSON.stringify(
        pidKey
      )} but PID holder binded key is: ${JSON.stringify(holderBindedKey)}`
    );
  }
};
