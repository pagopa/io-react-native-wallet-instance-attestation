import { decode as decodeJwt, verify } from "@pagopa/io-react-native-jwt";
import {
  CredentialIssuerEntityConfiguration,
  EntityConfiguration,
  EntityStatement,
  RelyingPartyEntityConfiguration,
  TrustAnchorEntityConfiguration,
  WalletProviderEntityConfiguration,
} from "./types";
import { renewTrustChain, validateTrustChain } from "./chain";
import { hasStatusOrThrow } from "../utils/misc";
import { IoWalletError } from "../utils/errors";
import type { JWK } from "@pagopa/io-react-native-jwt/lib/typescript/types";

export type {
  WalletProviderEntityConfiguration,
  TrustAnchorEntityConfiguration,
  CredentialIssuerEntityConfiguration,
  RelyingPartyEntityConfiguration,
  EntityConfiguration,
  EntityStatement,
};

/**
 * Verify a given trust chain is actually valid.
 * It can handle fast chain renewal, which means we try to fetch a fresh version of each statement.
 *
 * @param trustAnchorEntity The entity configuration of the known trust anchor
 * @param chain The chain of statements to be validated
 * @param renewOnFail Whether to renew the provided chain if the validation fails at first. Default: true
 * @param appFetch Fetch api implementation. Default: the built-in implementation
 * @returns The result of the chain validation
 * @throws {IoWalletError} When either validation or renewal fail
 */
export async function verifyTrustChain(
  trustAnchorEntity: TrustAnchorEntityConfiguration,
  chain: string[],
  {
    appFetch = fetch,
    renewOnFail = true,
  }: { appFetch?: GlobalFetch["fetch"]; renewOnFail?: boolean } = {}
): Promise<ReturnType<typeof validateTrustChain>> {
  try {
    return validateTrustChain(trustAnchorEntity, chain);
  } catch (error) {
    if (renewOnFail) {
      const renewedChain = await renewTrustChain(chain, appFetch);
      return validateTrustChain(trustAnchorEntity, renewedChain);
    } else {
      throw error;
    }
  }
}

/**
 * Fetch the signed entity configuration token for an entity
 *
 * @param entityBaseUrl The url of the entity to fetch
 * @param appFetch (optional) fetch api implementation
 * @returns The signed Entity Configuration token
 */
export async function getSignedEntityConfiguration(
  entityBaseUrl: string,
  {
    appFetch = fetch,
  }: {
    appFetch?: GlobalFetch["fetch"];
  } = {}
): Promise<string> {
  const wellKnownUrl = `${entityBaseUrl}/.well-known/openid-federation`;

  return await appFetch(wellKnownUrl, {
    method: "GET",
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.text());
}

/**
 * Fetch and parse the entity configuration document for a given federation entity.
 * This is an inner method to serve public interfaces.
 *
 * To add another entity configuration type (example: Foo entity type):
 *  - create its zod schema and type by inherit from the base type (example: FooEntityConfiguration = BaseEntityConfiguration.and(...))
 *  - add such type to EntityConfiguration union
 *  - add an overload to this function
 *  - create a public function which use such type (example: getFooEntityConfiguration = (url, options) => Promise<FooEntityConfiguration>)
 *
 * @param entityBaseUrl The base url of the entity.
 * @param schema The expected schema of the entity configuration, according to the kind of entity we are fetching from.
 * @param options An optional object with additional options.
 * @param options.appFetch An optional instance of the http client to be used.
 * @returns The parsed entity configuration object
 * @throws {IoWalletError} If the http request fails
 * @throws Parse error if the document is not in the expected shape.
 */
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: typeof WalletProviderEntityConfiguration,
  options?: {
    appFetch?: GlobalFetch["fetch"];
  }
): Promise<WalletProviderEntityConfiguration>;
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: typeof RelyingPartyEntityConfiguration,
  options?: {
    appFetch?: GlobalFetch["fetch"];
  }
): Promise<RelyingPartyEntityConfiguration>;
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: typeof TrustAnchorEntityConfiguration,
  options?: {
    appFetch?: GlobalFetch["fetch"];
  }
): Promise<TrustAnchorEntityConfiguration>;
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: typeof CredentialIssuerEntityConfiguration,
  options?: {
    appFetch?: GlobalFetch["fetch"];
  }
): Promise<CredentialIssuerEntityConfiguration>;
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: typeof EntityConfiguration,
  options?: {
    appFetch?: GlobalFetch["fetch"];
  }
): Promise<EntityConfiguration>;
async function fetchAndParseEntityConfiguration(
  entityBaseUrl: string,
  schema: /* FIXME: why is it different from "typeof EntityConfiguration"? */
  | typeof CredentialIssuerEntityConfiguration
    | typeof WalletProviderEntityConfiguration
    | typeof RelyingPartyEntityConfiguration
    | typeof TrustAnchorEntityConfiguration
    | typeof EntityConfiguration,
  {
    appFetch = fetch,
  }: {
    appFetch?: GlobalFetch["fetch"];
  } = {}
) {
  const responseText = await getSignedEntityConfiguration(entityBaseUrl, {
    appFetch,
  });

  const responseJwt = decodeJwt(responseText);
  return schema.parse({
    header: responseJwt.protectedHeader,
    payload: responseJwt.payload,
  });
}

