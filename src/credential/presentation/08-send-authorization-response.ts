import { EncryptJwe } from "@pagopa/io-react-native-jwt";
import uuid from "react-native-uuid";
import type { FetchJwks } from "./04-retrieve-rp-jwks";
import type { VerifyRequestObjectSignature } from "./05-verify-request-object";
import { NoSuitableKeysFoundInEntityConfiguration } from "./errors";
import { hasStatusOrThrow, type Out } from "../../utils/misc";
import {
  DirectAuthorizationBodyPayload,
  ErrorResponse,
  type RemotePresentation,
} from "./types";
import * as z from "zod";
import type { JWK } from "../../utils/jwk";

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
 * Selects a public key (with `use = enc`) from the set of JWK keys
 * offered by the Relying Party (RP) for encryption.
 *
 * @param rpJwkKeys - The array of JWKs retrieved from the RP entity configuration.
 * @returns The first suitable public key found in the list.
 * @throws {NoSuitableKeysFoundInEntityConfiguration} If no suitable encryption key is found.
 */
export const choosePublicKeyToEncrypt = (
  rpJwkKeys: Out<FetchJwks>["keys"]
): JWK => {
  const [encKey] = rpJwkKeys.filter((jwk) => jwk.use === "enc");

  if (encKey) {
    return encKey;
  }

  // No suitable key found
  throw new NoSuitableKeysFoundInEntityConfiguration(
    "No suitable public key found for encryption."
  );
};

/**
 * Builds a URL-encoded form body for a direct POST response without encryption.
 *
 * @param requestObject - Contains state, nonce, and other relevant info.
 * @param payload - Object that contains either the VP token to encrypt and the stringified mapping of the credential disclosures or the error code
 * @returns A URL-encoded string suitable for an `application/x-www-form-urlencoded` POST body.
 */
export const buildDirectPostBody = async (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  payload: DirectAuthorizationBodyPayload
): Promise<string> => {
  const formUrlEncodedBody = new URLSearchParams({
    ...(requestObject.state ? { state: requestObject.state } : {}),
    ...Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        return [
          key,
          Array.isArray(value) || typeof value === "object"
            ? JSON.stringify(value)
            : value,
        ];
      })
    ),
  });

  return formUrlEncodedBody.toString();
};

/**
 * Builds a URL-encoded form body for a direct POST response using JWT encryption.
 *
 * @param jwkKeys - Array of JWKs from the Relying Party for encryption.
 * @param requestObject - Contains state, nonce, and other relevant info.
 * @param payload - Object that contains either the VP token to encrypt and the mapping of the credential disclosures or the error code
 * @returns A URL-encoded string for an `application/x-www-form-urlencoded` POST body,
 *          where `response` contains the encrypted JWE.
 */
export const buildDirectPostJwtBody = async (
  jwkKeys: Out<FetchJwks>["keys"],
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  payload: DirectAuthorizationBodyPayload
): Promise<string> => {
  // Prepare the authorization response payload to be encrypted
  const authzResponsePayload = JSON.stringify({
    state: requestObject.state,
    ...payload,
  });

  // Choose a suitable RSA public key for encryption
  const encPublicJwk = choosePublicKeyToEncrypt(jwkKeys);

  // Encrypt the authorization payload
  const { client_metadata } = requestObject;
  const encryptedResponse = await new EncryptJwe(authzResponsePayload, {
    alg:
      (client_metadata?.authorization_encrypted_response_alg as
        | "RSA-OAEP-256"
        | "RSA-OAEP") || "RSA-OAEP-256",
    enc:
      (client_metadata?.authorization_encrypted_response_enc as
        | "A256CBC-HS512"
        | "A128CBC-HS256") || "A256CBC-HS512",
    kid: encPublicJwk.kid,
  }).encrypt(encPublicJwk);

  // Build the x-www-form-urlencoded form body
  const formBody = new URLSearchParams({
    response: encryptedResponse,
    ...(requestObject.state ? { state: requestObject.state } : {}),
  });
  return formBody.toString();
};

/**
 * Type definition for the function that sends the authorization response
 * to the Relying Party, completing the presentation flow.
 */
export type SendAuthorizationResponse = (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  presentationDefinitionId: string,
  jwkKeys: Out<FetchJwks>["keys"],
  remotePresentations: RemotePresentation[],
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
  presentationDefinitionId,
  jwkKeys,
  remotePresentations,
  { appFetch = fetch } = {}
): Promise<AuthorizationResponse> => {
  /**
   * 1. Prepare the VP token and presentation submission
   * If there is only one credential, `vpToken` is a single string.
   * If there are multiple credential, `vpToken` is an array of string.
   **/
  const vp_token =
    remotePresentations?.length === 1
      ? remotePresentations[0]?.vpToken
      : remotePresentations.map(
          (remotePresentation) => remotePresentation.vpToken
        );

  const descriptor_map = remotePresentations.map(
    (remotePresentation, index) => ({
      id: remotePresentation.inputDescriptor.id,
      path: remotePresentations.length === 1 ? `$` : `$[${index}]`,
      format: remotePresentation.format,
    })
  );

  const presentation_submission = {
    id: uuid.v4(),
    definition_id: presentationDefinitionId,
    descriptor_map,
  };

  // 2. Choose the appropriate request body builder based on response mode
  const requestBody =
    requestObject.response_mode === "direct_post.jwt"
      ? await buildDirectPostJwtBody(jwkKeys, requestObject, {
          vp_token,
          presentation_submission,
        })
      : await buildDirectPostBody(requestObject, {
          vp_token,
          presentation_submission: presentation_submission,
        });

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

/**
 * Type definition for the function that sends the authorization response
 * to the Relying Party, completing the presentation flow.
 */
export type SendAuthorizationErrorResponse = (
  requestObject: Out<VerifyRequestObjectSignature>["requestObject"],
  error: ErrorResponse,
  jwkKeys: Out<FetchJwks>["keys"],
  context?: {
    appFetch?: GlobalFetch["fetch"];
  }
) => Promise<AuthorizationResponse>;

/**
 * Sends the authorization error response to the Relying Party (RP) using the specified `response_mode`.
 * This function completes the presentation flow in an OpenID 4 Verifiable Presentations scenario.
 *
 * @param requestObject - The request details, including presentation requirements.
 * @param error - The response error value
 * @param jwkKeys - Array of JWKs from the Relying Party for optional encryption.
 * @param context - Contains optional custom fetch implementation.
 * @returns Parsed and validated authorization response from the Relying Party.
 */
export const sendAuthorizationErrorResponse: SendAuthorizationErrorResponse =
  async (
    requestObject,
    error,
    jwkKeys,
    { appFetch = fetch } = {}
  ): Promise<AuthorizationResponse> => {
    // 2. Choose the appropriate request body builder based on response mode
    const requestBody =
      requestObject.response_mode === "direct_post.jwt"
        ? await buildDirectPostJwtBody(jwkKeys, requestObject, { error })
        : await buildDirectPostBody(requestObject, { error });
    // 3. Send the authorization error response via HTTP POST and validate the response
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
