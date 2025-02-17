import type { CryptoContext } from "@pagopa/io-react-native-jwt";
import { UnixTime } from "../../sd-jwt/types";
import * as z from "zod";

/**
 * A pair that associate a tokenized Verified Credential with the claims presented or requested to present.
 */
export type Presentation = [
  /* verified credential token */ string,
  /* claims */ string[],
  /* the context for the key associated to the credential */ CryptoContext
];

const Fields = z.object({
  path: z.array(z.string().min(1)), // Array of JSONPath string expressions
  id: z.string().optional(), // Unique string ID
  purpose: z.string().optional(), // Purpose of the field
  name: z.string().optional(), // Human-friendly name
  filter: z.any().optional(), // JSON Schema descriptor for filtering
  optional: z.boolean().optional(), // Boolean indicating if the field is optional
  intent_to_retain: z.boolean().optional(), // Boolean indicating that the Verifier intends to retain the Claim's data being requested
});

// Define the Constraints Object Schema
const Constraints = z.object({
  fields: z.array(Fields).optional(), // Array of Field Objects
  limit_disclosure: z.enum(["required", "preferred"]).optional(), // Limit disclosure property
});

// Define the Input Descriptor Object Schema
export type InputDescriptor = z.infer<typeof InputDescriptor>;
export const InputDescriptor = z.object({
  id: z.string().min(1), // Mandatory unique string ID
  name: z.string().optional(), // Human-friendly name
  purpose: z.string().optional(), // Purpose of the schema
  format: z.record(z.string(), z.any()).optional(), // Object with Claim Format Designations
  constraints: Constraints, // Constraints Object (mandatory)
  group: z.string().optional(), // Match one of the grouping strings listed in the "from" values of a Submission Requirement Rule
});

const SubmissionRequirement = z.object({
  name: z.string().optional(),
  purpose: z.string().optional(),
  rule: z.string(), // "all": all group's rules must be present, or "pick": at least group's "count" rules must be present
  from: z.string().optional(), // MUST contain either a "from" or "from_nested" property
  from_nested: z
    .array(
      z.object({
        name: z.string().optional(),
        purpose: z.string().optional(),
        rule: z.string(),
        from: z.string(),
      })
    )
    .optional(),
  count: z.number().optional(),
  //"count", "min", and "max" may be present with a "pick" rule
});

export type PresentationDefinition = z.infer<typeof PresentationDefinition>;
export const PresentationDefinition = z.object({
  id: z.string(),
  name: z.string().optional(),
  purpose: z.string().optional(),
  input_descriptors: z.array(InputDescriptor),
  submission_requirements: z.array(SubmissionRequirement).optional(),
});

export type RequestObject = z.infer<typeof RequestObject>;
export const RequestObject = z.object({
  iss: z.string(),
  iat: UnixTime,
  exp: UnixTime,
  state: z.string(),
  nonce: z.string(),
  response_uri: z.string(),
  response_uri_method: z.string().optional(),
  response_type: z.literal("vp_token"),
  response_mode: z.literal("direct_post.jwt"),
  client_id: z.string(),
  dcql_query: z.record(z.string(), z.any()).optional(), // Validation happens within the `dcql` library, no need to duplicate it here
  scope: z.string().optional(),
  presentation_definition: PresentationDefinition.optional(),
});

export type WalletMetadata = z.infer<typeof WalletMetadata>;
export const WalletMetadata = z.object({
  presentation_definition_uri_supported: z.boolean().optional(),
  client_id_schemes_supported: z.array(z.string()).optional(),
  request_object_signing_alg_values_supported: z.array(z.string()).optional(),
  vp_formats_supported: z.record(
    z.string(), // TODO: use explicit credential format?
    z.object({
      "sd-jwt_alg_values": z.array(z.string()).optional(), // alg_values_supported?
    })
  ),
  // TODO: include other metadata?
});

/**
 * Wallet capabilities that must be submitted to get the Request Object
 * via POST request when the `request_uri_method` is `post`.
 */
export type RequestObjectWalletCapabilities = z.infer<
  typeof RequestObjectWalletCapabilities
>;
export const RequestObjectWalletCapabilities = z.object({
  wallet_metadata: WalletMetadata,
  wallet_nonce: z.string().optional(),
});
