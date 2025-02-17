import { PresentationDefinition, RequestObject } from "./types";
import { RelyingPartyEntityConfiguration } from "../../trust/types";
import { hasStatusOrThrow } from "../../utils/misc";

export type FetchPresentationDefinition = (
  requestObject: RequestObject,
  context?: {
    appFetch?: GlobalFetch["fetch"];
  },
  rpConf?: RelyingPartyEntityConfiguration["payload"]["metadata"]
) => Promise<{
  presentationDefinition: PresentationDefinition;
}>;

/**
 * Retrieves a PresentationDefinition based on the given parameters.
 *
 * The method attempts the following strategies in order:
 * 1. Checks if `presentation_definition` is directly available in the request object.
 * 2. Fetches the `presentation_definition` from the URI provided in the relying party configuration.
 * 3. Uses a pre-configured `presentation_definition` from the relying party configuration if the `scope` is present in the request object.
 *
 * If none of the above conditions are met, the function throws an error indicating the definition could not be found.
 *
 * @param {RequestObject} requestObject - The request object containing the presentation definition or references to it.
 * @param {RelyingPartyEntityConfiguration["payload"]["metadata"]} [rpConf] - Optional relying party configuration.
 * @param {Object} [context] - Optional context for providing a custom fetch implementation.
 * @param {GlobalFetch["fetch"]} [context.appFetch] - Custom fetch function, defaults to global `fetch`.
 * @returns {Promise<{ presentationDefinition: PresentationDefinition }>} - Resolves with the presentation definition.
 * @throws {Error} - Throws if the presentation definition cannot be found or fetched.
 */
export const fetchPresentDefinition: FetchPresentationDefinition = async (
  requestObject,
  { appFetch = fetch } = {},
  rpConf
) => {
  // Check if `presentation_definition` is directly available in the request object
  if (requestObject.presentation_definition) {
    return {
      presentationDefinition: requestObject.presentation_definition,
    };
  }

  // Check if `presentation_definition_uri` is provided in the relying party configuration
  // TODO: still valid for 0.9.0?
  if (rpConf?.openid_credential_verifier?.presentation_definition_uri) {
    try {
      // Fetch the presentation definition from the provided URI
      const presentationDefinition = await appFetch(
        rpConf?.openid_credential_verifier.presentation_definition_uri,
        {
          method: "GET",
        }
      )
        .then(hasStatusOrThrow(200))
        .then((raw) => raw.json())
        .then((json) => PresentationDefinition.parse(json));

      return {
        presentationDefinition,
      };
    } catch (error) {
      throw new Error(`Failed to fetch presentation definition: ${error}`);
    }
  }

  // Check if `scope` is present in the request object and a pre-configured presentation definition exists
  if (
    requestObject.scope &&
    rpConf?.openid_credential_verifier?.presentation_definition
  ) {
    return {
      presentationDefinition:
        rpConf.openid_credential_verifier.presentation_definition,
    };
  }

  throw new Error("Presentation definition not found");
};
