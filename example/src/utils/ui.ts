import { IOIcons } from "@pagopa/io-app-design-system";
import type { SupportedCredentialsWithoutPid } from "../store/types";

export const iconByCredentialType: Record<
  SupportedCredentialsWithoutPid,
  IOIcons
> = {
  "org.iso.18013.5.1.mDL": "car",
  EuropeanDisabilityCard: "accessibility",
  EuropeanHealthInsuranceCard: "healthCard",
};

export const labelByCredentialType: Record<
  SupportedCredentialsWithoutPid,
  string
> = {
  "org.iso.18013.5.1.mDL": "MDL",
  EuropeanDisabilityCard: "DC",
  EuropeanHealthInsuranceCard: "TS",
};
