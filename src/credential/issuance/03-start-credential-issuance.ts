import uuid from "react-native-uuid";
import { AuthorizationDetail, makeParRequest } from "../../utils/par";
import { SignJWT, type CryptoContext } from "@pagopa/io-react-native-jwt";
import {
  generateRandomAlphaNumericString,
  hasStatus,
  type Out,
} from "../../utils/misc";
import type { StartFlow } from "./01-start-flow";
import type { EvaluateIssuerTrust } from "./02-evaluate-issuer-trust";
import { ASSERTION_TYPE } from "./const";
import {
  WalletInstanceAttestation,
  type IdentificationContext,
} from "@pagopa/io-react-native-wallet";
import parseUrl from "parse-url";
import { IdentificationError, ValidationFailed } from "../../utils/errors";
import { IdentificationResultShape } from "../../utils/identification";
import { withEphemeralKey } from "../../utils/crypto";
import { createDPopToken } from "../../utils/dpop";
import { createPopToken } from "../../utils/pop";
import { CredentialResponse, TokenResponse } from "./types";

/**
 * Ensures that the credential type requested is supported by the issuer and contained in the
 * issuer configuration.
 * @param issuerConf The issuer configuration
 * @param credentialType The type of the credential to be requested
 * @returns The credential definition to be used in the request which includes the format and the type and its type
 */
const selectCredentialDefinition = (
  issuerConf: Out<EvaluateIssuerTrust>["issuerConf"],
  credentialType: Out<StartFlow>["credentialType"]
): AuthorizationDetail => {
  const credential_configurations_supported =
    issuerConf.openid_credential_issuer.credential_configurations_supported;

  const [result] = Object.keys(credential_configurations_supported)
    .filter((e) => e.includes(credentialType))
    .map((e) => ({
      credential_configuration_id: credentialType,
      format: credential_configurations_supported[e]!.format,
      type: "openid_credential" as const,
    }));

  if (!result) {
    throw new Error(`No credential support the type '${credentialType}'`);
  }
  return result;
};

/**
 * Ensures that the response mode requested is supported by the issuer and contained in the issuer configuration.
 * @param issuerConf The issuer configuration
 * @param credentialType The type of the credential to be requested
 * @returns The response mode to be used in the request, "query" for PersonIdentificationData and "form_post.jwt" for all other types.
 */
const selectResponseMode = (
  issuerConf: Out<EvaluateIssuerTrust>["issuerConf"],
  credentialType: Out<StartFlow>["credentialType"]
): string => {
  const responseModeSupported =
    issuerConf.oauth_authorization_server.response_modes_supported;

  const responseMode =
    credentialType === "PersonIdentificationData" ? "query" : "form_post.jwt";

  if (!responseModeSupported.includes(responseMode)) {
    throw new Error(`No response mode support the type '${credentialType}'`);
  }

  return responseMode;
};

export type StartCredentialIssuance = (
  issuerConf: Out<EvaluateIssuerTrust>["issuerConf"],
  credentialType: Out<StartFlow>["credentialType"],
  context: {
    wiaCryptoContext: CryptoContext;
    credentialCryptoContext: CryptoContext;
    identificationContext: IdentificationContext;
    walletInstanceAttestation: string;
    redirectUri: string;
    overrideRedirectUri?: string; // temporary parameter to override the redirect uri until we have an actual implementation
    idphint: string;
    appFetch?: GlobalFetch["fetch"];
  }
) => Promise<CredentialResponse>;

/**
 * Starts the credential issuance flow to obtain a credential from the issuer.
 * @param issuerConf The Issuer configuration
 * @param credentialType The type of the credential to be requested
 * @param context.wiaCryptoContext The context to access the key associated with the Wallet Instance Attestation
 * @param context.credentialCryptoContext The context to access the key to associat with credential
 * @param context.identificationContext The context to identify the user which will be used to start the authorization
 * @param context.walletInstanceAttestation The Wallet Instance Attestation token
 * @param context.redirectUri The internal URL to which to redirect has passed the in-app browser login phase
 * @param context.idphint Unique identifier of the SPID IDP
 * @param context.appFetch (optional) fetch api implementation. Default: built-in fetch
 * @throws {IdentificationError} When the response from the identification response is not parsable
 * @returns The credential obtained
 */

