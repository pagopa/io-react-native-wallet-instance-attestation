import {
  Credential,
  createCryptoContextFor,
} from "@pagopa/io-react-native-wallet";
import uuid from "react-native-uuid";
import { generate } from "@pagopa/io-react-native-crypto";
import appFetch from "../utils/fetch";
import { DPOP_KEYTAG, regenerateCryptoKey } from "../utils/crypto";
import type { CryptoContext } from "@pagopa/io-react-native-jwt";
import type {
  CredentialResult,
  SupportedCredentialsWithoutPid,
} from "../store/types";
import {
  openAuthenticationSession,
  supportsInAppBrowser,
} from "@pagopa/io-react-native-login-utils";

/**
 * Implements a flow to obtain a generic credential.
 * @param credentialIssuerUrl - The credential issuer URL
 * @param redirectUri - The redirect URI for the authorization flow
 * @param credentialType - The type of the credential to obtain, which must be `urn:eu.europa.ec.eudi:pid:1`
 * @param walletInstanceAttestation - The Wallet Instance Attestation
 * @param wiaCryptoContext - The Wallet Instance Attestation crypto context
 * @param pid - The PID credential
 * @param pidCryptoContext - The PID credential crypto context
 * @returns The obtained credential result
 */
export const getCredential = async ({
  credentialIssuerUrl,
  redirectUri,
  credentialType,
  walletInstanceAttestation,
  wiaCryptoContext,
  pid,
  pidCryptoContext,
}: {
  credentialIssuerUrl: string;
  redirectUri: string;
  credentialType: SupportedCredentialsWithoutPid;
  walletInstanceAttestation: string;
  wiaCryptoContext: CryptoContext;
  pid: string;
  pidCryptoContext: CryptoContext;
}): Promise<CredentialResult> => {
  // Create credential crypto context
  const credentialKeyTag = uuid.v4().toString();
  await generate(credentialKeyTag);
  const credentialCryptoContext = createCryptoContextFor(credentialKeyTag);

  // Start the issuance flow
  const startFlow: Credential.Issuance.StartFlow = () => ({
    issuerUrl: credentialIssuerUrl,
    credentialType,
  });

  const { issuerUrl } = startFlow();

  // Evaluate issuer trust
  const { issuerConf } = await Credential.Issuance.getIssuerConfig(issuerUrl);

  // Start user authorization
  const { issuerRequestUri, clientId, codeVerifier, credentialDefinition } =
    await Credential.Issuance.startUserAuthorization(
      issuerConf,
      credentialType,
      {
        walletInstanceAttestation,
        redirectUri,
        wiaCryptoContext,
        appFetch,
      }
    );

  /**
   * Temporary comments to permit issuing of mDL without PID presentation
   * Replace with block code below which redirects to the issuer's authorization URL
   * FIXME: [WLEO-267]
   **/

  // const requestObject =
  //   await Credential.Issuance.getRequestedCredentialToBePresented(
  //     issuerRequestUri,
  //     clientId,
  //     issuerConf,
  //     appFetch
  //   );

  // The app here should ask the user to confirm the required data contained in the requestObject

  // Complete the user authorization via form_post.jwt mode
  // const { code } =
  //   await Credential.Issuance.completeUserAuthorizationWithFormPostJwtMode(
  //     requestObject,
  //     { wiaCryptoContext, pidCryptoContext, pid, walletInstanceAttestation }
  //   );
  // Start user authorization

  if (!pid || !pidCryptoContext) {
    throw new Error("PID must not be empty!");
  }

  // Obtain the Authorization URL
  const { authUrl } = await Credential.Issuance.buildAuthorizationUrl(
    issuerRequestUri,
    clientId,
    issuerConf
  );

  const supportsCustomTabs = await supportsInAppBrowser();
  if (!supportsCustomTabs) {
    throw new Error("Custom tabs are not supported");
  }

  const baseRedirectUri = new URL(redirectUri).protocol.replace(":", "");

  // Open the authorization URL in the custom tab
  const authRedirectUrl = await openAuthenticationSession(
    authUrl,
    baseRedirectUri
  );

  const { code } =
    await Credential.Issuance.completeUserAuthorizationWithQueryMode(
      authRedirectUrl
    );
  /* End of temporary block code */

  // Generate the DPoP context which will be used for the whole issuance flow
  await regenerateCryptoKey(DPOP_KEYTAG);
  const dPopCryptoContext = createCryptoContextFor(DPOP_KEYTAG);

  const { accessToken } = await Credential.Issuance.authorizeAccess(
    issuerConf,
    code,
    clientId,
    redirectUri,
    codeVerifier,
    {
      walletInstanceAttestation,
      wiaCryptoContext,
      dPopCryptoContext,
      appFetch,
    }
  );

  // Obtain the credential
  const { credential, format } = await Credential.Issuance.obtainCredential(
    issuerConf,
    accessToken,
    clientId,
    credentialDefinition,
    {
      credentialCryptoContext,
      dPopCryptoContext,
      appFetch,
    }
  );

  // Parse and verify the credential. The ignoreMissingAttributes flag must be set to false or omitted in production.
  const { parsedCredential } =
    await Credential.Issuance.verifyAndParseCredential(
      issuerConf,
      credential,
      format,
      { credentialCryptoContext, ignoreMissingAttributes: true }
    );

  return {
    parsedCredential,
    credential,
    keyTag: credentialKeyTag,
    credentialType,
  };
};
