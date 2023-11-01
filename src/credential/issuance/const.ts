import * as z from "zod";
export const ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-client-attestation";

export type SupportedCredentialFormat = z.infer<
  typeof SupportedCredentialFormat
>;
export const SupportedCredentialFormat = z.literal("vc+sd-jwt");