export const getWalletProviderEntityConfiguration = (
  entityBaseUrl: Parameters<typeof fetchAndParseEntityConfiguration>[0],
  options?: Parameters<typeof fetchAndParseEntityConfiguration>[2]
) =>
  fetchAndParseEntityConfiguration(
    entityBaseUrl,
    WalletProviderEntityConfiguration,
    options
  );

export const getCredentialIssuerEntityConfiguration = (
  entityBaseUrl: Parameters<typeof fetchAndParseEntityConfiguration>[0],
  options?: Parameters<typeof fetchAndParseEntityConfiguration>[2]
) =>
  fetchAndParseEntityConfiguration(
    entityBaseUrl,
    CredentialIssuerEntityConfiguration,
    options
  );

export const getTrustAnchorEntityConfiguration = (
  entityBaseUrl: Parameters<typeof fetchAndParseEntityConfiguration>[0],
  options?: Parameters<typeof fetchAndParseEntityConfiguration>[2]
) =>
  fetchAndParseEntityConfiguration(
    entityBaseUrl,
    TrustAnchorEntityConfiguration,
    options
  );

export const getRelyingPartyEntityConfiguration = (
  entityBaseUrl: Parameters<typeof fetchAndParseEntityConfiguration>[0],
  options?: Parameters<typeof fetchAndParseEntityConfiguration>[2]
) =>
  fetchAndParseEntityConfiguration(
    entityBaseUrl,
    RelyingPartyEntityConfiguration,
    options
  );

export const getEntityConfiguration = (
  entityBaseUrl: Parameters<typeof fetchAndParseEntityConfiguration>[0],
  options?: Parameters<typeof fetchAndParseEntityConfiguration>[2]
) =>
  fetchAndParseEntityConfiguration(entityBaseUrl, EntityConfiguration, options);

/**
 * Fetch and parse the entity statement document for a given federation entity.
 *
 * @param accreditationBodyBaseUrl The base url of the accreditation body which holds and signs the required entity statement
 * @param subordinatedEntityBaseUrl The url that identifies the subordinate entity
 * @param appFetch An optional instance of the http client to be used.
 * @returns The parsed entity configuration object
 * @throws {IoWalletError} If the http request fails
 * @throws Parse error if the document is not in the expected shape.
 */
export async function getEntityStatement(
  accreditationBodyBaseUrl: string,
  subordinatedEntityBaseUrl: string,
  {
    appFetch = fetch,
  }: {
    appFetch?: GlobalFetch["fetch"];
  } = {}
) {
  const responseText = await getSignedEntityStatement(
    accreditationBodyBaseUrl,
    subordinatedEntityBaseUrl,
    {
      appFetch,
    }
  );

  const responseJwt = decodeJwt(responseText);
  return EntityStatement.parse({
    header: responseJwt.protectedHeader,
    payload: responseJwt.payload,
  });
}

/**
 * Fetch the entity statement document for a given federation entity.
 *
 * @param accreditationBodyBaseUrl The base url of the accreditation body which holds and signs the required entity statement
 * @param subordinatedEntityBaseUrl The url that identifies the subordinate entity
 * @param appFetch An optional instance of the http client to be used.
 * @returns The signed entity statement token
 * @throws {IoWalletError} If the http request fails
 */