export const startCredentialIssuance: StartCredentialIssuance = async (
  issuerConf,
  credentialType,
  ctx
) => {
  const {
    wiaCryptoContext,
    credentialCryptoContext,
    identificationContext,
    walletInstanceAttestation,
    redirectUri,
    idphint,
    appFetch = fetch,
  } = ctx;

  /**
   * Creates and sends a PAR request to the /as/par endpoint of the authroization server.
   * This starts the authentication flow to obtain an access token.
   * This token enables the Wallet Instance to request a digital credential from the Credential Endpoint of the Credential Issuer.
   * This is an HTTP POST request containing the Wallet Instance identifier (client id), the code challenge and challenge method as specified by PKCE according to RFC 9126
   * along with the WTE and its proof of possession (WTE-PoP).
   * Additionally, it includes a request object, which is a signed JWT encapsulating the type of digital credential requested (authorization_details),
   * the application session identifier on the Wallet Instance side (state),
   * the method (query or form_post.jwt) by which the Authorization Server
   * should transmit the Authorization Response containing the authorization code issued upon the end user's authentication (response_mode)
   * to the Wallet Instance's Token Endpoint to obtain the Access Token, and the redirect_uri of the Wallet Instance where the Authorization Response
   * should be delivered. The redirect is achived by using a custom URL scheme that the Wallet Instance is registered to handle.
   */
  const clientId = await wiaCryptoContext.getPublicKey().then((_) => _.kid);

  // WARNING: This is not a secure way to generate a code verifier CHANGE ME
  const codeVerifier = generateRandomAlphaNumericString(64);
  const parEndpoint =
    issuerConf.oauth_authorization_server.pushed_authorization_request_endpoint;
  const parUrl = new URL(parEndpoint);
  const aud = `${parUrl.protocol}//${parUrl.hostname}`;
  const iss = WalletInstanceAttestation.decode(walletInstanceAttestation)
    .payload.cnf.jwk.kid;
  const credentialDefinition = selectCredentialDefinition(
    issuerConf,
    credentialType
  );
  const responseMode = selectResponseMode(issuerConf, credentialType);

  const getPar = makeParRequest({ wiaCryptoContext, appFetch });
  const issuerRequestUri = await getPar(
    clientId,
    codeVerifier,
    redirectUri,
    responseMode,
    parEndpoint,
    walletInstanceAttestation,
    [credentialDefinition],
    ASSERTION_TYPE
  );

  /**
   * Opens the in-app browser to start the authentication by performing a GET request to the /authorize endpoint of the authorization server.
   * The request includes the client_id, the request_uri, and the idphint which is the unique identifier of the IDP selected by the user.
   * The response is a redirect to the /login SP SAML or RP OIDC which handles the authentication.
   */
  const authzRequestEndpoint =
    issuerConf.oauth_authorization_server.authorization_endpoint;
  const params = new URLSearchParams({
    client_id: clientId,
    request_uri: issuerRequestUri,
    idphint,
  });
  const redirectSchema = new URL(redirectUri).protocol.replace(":", "");

  /**
   * The identification context catches the 302 redirect from the authorization server which contains the authorization response.
   * The response contains an authorization_code, state and iss in the query string which is then validated.
   */
  const identificationRedirectUrl = await identificationContext
    .identify(`${authzRequestEndpoint}?${params}`, redirectSchema)
    .catch((e) => {
      throw new IdentificationError(e.message);
    });

  const urlParse = parseUrl(identificationRedirectUrl);
  const authRes = IdentificationResultShape.safeParse(urlParse.query);
  if (!authRes.success) {
    throw new IdentificationError(authRes.error.message);
  }

  /**
   * Creates and sends the DPoP Proof JWT to be presented with the authorization code to the /token endpoint of the authorization server
   * for requesting the issuance of an access token bound to the public key of the Wallet Instance contained within the DPoP.
   * This enables the Wallet Instance to request a digital credential.
   * The DPoP Proof JWT is generated according to the section 4.3 of the DPoP RFC 9449 specification.
   */

  const { code } = authRes.data;
  const tokenUrl = issuerConf.oauth_authorization_server.token_endpoint;
  // Use an ephemeral key to be destroyed after use
  const tokenRequestSignedDPop = await withEphemeralKey(
    async (ephimeralContext) => {
      return await createDPopToken(
        {
          htm: "POST",
          htu: tokenUrl,
          jti: `${uuid.v4()}`,
        },
        ephimeralContext
      );
    }
  );

  const signedWiaPoP = await createPopToken(
    {
      jti: `${uuid.v4()}`,
      aud,
      iss,
    },
    wiaCryptoContext
  );

  const requestBody = {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_assertion_type: ASSERTION_TYPE,
    client_assertion: walletInstanceAttestation + "~" + signedWiaPoP,
  };

  const authorizationRequestFormBody = new URLSearchParams(requestBody);
  const tokenRes = await appFetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      DPoP: tokenRequestSignedDPop,
    },
    body: authorizationRequestFormBody.toString(),
  })
    .then(hasStatus(200))
    .then((res) => res.json())
    .then((body) => TokenResponse.safeParse(body));

  if (!tokenRes.success) {
    throw new ValidationFailed(tokenRes.error.message);
  }

  /**
   * Validates the token response and extracts the access token, c_nonce and c_nonce_expires_in.
   */
  const accessTokenResponse = tokenRes.data;
  const credentialUrl = issuerConf.openid_credential_issuer.credential_endpoint;

  /**
   * JWT proof token to bind the request nonce to the key that will bind the holder User with the Credential
   * This is presented along with the access token to the Credential Endpoint as proof of possession of the private key used to sign the Access Token.
   * @see https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-proof-types
   */
  const signedNonceProof = await createNonceProof(
    accessTokenResponse.c_nonce,
    clientId,
    credentialUrl,
    credentialCryptoContext
  );

  // Validation of accessTokenResponse.authorization_details if contain credentialDefinition
  const constainsCredentialDefinition =
    accessTokenResponse.authorization_details.some(
      (c) =>
        c.credential_configuration_id ===
          credentialDefinition.credential_configuration_id &&
        c.format === credentialDefinition.format &&
        c.type === credentialDefinition.type
    );

  if (!constainsCredentialDefinition) {
    throw new ValidationFailed(
      "The access token response does not contain the requested credential"
    );
  }

  /** The credential request body */
  const credentialRequestFormBody = {
    credential_definition: {
      type: [credentialDefinition.credential_configuration_id],
    },
    format: credentialDefinition.format,
    proof: {
      jwt: signedNonceProof,
      proof_type: "jwt",
    },
  };

  const credentialRes = await appFetch(credentialUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      DPoP: tokenRequestSignedDPop,
      Authorization: `${accessTokenResponse.token_type} ${accessTokenResponse.access_token}`,
    },
    body: JSON.stringify(credentialRequestFormBody),
  })
    .then(hasStatus(200))
    .then((res) => res.json())
    .then((body) => CredentialResponse.safeParse(body));

  if (!credentialRes.success) {
    throw new ValidationFailed(credentialRes.error.message);
  }

  return credentialRes.data;
};

export const createNonceProof = async (
  nonce: string,
  issuer: string,
  audience: string,
  ctx: CryptoContext
): Promise<string> => {
  const jwk = await ctx.getPublicKey();
  return new SignJWT(ctx)
    .setPayload({
      nonce,
    })
    .setProtectedHeader({
      typ: "openid4vci-proof+jwt",
      jwk,
    })
    .setAudience(audience)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign();
};
