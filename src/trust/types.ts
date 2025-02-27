import { UnixTime } from "../sd-jwt/types";
import { JWK } from "../utils/jwk";
import * as z from "zod";

export const TrustMark = z.object({ id: z.string(), trust_mark: z.string() });
export type TrustMark = z.infer<typeof TrustMark>;

const RelyingPartyMetadata = z.object({
  application_type: z.string().optional(),
  client_id: z.string().optional(),
  client_name: z.string().optional(),
  jwks: z.object({ keys: z.array(JWK) }),
  contacts: z.array(z.string()).optional(),
});

// Display metadata for a credential, used by the issuer to
// instruct the Wallet Solution on how to render the credential correctly
type CredentialDisplayMetadata = z.infer<typeof CredentialDisplayMetadata>;
const CredentialDisplayMetadata = z.object({
  name: z.string(),
  locale: z.string(),
});

// Metadata for displaying issuer information
type CredentialIssuerDisplayMetadata = z.infer<
  typeof CredentialIssuerDisplayMetadata
>;
const CredentialIssuerDisplayMetadata = z.object({
  name: z.string(),
  locale: z.string(),
});

type ClaimsMetadata = z.infer<typeof ClaimsMetadata>;
const ClaimsMetadata = z.record(
  z.object({
    value_type: z.string(),
    display: z.array(z.object({ name: z.string(), locale: z.string() })),
  })
);

type IssuanceErrorSupported = z.infer<typeof IssuanceErrorSupported>;
const IssuanceErrorSupported = z.object({
  display: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      locale: z.string(),
    })
  ),
});

// Metadata for a credential which is supported by an Issuer
type SupportedCredentialMetadata = z.infer<typeof SupportedCredentialMetadata>;
const SupportedCredentialMetadata = z.object({
  format: z.union([z.literal("vc+sd-jwt"), z.literal("vc+mdoc-cbor")]),
  scope: z.string(),
  display: z.array(CredentialDisplayMetadata),
  claims: ClaimsMetadata,
  cryptographic_binding_methods_supported: z.array(z.string()),
  credential_signing_alg_values_supported: z.array(z.string()),
  authentic_source: z.string().optional(),
  issuance_errors_supported: z.record(IssuanceErrorSupported).optional(),
});

export type EntityStatement = z.infer<typeof EntityStatement>;
export const EntityStatement = z.object({
  header: z.object({
    typ: z.literal("entity-statement+jwt"),
    alg: z.string(),
    kid: z.string(),
  }),
  payload: z.object({
    iss: z.string(),
    sub: z.string(),
    jwks: z.object({ keys: z.array(JWK) }),
    trust_marks: z.array(TrustMark).optional(),
    iat: z.number(),
    exp: z.number(),
  }),
});

export type EntityConfigurationHeader = z.infer<
  typeof EntityConfigurationHeader
>;
export const EntityConfigurationHeader = z.object({
  typ: z.literal("entity-statement+jwt"),
  alg: z.string(),
  kid: z.string(),
});

/**
 * @see https://openid.net/specs/openid-federation-1_0-41.html
 */
const FederationEntityMetadata = z
  .object({
    federation_fetch_endpoint: z.string().optional(),
    federation_list_endpoint: z.string().optional(),
    federation_resolve_endpoint: z.string().optional(),
    federation_trust_mark_status_endpoint: z.string().optional(),
    federation_trust_mark_list_endpoint: z.string().optional(),
    federation_trust_mark_endpoint: z.string().optional(),
    federation_historical_keys_endpoint: z.string().optional(),
    endpoint_auth_signing_alg_values_supported: z.string().optional(),
    organization_name: z.string().optional(),
    homepage_uri: z.string().optional(),
    policy_uri: z.string().optional(),
    logo_uri: z.string().optional(),
    contacts: z.array(z.string()).optional(),
  })
  .passthrough();

