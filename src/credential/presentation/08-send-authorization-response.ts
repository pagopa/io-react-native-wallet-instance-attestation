import {
  EncryptJwe,
  SignJWT,
  sha256ToBase64,
} from "@pagopa/io-react-native-jwt";
import uuid from "react-native-uuid";
import type { FetchJwks } from "./04-retrieve-rp-jwks";
import type { VerifyRequestObjectSignature } from "./05-verify-request-object";
import type { JWK } from "@pagopa/io-react-native-jwt/lib/typescript/types";
import { NoSuitableKeysFoundInEntityConfiguration } from "./errors";
import { hasStatusOrThrow, type Out } from "../../utils/misc";
import { decode, disclose } from "../../sd-jwt";
import { PresentationDefinition, type Presentation } from "./types";
import * as z from "zod";

export type AuthorizationResponse = z.infer<typeof AuthorizationResponse>;
export const AuthorizationResponse = z.object({
  status: z.string().optional(),
  response_code: z
    .string() /**
      FIXME: [SIW-627] we expect this value from every RP implementation
      Actually some RP does not return the value
      We make it optional to not break the flow.
    */
    .optional(),
  redirect_uri: z.string().optional(),
});

/**
 * Selects an RSA public key (with `use = enc` and `kty = RSA`) from the set of JWK keys
 * offered by the Relying Party (RP) for encryption.
 *
 * @param rpJwkKeys - The array of JWKs retrieved from the RP entity configuration.
 * @returns The first suitable RSA public key found in the list.
 * @throws {NoSuitableKeysFoundInEntityConfiguration} If no suitable RSA encryption key is found.
 */
export const chooseRSAPublicKeyToEncrypt = (
  rpJwkKeys: Out<FetchJwks>["keys"]
): JWK => {
  const [rsaEncKey] = rpJwkKeys.filter(
    (jwk) => jwk.use === "enc" && jwk.kty === "RSA"
  );

  if (rsaEncKey) {
    return rsaEncKey;
  }

  // No suitable key found
  throw new NoSuitableKeysFoundInEntityConfiguration(
    "No suitable RSA public key found for encryption."
  );
};

/**
 * Prepares a Verified Presentation (VP) token to be sent as part of an
 * authorization response in an OpenID 4 Verifiable Presentations flow.
 *
 * @param requestObject - The request object containing the nonce, response URI, and other necessary info.
 * @param presentationTuple - A tuple containing a verifiable credential, the claims to disclose,
 *                            and a cryptographic context for signing.
 * @returns An object containing the signed VP token (`vp_token`) and a `presentation_submission` object.
 * @param presentationDefinition - Definition outlining presentation requirements.
 * @param presentationTuple - Tuple containing:
 *    - A verifiable credential.
 *    - Claims that should be disclosed.
 *    - Cryptographic context for signing.
 * @returns An object with:
 *    - `vp_token`: The signed VP token.
 *    - `presentation_submission`: Object mapping disclosed credentials to the request.
 *
 * @remarks
 *  1. The `disclose()` function is used to produce a token with only the requested claims.
 *  2. A new JWT is then signed, including the VP, `jti`, `iss`, `nonce`, audience, and expiration.
 *  3. The `presentation_submission` object follows the OpenID 4 VP specification for describing
 *     how the disclosed credentials map to the request.
 *
 * @todo [SIW-353] Support multiple verifiable credentials in a single request.
 */
export const prepareVpToken = async (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  presentationDefinition: PresentationDefinition,
  [verifiableCredential, requestedClaims, cryptoContext]: Presentation
): Promise<{
  vp_token: string;
  presentation_submission: Record<string, unknown>;
}> => {
  // Produce a VP token with only requested claims from the verifiable credential
  const { token: vp } = await disclose(verifiableCredential, requestedClaims);

  // <Issuer-signed JWT>~<Disclosure 1>~<Disclosure N>~
  const sd_hash = await sha256ToBase64(`${vp}~`);

  const kbJwt = await new SignJWT(cryptoContext)
    .setProtectedHeader({
      typ: "kb+jwt",
      alg: "ES256",
    })
    .setPayload({
      sd_hash,
      nonce: requestObject.nonce,
    })
    .setAudience(requestObject.client_id)
    .setIssuedAt()
    .sign();

  // <Issuer-signed JWT>~<Disclosure 1>~...~<Disclosure N>~<KB-JWT>
  const vp_token = [vp, kbJwt].join("~");

  // Determine the descriptor ID to use for mapping. Fallback to first input descriptor ID if not specified
  // We support only one credential for now, so we get first input_descriptor and create just one descriptor_map
  const presentation_submission = {
    id: uuid.v4(),
    definition_id: presentationDefinition.id,
    descriptor_map: [
      {
        id: presentationDefinition?.input_descriptors[0]?.id,
        path: `$`,
        format: "vc+sd-jwt",
      },
    ],
  };

  return { vp_token, presentation_submission };
};

/**
 * Builds a URL-encoded form body for a direct POST response without encryption.
 *
 * @param requestObject - Contains state, nonce, and other relevant info.
 * @param vpToken - The signed VP token to include.
 * @param presentationSubmission - Object mapping credential disclosures.
 * @returns A URL-encoded string suitable for an `application/x-www-form-urlencoded` POST body.
 */
export const buildDirectPostBody = async (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  vpToken: string,
  presentationSubmission: Record<string, unknown>
): Promise<string> => {
  const formUrlEncodedBody = new URLSearchParams({
    state: requestObject.state,
    presentation_submission: JSON.stringify(presentationSubmission),
    vp_token: vpToken,
  });

  return formUrlEncodedBody.toString();
};

