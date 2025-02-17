import { JWK } from "../../../utils/jwk";
import * as z from "zod";

// Display metadata for a credential, used by the issuer to
// instruct the Wallet Solution on how to render the credential correctly
export type CredentialDisplay = z.infer<typeof CredentialDisplay>;
export const CredentialDisplay = z.object({
  name: z.string(),
  locale: z.string(),
  logo: z
    .object({
      url: z.string(),
      alt_text: z.string(),
    })
    .optional(),
  background_color: z.string().optional(),
  text_color: z.string().optional(),
});

export const CredentialClaimDisplay = z.object({
  name: z.string(),
  locale: z.string(),
});

export const CredentialFormat = z.union([
  z.literal("vc+sd-jwt"),
  z.literal("mso_mdoc"),
]);

export type CredentialSdJwtClaims = z.infer<typeof CredentialSdJwtClaims>;
export const CredentialSdJwtClaims = z.record(
  z.object({
    mandatory: z.boolean(),
    display: z.array(CredentialClaimDisplay),
  })
);

export type CredentialConfigurationSupported = z.infer<
  typeof CredentialConfigurationSupported
>;
export const CredentialConfigurationSupported = z.record(
  z.object({
    cryptographic_suites_supported: z.array(z.string()),
    vct: z.string().optional(),
    scope: z.string().optional(),
    cryptographic_binding_methods_supported: z.array(z.string()),
    display: z.array(CredentialDisplay),
    format: CredentialFormat,
    claims: z
      .union([
        CredentialSdJwtClaims,
        z.record(z.string(), CredentialSdJwtClaims),
      ])
      .optional(),
  })
);

export type CredentialIssuerKeys = z.infer<typeof CredentialIssuerKeys>;
export const CredentialIssuerKeys = z.object({
  keys: z.array(JWK),
});

export type CredentialIssuerConfiguration = z.infer<
  typeof CredentialIssuerConfiguration
>;
export const CredentialIssuerConfiguration = z.object({
  credential_configurations_supported: CredentialConfigurationSupported,
  pushed_authorization_request_endpoint: z.string(),
  dpop_signing_alg_values_supported: z.array(z.string()),
  jwks: CredentialIssuerKeys,
  credential_issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  credential_endpoint: z.string(),
});