// Structure common to every Entity Configuration document
const BaseEntityConfiguration = z.object({
  header: EntityConfigurationHeader,
  payload: z
    .object({
      iss: z.string(),
      sub: z.string(),
      iat: UnixTime,
      exp: UnixTime,
      authority_hints: z.array(z.string()).optional(),
      metadata: z
        .object({
          federation_entity: FederationEntityMetadata,
        })
        .passthrough(),
      jwks: z.object({
        keys: z.array(JWK),
      }),
    })
    .passthrough(),
});

// Entity configuration for a Trust Anchor (it has no specific metadata section)
export type TrustAnchorEntityConfiguration = z.infer<
  typeof TrustAnchorEntityConfiguration
>;
export const TrustAnchorEntityConfiguration = BaseEntityConfiguration;

// Entity configuration for a Credential Issuer
export type CredentialIssuerEntityConfiguration = z.infer<
  typeof CredentialIssuerEntityConfiguration
>;
export const CredentialIssuerEntityConfiguration = BaseEntityConfiguration.and(
  z.object({
    payload: z.object({
      jwks: z.object({ keys: z.array(JWK) }),
      metadata: z.object({
        openid_credential_issuer: z.object({
          credential_issuer: z.string(),
          credential_endpoint: z.string(),
          revocation_endpoint: z.string(),
          status_attestation_endpoint: z.string(),
          display: z.array(CredentialIssuerDisplayMetadata),
          credential_configurations_supported: z.record(
            SupportedCredentialMetadata
          ),
          jwks: z.object({ keys: z.array(JWK) }),
        }),
        oauth_authorization_server: z.object({
          authorization_endpoint: z.string(),
          pushed_authorization_request_endpoint: z.string(),
          token_endpoint: z.string(),
          client_registration_types_supported: z.array(z.string()),
          code_challenge_methods_supported: z.array(z.string()),
          acr_values_supported: z.array(z.string()),
          grant_types_supported: z.array(z.string()),
          issuer: z.string(),
          jwks: z.object({ keys: z.array(JWK) }),
          scopes_supported: z.array(z.string()),
          response_modes_supported: z.array(z.string()),
          token_endpoint_auth_methods_supported: z.array(z.string()),
          token_endpoint_auth_signing_alg_values_supported: z.array(z.string()),
          request_object_signing_alg_values_supported: z.array(z.string()),
        }),
        /** Credential Issuers act as Relying Party
            when they require the presentation of other credentials.
            This does not apply for PID issuance, which requires CIE authz. */
        wallet_relying_party: RelyingPartyMetadata.optional(),
      }),
    }),
  })
);

// Entity configuration for a Relying Party
export type RelyingPartyEntityConfiguration = z.infer<
  typeof RelyingPartyEntityConfiguration
>;
export const RelyingPartyEntityConfiguration = BaseEntityConfiguration.and(
  z.object({
    payload: z.object({
      metadata: z.object({
        wallet_relying_party: RelyingPartyMetadata,
      }),
    }),
  })
);

// Entity configuration for a Wallet Provider
export type WalletProviderEntityConfiguration = z.infer<
  typeof WalletProviderEntityConfiguration
>;
export const WalletProviderEntityConfiguration = BaseEntityConfiguration.and(
  z.object({
    payload: z.object({
      metadata: z.object({
        wallet_provider: z
          .object({
            token_endpoint: z.string(),
            aal_values_supported: z.array(z.string()).optional(),
            grant_types_supported: z.array(z.string()),
            token_endpoint_auth_methods_supported: z.array(z.string()),
            token_endpoint_auth_signing_alg_values_supported: z.array(
              z.string()
            ),
            jwks: z.object({ keys: z.array(JWK) }),
          })
          .passthrough(),
      }),
    }),
  })
);

// Maps any entity configuration by the union of every possible shapes
export type EntityConfiguration = z.infer<typeof EntityConfiguration>;
export const EntityConfiguration = z.union(
  [
    WalletProviderEntityConfiguration,
    CredentialIssuerEntityConfiguration,
    TrustAnchorEntityConfiguration,
    RelyingPartyEntityConfiguration,
  ],
  {
    description: "Any kind of Entity Configuration allowed in the ecosystem",
  }
);