/**
 * Builds a URL-encoded form body for a direct POST response using JWT encryption.
 *
 * @param jwkKeys - Array of JWKs from the Relying Party for encryption.
 * @param requestObject - Contains state, nonce, and other relevant info.
 * @param vpToken - The signed VP token to encrypt.
 * @param presentationSubmission - Object mapping credential disclosures.
 * @returns A URL-encoded string for an `application/x-www-form-urlencoded` POST body,
 *          where `response` contains the encrypted JWE.
 */
export const buildDirectPostJwtBody = async (
  jwkKeys: Out<FetchJwks>["keys"],
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  vpToken: string,
  presentationSubmission: Record<string, unknown>
): Promise<string> => {
  // Prepare the authorization response payload to be encrypted
  const authzResponsePayload = JSON.stringify({
    state: requestObject.state,
    presentation_submission: presentationSubmission,
    vp_token: vpToken,
  });

  // Choose a suitable RSA public key for encryption
  const rsaPublicJwk = chooseRSAPublicKeyToEncrypt(jwkKeys);

  // Encrypt the authorization payload
  const encryptedResponse = await new EncryptJwe(authzResponsePayload, {
    alg: "RSA-OAEP-256",
    enc: "A256CBC-HS512",
    kid: rsaPublicJwk.kid,
  }).encrypt(rsaPublicJwk);

  // Build the x-www-form-urlencoded form body
  const formBody = new URLSearchParams({ response: encryptedResponse });
  return formBody.toString();
};

/**
 * Type definition for the function that sends the authorization response
 * to the Relying Party, completing the presentation flow.
 */
export type SendAuthorizationResponse = (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  presentationDefinition: PresentationDefinition,
  jwkKeys: Out<FetchJwks>["keys"],
  presentation: Presentation, // TODO: [SIW-353] support multiple presentations
  context?: {
    appFetch?: GlobalFetch["fetch"];
  }
) => Promise<AuthorizationResponse>;

/**
 * Sends the authorization response to the Relying Party (RP) using the specified `response_mode`.
 * This function completes the presentation flow in an OpenID 4 Verifiable Presentations scenario.
 *
 * @param requestObject - The request details, including presentation requirements.
 * @param presentationDefinition - The definition of the expected presentation.
 * @param jwkKeys - Array of JWKs from the Relying Party for optional encryption.
 * @param presentation - Tuple with verifiable credential, claims, and crypto context.
 * @param context - Contains optional custom fetch implementation.
 * @returns Parsed and validated authorization response from the Relying Party.
 */
export const sendAuthorizationResponse: SendAuthorizationResponse = async (
  requestObject,
  presentationDefinition,
  jwkKeys,
  presentation,
  { appFetch = fetch } = {}
): Promise<AuthorizationResponse> => {
  // 1. Create the VP token and associated submission mapping
  const { vp_token, presentation_submission } = await prepareVpToken(
    requestObject,
    presentationDefinition,
    presentation
  );

  // 2. Choose the appropriate request body builder based on response mode
  const requestBody = await buildDirectPostJwtBody(
    jwkKeys,
    requestObject,
    vp_token,
    presentation_submission
  );

  // 3. Send the authorization response via HTTP POST and validate the response
  return await appFetch(requestObject.response_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody,
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.json())
    .then(AuthorizationResponse.parse);
};

// TODO: refactor to make it more modular
export const sendDcqlAuthorizationResponse = async (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  presentation: Presentation, // TODO: [SIW-353] support multiple presentations
  context: {
    jwkKeys: Out<FetchJwks>["keys"];
    walletInstanceAttestation: string;
    appFetch?: GlobalFetch["fetch"];
  }
) => {
  const { jwkKeys, walletInstanceAttestation, appFetch = fetch } = context;
  const [verifiableCredential, requestedClaims, cryptoContext] = presentation;

  // 1. Create the VP token
  const { token: vp } = await disclose(verifiableCredential, requestedClaims);

  // <Issuer-signed JWT>~<Disclosure 1>~<Disclosure N>~
  const sd_hash = await sha256ToBase64(`${vp}~`);

  const kbJwt = await new SignJWT(cryptoContext)
    .setProtectedHeader({
      typ: "kb+jwt",
      alg: "ES256",
    })
    .setPayload({
      sd_hash,
      nonce: requestObject.nonce,
    })
    .setAudience(requestObject.client_id)
    .setIssuedAt()
    .sign();

  // <Issuer-signed JWT>~<Disclosure 1>~...~<Disclosure N>~<KB-JWT>
  const vp_token = [vp, kbJwt].join("~");
  const { sdJwt } = decode(verifiableCredential);

  const authzResponsePayload = JSON.stringify({
    state: requestObject.state,
    vp_token: {
      [sdJwt.payload.vct]: vp_token,
      walletInstanceAttestation,
    },
  });

  // Choose a suitable RSA public key for encryption
  const rsaPublicJwk = chooseRSAPublicKeyToEncrypt(jwkKeys);

  // Encrypt the authorization payload
  const encryptedResponse = await new EncryptJwe(authzResponsePayload, {
    alg: "RSA-OAEP-256",
    enc: "A256CBC-HS512",
    kid: rsaPublicJwk.kid,
  }).encrypt(rsaPublicJwk);

  // Build the x-www-form-urlencoded form body
  const formBody = new URLSearchParams({ response: encryptedResponse });

  return await appFetch(requestObject.response_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.json())
    .then(AuthorizationResponse.parse);
};