export async function getSignedEntityStatement(
  accreditationBodyBaseUrl: string,
  subordinatedEntityBaseUrl: string,
  {
    appFetch = fetch,
  }: {
    appFetch?: GlobalFetch["fetch"];
  } = {}
) {
  const url = `${accreditationBodyBaseUrl}/fetch?${new URLSearchParams({
    sub: subordinatedEntityBaseUrl,
  })}`;

  return await appFetch(url, {
    method: "GET",
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.text());
}

/**
 * Fetch the federation list document from a given endpoint.
 *
 * @param federationListEndpoint The URL of the federation list endpoint.
 * @param appFetch An optional instance of the http client to be used.
 * @returns The federation list as an array of strings.
 * @throws {IoWalletError} If the HTTP request fails or the response cannot be parsed.
 */
export async function getFederationList(
  federationListEndpoint: string,
  {
    appFetch = fetch,
  }: {
    appFetch?: GlobalFetch["fetch"];
  } = {}
): Promise<string[]> {
  return await appFetch(federationListEndpoint, {
    method: "GET",
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.text())
    .then((text) => {
      try {
        return JSON.parse(text) as string[];
      } catch (err) {
        throw new IoWalletError(
          "Invalid federation list format received from Trust Anchor."
        );
      }
    });
}

/**
 * Build a not-verified trust chain for a given Relying Party (RP) entity.
 *
 * @param relyingPartyEntityBaseUrl The base URL of the RP entity
 * @param taPubKey The public key of the Trust Anchor (TA) entity
 * @param appFetch (optional) fetch api implementation
 * @returns A list of signed tokens that represent the trust chain, in the order of the chain (from the RP to the Trust Anchor)
 * @throws {IoWalletError} When an element of the chain fails to parse
 * The result of this function can be used to validate the trust chain with {@link verifyTrustChain}
 */
export async function buildTrustChain(
  relyingPartyEntityBaseUrl: string,
  taPubKey: JWK,
  appFetch: GlobalFetch["fetch"] = fetch
): Promise<string[]> {
  const trustChain: string[] = [];

  // 1. Fetch and validate the Relying Party's Entity Configuration (EC)
  let currentEntityJwt = await getSignedEntityConfiguration(
    relyingPartyEntityBaseUrl,
    { appFetch }
  );
  trustChain.push(currentEntityJwt);
  let currentEntityConfig = EntityConfiguration.parse(
    decodeJwt(currentEntityJwt)
  );

  // 2. Build the chain while the current entity is subordinate (i.e. has authority hints)
  while (currentEntityConfig.payload.authority_hints?.length) {
    // Use the first authority hint as the parent's base URL.
    const parentEntityBaseUrl = currentEntityConfig.payload.authority_hints[0]!;

    // Fetch and validate the parent's Entity Configuration (EC)
    const parentEntityJwt = await getSignedEntityConfiguration(
      parentEntityBaseUrl,
      { appFetch }
    );
    const parentEntityConfig = EntityConfiguration.parse(
      decodeJwt(parentEntityJwt)
    );

    // Ensure the parent's configuration provides the federation_fetch_endpoint.
    const federationFetchEndpoint =
      parentEntityConfig.payload.metadata.federation_entity
        .federation_fetch_endpoint;
    if (!federationFetchEndpoint) {
      throw new IoWalletError(
        "Missing federation_fetch_endpoint in parent's configuration."
      );
    }

    // Fetch and validate the Entity Statement (ES) for the subordinate entity.
    const entityStatementJwt = await getSignedEntityStatement(
      parentEntityBaseUrl,
      currentEntityConfig.payload.sub,
      { appFetch }
    );
    EntityStatement.parse(decodeJwt(entityStatementJwt)); // Validate the ES; throws if invalid.

    // Append the ES and then the parent's EC to the trust chain.
    trustChain.push(entityStatementJwt);
    trustChain.push(parentEntityJwt);

    // Move up the chain: the parent becomes the new current entity.
    currentEntityJwt = parentEntityJwt;
    currentEntityConfig = parentEntityConfig;
  }

  // 3. At this point, currentEntityConfig represents the Trust Anchor.
  // Verify that the Trust Anchor's EC is signed with the stored TA key.
  const { protectedHeader } = decodeJwt(currentEntityJwt);
  if (protectedHeader.kid !== taPubKey.kid) {
    throw new IoWalletError(
      "Trust Anchor EC not signed with expected TA key (kid mismatch)."
    );
  }
  verify(currentEntityJwt, taPubKey).catch(() => {
    throw new IoWalletError("Trust Anchor EC signature verification failed.");
  });

  // If a federation_list_endpoint is provided, fetch and verify the federation list.
  const federationListEndpoint =
    currentEntityConfig.payload.metadata.federation_entity
      .federation_list_endpoint;
  if (federationListEndpoint) {
    const federationList = await getFederationList(federationListEndpoint, {
      appFetch,
    });
    if (!federationList.includes(relyingPartyEntityBaseUrl)) {
      throw new IoWalletError(
        "Relying Party entity base URL is not authorized by the Trust Anchor's federation list."
      );
    }
  }

  return trustChain;
}
